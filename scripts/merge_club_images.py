#!/usr/bin/env python3
"""
GOLF-21: merge fetch_club_images.py's name -> image-path mapping into a
data/courses-*.js file as a `logo:"images/clubs/....jpg"` field, keyed by
course name with any trailing "(Old)"/"(Hotchkin)"/etc. qualifier stripped
(same convention as merge_club_details.py, since several Top 100 entries
share one physical club and its one logo).

Usage:
    python3 scripts/merge_club_images.py data/courses-top100.js \\
        --images scripts/output/club_images.json

Edits the file in place. Idempotent: replaces any existing `logo` field.
"""
import argparse
import json
import re


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("infile")
    parser.add_argument("--images", required=True)
    args = parser.parse_args()

    with open(args.images) as f:
        images = json.load(f)  # base club name -> relative image path
    with open(args.infile) as f:
        text = f.read()

    text = re.sub(r',logo:"[^"]*"', '', text)

    matched, skipped = 0, []

    def repl(m):
        nonlocal matched
        name = m.group(1).replace('\\"', '"')
        base = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
        path = images.get(base)
        if not path:
            skipped.append(name)
            return m.group(0)
        matched += 1
        return m.group(0) + f',logo:"{path}"'

    # ^-anchored so this only matches a course entry's own {n:...,lat:...,lng:...}
    # opener, not a nested nearStation:{n:...,lat:...,lng:...} sub-object.
    pattern = re.compile(r'^\{n:"((?:[^"\\]|\\.)*)",lat:-?\d+\.?\d*,lng:-?\d+\.?\d*', re.MULTILINE)
    new_text, n = pattern.subn(repl, text)

    with open(args.infile, "w") as f:
        f.write(new_text)
    print(f"Merged logo into {matched} of {n} course entries in {args.infile}")
    if skipped:
        print(f"No image for: {skipped}")


if __name__ == "__main__":
    main()
