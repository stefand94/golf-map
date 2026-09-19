#!/usr/bin/env python3
"""Re-run the Wikidata notability pass over an already-fetched POI file.

Sitelink counts are the ranking. If the scoring pass is rate-limited — which
Wikidata does readily — the affected ids score 0, and 0 is indistinguishable
from "genuinely obscure". The dataset still looks complete; it is just sorted
wrongly. That happened on the first full run: 316 of 366 batches lost to 429.

The Wikidata ids live in the saved JSON, so fixing this costs one scoring pass
rather than a re-fetch.

  python3 scripts/score_pois.py scripts/output/pois_raw.json
  python3 scripts/score_pois.py in.json --out out.json --only-missing
"""

import argparse
import importlib.util
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--out", help="default: overwrite the input file")
    ap.add_argument("--only-missing", action="store_true",
                    help="only re-resolve ids currently scoring 0, to repair a "
                         "partly rate-limited run without redoing the rest")
    args = ap.parse_args()

    spec = importlib.util.spec_from_file_location(
        "fp", os.path.join(HERE, "fetch_pois.py"))
    fp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fp)

    pois = json.load(open(args.path, encoding="utf-8"))
    if not pois:
        raise SystemExit("file is empty")

    targets = pois
    if args.only_missing:
        targets = [p for p in pois
                   if p.get("wikidata") and not p.get("sitelinks")]
        if not targets:
            print("Nothing scoring 0 has a Wikidata id — nothing to do.")
            return
        print(f"{len(targets)} of {len(pois)} records have a Wikidata id but "
              f"score 0; re-resolving just those.")

    counts = fp.add_sitelinks(targets)

    changed = 0
    for p in pois:
        qid = p.get("wikidata") or ""
        if qid not in counts:
            continue  # not in this pass; leave whatever it already had
        new = counts[qid]
        if new != p.get("sitelinks"):
            changed += 1
        p["sitelinks"] = new
        p["score"] = fp.CATEGORY_BASE.get(p["category"], 5) + new + p.get("bonus", 0)

    print(f"\n{changed} records rescored.")
    out = args.out or args.path
    pois.sort(key=lambda p: (-p["score"], p["name"]))
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(pois, fh, ensure_ascii=False, indent=1)
    print(f"Wrote {len(pois)} -> {out}")


if __name__ == "__main__":
    main()
