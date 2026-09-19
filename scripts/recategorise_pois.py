#!/usr/bin/env python3
"""Re-run categorise() and scoring over an already-fetched POI file.

The point of this script is that a wrong CATEGORY_RULES entry should cost a
few seconds, not a re-fetch. fetch_pois.py keeps every tag its rules read
(KEEP_TAGS), so the saved JSON has enough in it to answer "what category is
this?" again without asking Overpass a second time for data it already sent.

Only works on files written by a fetch that kept the category tags. Files from
before that change kept the scoring tags alone; this script detects that and
says so rather than silently recategorising everything to "Attraction".

  python3 scripts/recategorise_pois.py scripts/output/pois_raw.json
  python3 scripts/recategorise_pois.py in.json --out out.json --dry-run
"""

import argparse
import importlib.util
import json
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--out", help="default: overwrite the input file")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    spec = importlib.util.spec_from_file_location("fp", os.path.join(HERE, "fetch_pois.py"))
    fp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fp)

    pois = json.load(open(args.path, encoding="utf-8"))
    if not pois:
        raise SystemExit("file is empty")

    # A file fetched before KEEP_TAGS existed has none of the category keys on
    # any record. Recategorising it would send every record to the "Attraction"
    # fallback and look like a successful run, so refuse instead.
    cat_keys = set(fp.CATEGORY_TAGS)
    if not any(cat_keys & set(p.get("tags") or {}) for p in pois):
        raise SystemExit(
            f"{args.path} carries no category tags — it predates KEEP_TAGS, so "
            "its categories cannot be recomputed. Re-fetch it instead."
        )

    changes = Counter()
    for p in pois:
        tags = p.get("tags") or {}
        new = fp.categorise(tags)
        if new != p["category"]:
            changes[(p["category"], new)] += 1
            p["category"] = new
        # Scoring depends on the category, so it has to follow it.
        p["bonus"] = fp.tag_bonus(tags)
        p["score"] = fp.CATEGORY_BASE.get(new, 5) + p.get("sitelinks", 0) + p["bonus"]

    if not changes:
        print(f"{len(pois)} records, no category changed.")
    else:
        print(f"{len(pois)} records, {sum(changes.values())} recategorised:")
        for (old, new), n in changes.most_common():
            print(f"  {n:>6}  {old} -> {new}")

    if args.dry_run:
        print("\n--dry-run, nothing written.")
        return
    out = args.out or args.path
    pois.sort(key=lambda p: (-p["score"], p["name"]))
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(pois, fh, ensure_ascii=False, indent=1)
    print(f"\nWrote {len(pois)} -> {out}")


if __name__ == "__main__":
    main()
