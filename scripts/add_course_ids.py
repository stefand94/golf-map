#!/usr/bin/env python3
"""GOLF-163 step 1: give every course a stable `id`, reordering nothing.

WHY THIS EXISTS

Course identity in this app is *array position*. `TRIP` is a Set of indices,
`tripDays[].items[].i` is an index, `EDITS`/`PLAYED`/`WANT` are keyed by
index — and, critically, `tripBuildSharePayload()` writes indices into the
`#share=` hash. The first four live in the visitor's own browser and can be
migrated on load. Share links cannot: they are URLs already sent to other
people, frozen and outside our control. Re-order `C` and an old link renders
a *different* set of courses, silently, with no error anywhere.

So before any re-pull or reorder (GOLF-161, GOLF-162) is safe, every record
needs an identity that does not move.

WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT

It appends `id:"..."` to each record, in place, with a `re.subn` over the
one-record-per-line text — the same technique as merge_course_stats.py, for
the same reason. It does NOT parse the array and re-serialise it: that would
rewrite every line, produce an unreviewable diff, and reintroduce exactly the
reordering risk this ticket exists to remove. The anchor is the record's
`{n:"...",lat:...,lng:...` prefix and the insertion goes immediately after
it, leaving that prefix untouched so merge_course_stats.py and the other
mergers keep matching.

HOW THE ID IS DERIVED, AND WHY IT IS THEN FROZEN

Slug of the name, plus four hex of sha1(name|lat|lng) to disambiguate the
genuine duplicates (multi-course venues like Randpark's Firethorn and
Bushwillow, Turnberry's several). Derivation only ever runs *once*: from the
moment the id is written into the data file it is data, not a function of the
name and coordinates. That matters because GOLF-161 is about to move
coordinates, and a rename or a corrected coordinate must not change identity.
A re-run therefore preserves every id it finds and only mints ids for records
that have none.

Usage:
    python3 scripts/add_course_ids.py                     # all data files
    python3 scripts/add_course_ids.py --dry-run
    python3 scripts/add_course_ids.py data/courses-wales.js
"""

import argparse
import hashlib
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# The load order the page uses (london-golf-map-v5_1.html), which is also the
# order the arrays are pushed onto C — so walking these files in this order
# walks C from index 0. The frozen table below depends on that.
DATA_FILES = [
    "data/courses-london.js",
    "data/courses-top100.js",
    "data/courses-scotland.js",
    "data/courses-wales.js",
    "data/courses-ireland.js",
    "data/courses-southafrica.js",
]

FROZEN_TABLE = "data/course-ids.js"

# Finding records is fiddlier than the other merge scripts suggest, and every
# bit of that fiddliness was found by getting it wrong first:
#
#   * merge_course_stats.py anchors on `^{n:"...",lat:,lng:` as one contiguous
#     prefix. That prefix is no longer universal — the GOLF-120 fee-schema
#     migration inserted `fee:{...}` between the name and the coordinates, so
#     all 114 top100 records and most Scottish ones fail it.
#   * "one record per line" is very nearly true and not quite: Scotland's
#     Lundin and Askernish share line 90. A line-based reader silently loses
#     exactly one course out of 879, which is the kind of miss that shows up
#     later as a wrong pin rather than an error.
#   * `{n:"` is not a record marker on its own — `nearStation:{n:"..."}` has
#     the same three characters. A record start is `{n:"` at the start of a
#     line or immediately after `},`.
#   * nested objects carry their own lat/lng (`nearStation`, and POI-ish
#     blobs), so the coordinates are found by brace depth, not by "the first
#     lat: on the line".
RECORD_START = re.compile(r'(?:^|\},)\{n:"((?:[^"\\]|\\.)*)"', re.MULTILINE)
COORDS = re.compile(r',lat:(-?\d+\.?\d*),lng:(-?\d+\.?\d*)')
HAS_ID = re.compile(r',id:"([^"]*)"')

SLUG_MAX = 40


def slugify(name):
    """ASCII, lowercase, hyphen-separated. Accents folded, not dropped."""
    folded = unicodedata.normalize("NFKD", name)
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")
    return slug[:SLUG_MAX].strip("-") or "course"


def mint(name, lat, lng):
    """Slug plus a short digest — the digest is what separates two courses
    at one venue, which a slug alone cannot do."""
    digest = hashlib.sha1(f"{name}|{lat}|{lng}".encode()).hexdigest()[:4]
    return f"{slugify(name)}-{digest}"


