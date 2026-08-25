#!/usr/bin/env python3
"""
GOLF-11: merge England Golf club-finder details (phone, membership/tee-booking
links, a short facility blurb) into a data/courses-*.js file, keyed by course
name with any trailing "(Old)"/"(Hotchkin)"/etc. course qualifier stripped —
several Top 100 entries share one physical club (Sunningdale Old/New, Walton
Heath Old/New, Saunton East/West, The Berkshire Red/Blue) and get the same
club-level details.

Note on scope: England Golf's per-club `FacilityTypes`/amenity-icon data was
expected (per the original GOLF-11 plan) to be populated on GetClubDetails,
but a spot check across ~95 clubs found it consistently null — it's not
actually returned there. So this only merges phone/membership/booking/blurb,
not amenity icons; see scripts/README.md. `LogoImage`/`ClubImageBannerUrl`
are also skipped deliberately — they're raw base64 image blobs averaging
~470KB each, which would bloat data/courses-top100.js by tens of MB if
embedded; a real image pipeline (fetch once, save as actual files, reference
by URL) would be a separate ticket.

Usage:
    python3 scripts/merge_club_details.py data/courses-top100.js \\
        --clubs scripts/output/england_golf_clubs.json

Edits the file in place. Idempotent: replaces any existing `clubInfo` field.
"""
import argparse
import json
import re


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def esc_js(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("infile")
    parser.add_argument("--clubs", required=True)
    args = parser.parse_args()

    with open(args.clubs) as f:
        clubs = json.load(f)["clubs"]
    with open(args.infile) as f:
        text = f.read()

    text = re.sub(r',clubInfo:\{[^}]*\}', '', text)

    matched, skipped = 0, []

    def repl(m):
        nonlocal matched
        name = m.group(1).replace('\\"', '"')
        base = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
        entry = clubs.get(slug(base))
        details = entry.get("details") if entry else None
        if not details:
            skipped.append(name)
            return m.group(0)
        fields = []
        if details.get("Phone"):
            fields.append(f'phone:"{esc_js(details["Phone"])}"')
        if details.get("MembershipUrl") and details["MembershipUrl"] not in ("http:///", ""):
            fields.append(f'membership:"{esc_js(details["MembershipUrl"])}"')
        if details.get("TeeBookingUrl") and details["TeeBookingUrl"] not in ("http:///", ""):
            fields.append(f'teeBooking:"{esc_js(details["TeeBookingUrl"])}"')
        if details.get("FacilityDescription"):
            fields.append(f'blurb:"{esc_js(details["FacilityDescription"])}"')
        if not fields:
            skipped.append(name)
            return m.group(0)
        matched += 1
        return m.group(0) + f',clubInfo:{{{",".join(fields)}}}'

    # ^-anchored so this only matches a course entry's own {n:...,lat:...,lng:...}
    # opener, not a nested nearStation:{n:...,lat:...,lng:...} sub-object.
    pattern = re.compile(r'^\{n:"((?:[^"\\]|\\.)*)",lat:-?\d+\.?\d*,lng:-?\d+\.?\d*', re.MULTILINE)
    new_text, n = pattern.subn(repl, text)

    with open(args.infile, "w") as f:
        f.write(new_text)
    print(f"Merged clubInfo into {matched} of {n} course entries in {args.infile}")
    if skipped:
        print(f"No usable details for: {skipped}")


if __name__ == "__main__":
    main()
