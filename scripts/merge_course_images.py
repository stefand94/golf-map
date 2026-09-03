#!/usr/bin/env python3
"""
GOLF-88 (implementation): merge scripts/output/course_images.json (written
by fetch_course_images.py) into the relevant data/courses-*.js files as a
`photo:{src,photographer,license,sourceUrl}` field per course.

Follows this project's established fetch/merge convention exactly
(merge_club_images.py is the direct precedent): idempotent — strips any
existing `photo:{...}` field for a matched course before re-adding it, so
running this script twice never duplicates or corrupts a field — and
anchors on top-level course-entry openers only
(`^\{n:"...",lat:...,lng:...`, MULTILINE), never traversing into a nested
sub-object like nearStation:{...} or clubInfo:{...}.

A course's shared-club name (trailing " (Old)"/" (Ailsa)" etc. stripped)
matches the fetched image's course name the same way merge_club_images.py
matches club logos across sibling course entries at one physical club.

Usage:
    python3 scripts/merge_course_images.py \\
        --images scripts/output/course_images.json \\
        data/courses-top100.js data/courses-scotland.js \\
        data/courses-ireland.js data/courses-southafrica.js
"""
import argparse
import json
import re
import sys

ENTRY_RE = re.compile(r'^\{n:"((?:[^"\\]|\\.)*)",lat:-?\d+\.?\d*,lng:-?\d+\.?\d*', re.MULTILINE)


def strip_parens(name):
    return re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()


def js_str(s):
    return json.dumps(s, ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--images", default="scripts/output/course_images.json")
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()

    with open(args.images) as f:
        images = json.load(f)

    # Index by exact name, and by parenthetical-stripped name (fallback,
    # for a sibling course entry sharing one club's single fetched photo —
    # same convention as merge_club_images.py).
    by_exact = {name: data for name, data in images.items()}
    by_base = {}
    for name, data in images.items():
        base = strip_parens(name)
        by_base.setdefault(base, data)

    total_matched = 0

    for path in args.files:
        with open(path) as f:
            text = f.read()

        # Idempotent: strip any pre-existing photo field before re-adding.
        text = re.sub(r',photo:\{[^}]*\}', '', text)

        matched_here, skipped_here = 0, []

        def repl(m):
            nonlocal matched_here
            name = m.group(1).replace('\\"', '"')
            data = by_exact.get(name)
            if not data:
                data = by_base.get(strip_parens(name))
            if not data:
                skipped_here.append(name)
                return m.group(0)
            matched_here += 1
            photo = (
                '{src:' + js_str(data['path']) +
                ',photographer:' + js_str(data['photographer']) +
                ',license:' + js_str(data['license']) +
                ',sourceUrl:' + js_str(data['sourceUrl']) + '}'
            )
            return m.group(0) + f',photo:{photo}'

        new_text, n = ENTRY_RE.subn(repl, text)

        with open(path, "w") as f:
            f.write(new_text)

        total_matched += matched_here
        print(f"{path}: {matched_here} of {n} course entries got a photo")

    print(f"\n{total_matched} photo fields written across {len(args.files)} file(s).")


if __name__ == "__main__":
    main()
