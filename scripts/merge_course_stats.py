#!/usr/bin/env python3
"""
GOLF-12/13: merges fetch_course_stats.py's output into a data/courses-*.js
file as a `courseStats:{par,slope,rating}` field, which is what unlocks
pre-filled values in the Course Handicap calculator (calcHTML() in
london-golf-map-v5_1.html already renders manual-entry fields when this
is absent, so an unmatched course just keeps working as before — this
never breaks anything, only adds data where we have it).

Matching, course entry -> API course record:
  1. Strip any "(Old)"/"(Hotchkin)"/etc. qualifier to get the base club
     name, look it up in course_stats.json.
  2. Only consider API course records that actually have tee_sets (the
     API's own data has some null/empty duplicates — a data-quality
     property of the source, not something we can fix upstream).
  3. If our entry had a qualifier, fuzzy-match it against the remaining
     candidates' names (difflib) to pick the right one (e.g. "(Old)" ->
     "Moor Park-High Course" is a bad fuzzy match — but "(High)" issue
     doesn't occur in our data; qualifiers here are typically the course's
     own name like "(Hotchkin)", "(Old)", "(Brabazon)").
  4. Otherwise take the candidate with the most tee_sets (a proxy for
     "the fuller/more complete record" when the source has duplicates).

Tee set -> par/slope/rating: prefers "White" (the standard men's
reference tee most UK scorecards quote first), then "Yellow", then
whichever tee set comes first.

Usage:
    python3 scripts/merge_course_stats.py data/courses-top100.js \\
        --stats scripts/output/course_stats.json
    python3 scripts/merge_course_stats.py data/courses-london.js \\
        --stats scripts/output/course_stats.json
"""
import argparse
import difflib
import json
import re

TEE_PREFERENCE = ["White", "Yellow"]


def base_name(name):
    return re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()


def qualifier(name):
    m = re.search(r"\(([^)]*)\)\s*$", name)
    return m.group(1) if m else None


def pick_course(candidates, qual):
    usable = [c for c in candidates if c.get("tee_sets")]
    if not usable:
        return None
    if qual and len(usable) > 1:
        names = [c["name"] or "" for c in usable]
        best = difflib.get_close_matches(qual, names, n=1, cutoff=0.3)
        if best:
            return next(c for c in usable if c["name"] == best[0])
    return max(usable, key=lambda c: len(c.get("tee_sets", [])))


def pick_tee(tee_sets):
    by_name = {t["name"]: t for t in tee_sets if t.get("name")}
    for pref in TEE_PREFERENCE:
        if pref in by_name:
            return by_name[pref]
    return tee_sets[0]


def esc_js(s):
    return str(s)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("infile")
    parser.add_argument("--stats", required=True)
    args = parser.parse_args()

    with open(args.stats) as f:
        stats = json.load(f)
    with open(args.infile) as f:
        text = f.read()

    text = re.sub(r',courseStats:\{[^}]*\}', '', text)

    matched, skipped = 0, []

    def repl(m):
        nonlocal matched
        name = m.group(1).replace('\\"', '"')
        base = base_name(name)
        entry = stats.get(base)
        if not entry:
            skipped.append(name)
            return m.group(0)
        course = pick_course(entry.get("courses", []), qualifier(name))
        if not course:
            skipped.append(name)
            return m.group(0)
        tee = pick_tee(course["tee_sets"])
        par = course.get("par") or tee.get("par")
        slope, rating = tee.get("slope_rating"), tee.get("course_rating")
        if par is None or slope is None or rating is None:
            skipped.append(name)
            return m.group(0)
        matched += 1
        return m.group(0) + f',courseStats:{{par:{par},slope:{slope},rating:{rating}}}'

    pattern = re.compile(r'^\{n:"((?:[^"\\]|\\.)*)",lat:-?\d+\.?\d*,lng:-?\d+\.?\d*', re.MULTILINE)
    new_text, n = pattern.subn(repl, text)

    with open(args.infile, "w") as f:
        f.write(new_text)
    print(f"Merged courseStats into {matched} of {n} course entries in {args.infile}")
    if skipped:
        print(f"No usable stats for: {skipped}")


if __name__ == "__main__":
    main()