def top_level_span(text, start):
    """Return (record_end, [(offset, length) of top-level fields]) — actually
    just what the caller needs: the record's own `,lat:..,lng:..` match.

    Walks the record character by character tracking brace depth and string
    state, so a nested `nearStation:{n:"...",lat:..,lng:..}` is skipped rather
    than mistaken for the course's own position.
    """
    depth = 0
    i = start
    n = len(text)
    in_str = False
    coords = None
    while i < n:
        ch = text[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i + 1, coords
        elif depth == 1 and coords is None and ch == ",":
            m = COORDS.match(text, i)
            if m:
                coords = m
        i += 1
    return n, coords


def process(path, existing, dry_run):
    """Returns (ids_in_file_order, number_of_ids_added).

    Insertions are applied back to front so that each edit's offset is still
    valid when it is made.
    """
    with open(path, encoding="utf-8") as fh:
        text = fh.read()

    ids = []
    edits = []
    for m in RECORD_START.finditer(text):
        name = m.group(1)
        start = text.index("{", m.start())
        end, coords = top_level_span(text, start)
        record = text[start:end]
        found = HAS_ID.search(record)
        if found:
            # Already identified. Never re-derive: the id outlives the name and
            # the coordinates it was born from, which is the entire point.
            ids.append(found.group(1))
            continue
        if not coords:
            raise SystemExit(f"{path}: record {name!r} has no top-level lat/lng")
        lat, lng = coords.group(1), coords.group(2)
        cid = mint(name, lat, lng)
        if cid in existing:
            # Two records identical in name AND coordinates. Not a hash
            # collision — a duplicate row, which is a data defect this script
            # must not paper over with a silent suffix.
            raise SystemExit(
                f"{path}: cannot mint an id for {name!r} at {lat},{lng} — "
                f"{cid} is already taken by an identically named course at "
                f"identical coordinates. Fix the duplicate record first.")
        existing.add(cid)
        ids.append(cid)
        # Immediately after lng, which is where merge_course_stats.py appends
        # too — so the two stay compatible and neither disturbs the other's
        # anchor.
        edits.append((coords.end(), f',id:"{cid}"'))

    if not dry_run and edits:
        for at, frag in reversed(edits):
            text = text[:at] + frag + text[at:]
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    return ids, len(edits)


def write_frozen_table(all_ids, dry_run):
    """The index -> id table for the ordering as it stands TODAY.

    This is what keeps already-shared links resolvable once the array does
    eventually move. It is written once and then never regenerated — a
    regenerated table would describe the new ordering and would therefore
    decode old links to the wrong courses, which is precisely the failure it
    exists to prevent.
    """
    path = os.path.join(ROOT, FROZEN_TABLE)
    if os.path.exists(path):
        print(f"{FROZEN_TABLE} already exists — left alone (it is frozen by "
              f"design; see the comment at the top of that file).")
        return
    body = ",\n".join('"' + i + '"' for i in all_ids)
    out = (
        "/* ============================================================\n"
        "   data/course-ids.js — GOLF-163: the frozen index -> id table\n"
        "   for the course ordering as it stood on 2026-09-20.\n"
        "\n"
        "   DO NOT REGENERATE THIS FILE. It is not a description of the\n"
        "   current C[] ordering and is not meant to track it. It is the\n"
        "   only record of what an index MEANT in every share link and\n"
        "   saved trip created before ids shipped. Regenerating it after a\n"
        "   reorder would make those links decode to the wrong courses —\n"
        "   silently, which is the exact failure this table prevents.\n"
        "\n"
        "   Appending is safe and is what a future ordering change should\n"
        "   NOT do either: new courses simply have no legacy index to\n"
        "   resolve. Generated once by scripts/add_course_ids.py.\n"
        "   ============================================================ */\n"
        "\n"
        f"const COURSE_IDS_V1=[\n{body}\n];\n")
    if dry_run:
        print(f"--dry-run: would write {FROZEN_TABLE} with {len(all_ids)} ids")
        return
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(out)
    os.replace(tmp, path)
    print(f"Wrote {FROZEN_TABLE} ({len(all_ids)} ids, frozen)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*", help=f"default: {' '.join(DATA_FILES)}")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = args.files or DATA_FILES
    partial = bool(args.files)

    existing = set()
    all_ids = []
    total_added = 0
    for rel in files:
        path = rel if os.path.isabs(rel) else os.path.join(ROOT, rel)
        ids, added = process(path, existing, args.dry_run)
        all_ids.extend(ids)
        total_added += added
        print(f"  {rel:34} {len(ids):4} records, {added} new ids")

    dupes = len(all_ids) - len(set(all_ids))
    if dupes:
        raise SystemExit(f"{dupes} duplicate ids across files — refusing to continue")
    print(f"\n{len(all_ids)} courses, {len(set(all_ids))} distinct ids, "
          f"{total_added} minted this run")

    if partial:
        print("(subset of files given — not touching the frozen table)")
        return 0
    write_frozen_table(all_ids, args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
