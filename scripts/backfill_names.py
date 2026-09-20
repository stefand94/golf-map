#!/usr/bin/env python3
"""Fetch name:en for POIs already collected, by OSM id.

DEC-017 chose English labels where OSM has them: name:en if present, the
plain name otherwise. The Wales file mixes four forms — "Parc Cenedlaethol
Eryri", "Bannau Brycheiniog National Park", "Castell Biwmares / Beaumaris
Castle", "Conwy Castle" — and the inconsistency is the defect, not the
language.

The shipped files could not simply be rebuilt for this: KEEP_TAGS never
included name:en, so collect() dropped it and the saved JSON has no English
name to fall back on. But every record keeps its OSM type/id, so this asks
Overpass for those objects specifically instead of re-running 400 tiles. Fair
use matters here (DEC-016): this reuses fetch_pois.overpass(), so it inherits
the mirror rotation, backoff and dead-host retirement rather than inventing
its own.

name:en is in KEEP_TAGS from now on, so this script is a one-off repair for
data already collected, not a pipeline stage.

WHY THIS IS CHECKPOINTED (GOLF-158)

Two earlier runs made ~30 successful Overpass requests between them and kept
none of them: everything lived in memory until a single write at the end, so
stopping the job — which we had to do, because Overpass started refusing this
IP — discarded every completed query. The expensive resource here is other
people's server capacity, not our wall-clock time, so throwing away completed
work is the one thing this script must never do. Progress is written after
every query and a resumed run re-asks nothing.

  python3 scripts/backfill_names.py scripts/output/pois_raw.json \
      --regions wales,scotland,ireland,northern-ireland
  python3 scripts/backfill_names.py in.json --dry-run
  python3 scripts/backfill_names.py in.json --reset      # ignore checkpoint
"""

import argparse
import importlib.util
import json
import os
import sys
import time
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKPOINT = os.path.join(HERE, "output", "backfill_names.checkpoint.json")

# Measured, not guessed, and then corrected. overpass() POSTs, so there is no
# URL-length ceiling on the id list, and Overpass rate-limits per *request* —
# 1000 ids cost it about what 400 do. A first run at 400 needed 72 queries and
# spent nearly all its time in 429/504 backoff. A second at 2000 was the
# opposite mistake: it came from timing ONE query at 19s while a mirror
# happened to be free, and under the degraded mirror set it could not complete
# a single query in five attempts. 1000 sits between them, and checkpointing
# means guessing wrong now costs one batch rather than a run.
IDS_PER_QUERY = 1000

# The OSM element type as it appears in our "osm" field, and the Overpass
# keyword for it.
OVERPASS_KEYWORD = {"node": "node", "way": "way", "relation": "rel"}


def load_fp():
    spec = importlib.util.spec_from_file_location(
        "fp", os.path.join(HERE, "fetch_pois.py"))
    fp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fp)
    return fp


def load_checkpoint(reset):
    """Return (asked_set, names_dict) — empty when starting fresh."""
    if reset:
        return set(), {}
    try:
        with open(CHECKPOINT, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return set(), {}
    asked = set(data.get("asked") or ())
    names = dict(data.get("names") or {})
    if asked:
        print(f"Resuming: {len(asked)} ids already asked, "
              f"{len(names)} English names already found.")
    return asked, names


def save_checkpoint(asked, names):
    """Write progress atomically, so a kill mid-write cannot corrupt it."""
    os.makedirs(os.path.dirname(CHECKPOINT), exist_ok=True)
    tmp = CHECKPOINT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump({"version": 1, "asked": sorted(asked), "names": names}, fh)
    os.replace(tmp, CHECKPOINT)


def build_query(kw, batch, filtered):
    """Ask for the batch's objects, optionally only those carrying name:en.

    The filter is a large saving and changes nothing semantically: an object
    with no name:en contributes nothing to the result either way, and we mark
    every id in the batch as asked regardless of what comes back, so an absent
    object means "has no name:en" exactly as it did before. Roughly 6% of
    objects carry the tag, so the response shrinks by more than an order of
    magnitude — which is what makes these queries cheap enough to survive a
    loaded mirror. --no-filter exists because that syntax is the one thing
    here that cannot be verified offline.
    """
    sel = '["name:en"]' if filtered else ""
    return (f"[out:json][timeout:180];"
            f"{kw}(id:{','.join(batch)}){sel};out tags;")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--out", help="default: overwrite the input file")
    ap.add_argument("--regions", help="comma-separated subset, default all")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--reset", action="store_true",
                    help="discard the checkpoint and re-ask everything")
    ap.add_argument("--no-filter", action="store_true",
                    help="fetch all tags instead of only objects with name:en")
    args = ap.parse_args()

    filtered = not args.no_filter
    fp = load_fp()
    pois = json.load(open(args.path, encoding="utf-8"))

    wanted = pois
    if args.regions:
        keep = {r.strip() for r in args.regions.split(",") if r.strip()}
        unknown = keep - {p.get("region") for p in pois}
        if unknown:
            raise SystemExit(f"no records in region(s): {sorted(unknown)}")
        wanted = [p for p in pois if p.get("region") in keep]
        print(f"{len(wanted)} of {len(pois)} records in {sorted(keep)}")

    asked, names = load_checkpoint(args.reset)

    by_type = defaultdict(list)
    for p in wanted:
        osm = p.get("osm") or ""
        kind, _, oid = osm.partition("/")
        if kind in OVERPASS_KEYWORD and oid.isdigit() and osm not in asked:
            by_type[kind].append(oid)

    total = sum(len(v) for v in by_type.values())
    queries = sum((len(v) + IDS_PER_QUERY - 1) // IDS_PER_QUERY
                  for v in by_type.values())
    print(f"{total} objects still to look up in ~{queries} queries"
          + (f" ({', '.join(f'{k} {len(v)}' for k, v in sorted(by_type.items()))})"
             if by_type else "")
          + (" [name:en filter on]" if filtered else " [all tags]"))
    if args.dry_run:
        print("--dry-run, nothing fetched.")
        return
    if not total:
        print("Nothing left to fetch — applying the checkpoint as it stands.")

    done = 0
    for kind, ids in sorted(by_type.items()):
        kw = OVERPASS_KEYWORD[kind]
        for i in range(0, len(ids), IDS_PER_QUERY):
            batch = ids[i:i + IDS_PER_QUERY]
            done += 1
            label = f"{kind} ids {i + 1}-{i + len(batch)}"
            try:
                data = fp.overpass(build_query(kw, batch, filtered),
                                   f"backfill {label}")
            except fp.AllMirrorsBlocked as exc:
                print(f"\nSTOPPED: {exc}", file=sys.stderr)
                print(f"Progress is saved ({len(asked)} ids asked, "
                      f"{len(names)} names). Re-run the same command later to "
                      f"pick up exactly here — a block clears on its own "
                      f"schedule and retrying now extends it.", file=sys.stderr)
                return 2
            if not data:
                # Five attempts failed. Deliberately NOT marked asked, so a
                # later run retries it rather than silently leaving those
                # records with a local name and a file that looks complete.
                print(f"  {label}: no response after "
                      f"{fp.MAX_ATTEMPTS} attempts — left for a later run",
                      file=sys.stderr, flush=True)
                continue
            for el in data.get("elements", []):
                en = (el.get("tags") or {}).get("name:en")
                if en:
                    names[f"{el['type']}/{el['id']}"] = en
            asked.update(f"{kind}/{o}" for o in batch)
            save_checkpoint(asked, names)
            print(f"  [{done}/{queries}] {label}: {len(names)} English names "
                  f"so far (checkpointed)", flush=True)
            time.sleep(fp.TILE_PAUSE_S)

    apply_names(pois, names, args.out or args.path)
    return 0


def apply_names(pois, names, out):
    changed = Counter()
    samples = defaultdict(list)
    for p in pois:
        en = names.get(p.get("osm") or "")
        if not en or en == p["name"]:
            continue
        # Keep the original under name_local: it is the only record of what OSM
        # actually calls the place, and throwing it away would make this
        # irreversible without another fetch.
        if len(samples[p["region"]]) < 5:
            samples[p["region"]].append((p["name"], en))
        p["name_local"] = p["name"]
        p["name"] = en
        changed[p["region"]] += 1

    print(f"\n{sum(changed.values())} names replaced with name:en")
    for r, n in changed.most_common():
        print(f"  {r:18} {n}")
    # Print real before/after pairs rather than only a count: a plausible
    # count is exactly what a bad mapping would also produce, and these are
    # cheap to eyeball for the failure that matters (an English name that
    # belongs to a different place).
    print("\nsample replacements (eyeball these):")
    for r in sorted(samples):
        print(f"  {r}")
        for was, now in samples[r]:
            print(f"    {was}  ->  {now}")

    tmp = out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(pois, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, out)
    print(f"\nWrote {len(pois)} -> {out}")


if __name__ == "__main__":
    sys.exit(main() or 0)
