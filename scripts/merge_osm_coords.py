#!/usr/bin/env python3
"""GOLF-161: replace published coordinates with OpenStreetMap's, in place.

WHAT THIS IS AND IS NOT

It rewrites `lat`/`lng` on records that match an OSM golf course, and adds
`coordSrc:"osm"` plus the OSM object id so the provenance is auditable — ODbL
asks for attribution, and attribution you cannot trace is not attribution.

It does NOT touch course identity, names, array order, fees, feeV2, stations
or POIs, and it never removes a record. A course with no confident OSM match
keeps exactly the coordinate it has and is listed in the report.

WHY IT PATCHES LINE BY LINE

Identity in this app was array position until GOLF-163, and share links
already sent to other people still decode by index through the frozen table.
Rebuilding the array from a source list would re-index it and silently
repoint every one of those links. So this does a per-record textual
substitution — merge_course_stats.py's technique — and
scripts/test_course_ids.js exists to prove, after the fact, that nothing
moved. "We were careful" is not the same as "we checked".

HOW A MATCH IS DECIDED

Both a name and a distance test, and the distance test is the important one.
Golf club names repeat across the country ("Royal ...", "... Park Golf
Club"), so name similarity alone will eventually pick a club 200 miles away
and move a pin into the sea. A candidate must be within --max-shift km of
where we already think the course is; the best-scoring name inside that
radius wins, and a course whose best candidate is further than that is
reported as unmatched rather than guessed at.

Usage:
    python3 scripts/merge_osm_coords.py --regions england,scotland --dry-run
    python3 scripts/merge_osm_coords.py --regions england,scotland
    python3 scripts/merge_osm_coords.py --regions england --max-shift 3
"""

import argparse
import difflib
import json
import math
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# Which data files hold each nation's courses. London-catchment courses are
# all in England; courses-top100.js is the England Top 100 overlay.
REGION_FILES = {
    "england": ["data/courses-london.js", "data/courses-top100.js"],
    "scotland": ["data/courses-scotland.js"],
    "wales": ["data/courses-wales.js"],
    "ireland": ["data/courses-ireland.js"],
    "south-africa": ["data/courses-southafrica.js"],
}

RECORD_START = re.compile(r'(?:^|\},)\{n:"((?:[^"\\]|\\.)*)"', re.MULTILINE)
COORDS = re.compile(r',lat:(-?\d+\.?\d*),lng:(-?\d+\.?\d*)')
COORD_SRC = re.compile(r',coordSrc:"[^"]*"')
OSM_REF = re.compile(r',osm:"[^"]*"')

DEFAULT_MAX_SHIFT_KM = 5.0
# Two cutoffs, not one, and the reason came out of a dry run against the
# cached GOLF-121a South Africa pull: "Avion Park Golf Club" matched "Kempton
# Park Golf Course" 3.3km away on a score of 0.64, which is a different club.
# A weak name is forgivable next door and is not forgivable across town, so
# anything beyond CLOSE_KM has to clear a much higher bar.
NAME_CUTOFF = 0.62
FAR_NAME_CUTOFF = 0.80
CLOSE_KM = 1.0

# Words that carry no distinguishing information in a UK golf club name —
# stripped before comparison so "Royal Birkdale" and "Royal Birkdale Golf
# Club" score as the same club, which they are.
NOISE = re.compile(
    r"\b(golf|club|links|course|the|and|g\s*c|g\s*&\s*c\s*c|country)\b")


def _squash(s):
    s = re.sub(r"[^a-z0-9]+", " ", s.lower())
    return " ".join(NOISE.sub(" ", s).split())


def norm(name):
    """Comparable form: lowercase, qualifier dropped, noise words removed."""
    return _squash(re.sub(r"\s*\([^)]*\)\s*$", " ", name.lower()))


def norm_variants(name):
    """Every reading of a trailing parenthetical, because it is not always a
    qualifier.

    Our names use it for the course within a club — "Woodhall Spa (Hotchkin)",
    "St Andrews (Old)" — so dropping it is right. OSM uses it the other way
    round: "The National Golf Centre (Woodhall Spa)" puts the *club* in the
    brackets and the generic part outside. Dropping it there leaves "national
    centre", which matches nothing — and in the England dry run that is
    exactly how Woodhall Spa (Hotchkin) skipped the correct OSM object 40m
    away and matched RAF Woodhall Spa Golf Course, a different club 2.1km up
    the road, on the strength of a shared town name.

    So try all three readings and keep the best: without the brackets, with
    them inlined, and the bracketed text on its own.
    """
    out = [norm(name)]
    qual = re.search(r"\(([^)]*)\)\s*$", name)
    if qual:
        out.append(_squash(name))
        out.append(_squash(qual.group(1)))
    return [v for v in dict.fromkeys(out) if v]


def haversine_km(a_lat, a_lng, b_lat, b_lng):
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def top_level_coords(text, start):
    """(record_end, coords_match) — coords found at brace depth 1 only, so a
    nested nearStation's lat/lng is never mistaken for the course's own."""
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


def load_osm(region):
    path = os.path.join(HERE, "output", f"osm_golf_{region}.json")
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except OSError:
        raise SystemExit(
            f"no OSM data for {region} — run:\n"
            f"    python3 scripts/fetch_osm_golf_courses.py {region}")
    for c in data["courses"]:
        c["_norm"] = norm_variants(c["name"])
        c["_alt"] = [v for a in c.get("alt_names") or [] for v in norm_variants(a)]
    return data


def best_match(name, lat, lng, candidates, max_shift):
    """The nearest-by-name candidate within max_shift km, or (None, reason).

    The radius gate comes first deliberately. Scoring names across the whole
    country and then checking distance finds a plausible-looking wrong answer
    and has to reject it; scoring only nearby clubs cannot produce one.
    """
    near = []
    nearest_km = None
    for c in candidates:
        d = haversine_km(lat, lng, c["lat"], c["lng"])
        if nearest_km is None or d < nearest_km:
            nearest_km = d
        if d <= max_shift:
            near.append((c, d))
    if not near:
        return None, (f"nothing within {max_shift:g}km"
                      + (f" (nearest OSM course {nearest_km:.1f}km away)"
                         if nearest_km is not None else ""))
    wants = norm_variants(name)
    scored = []
    for c, d in near:
        score = max([difflib.SequenceMatcher(None, w, n).ratio()
                     for w in wants for n in c["_norm"] + c["_alt"]] or [0.0])
        scored.append((score, -d, c, d))
    scored.sort(reverse=True)

    # A plausible course sitting on top of the coordinate we already hold
    # beats a better-spelled one across town, always. The coordinate we hold
    # came from a real directory and is roughly right; the question this
    # script answers is "which OSM object is this course", and at 40m there
    # is no real doubt. Without this, a shared town name is enough for a
    # neighbouring club to win on string similarity alone — which is how
    # Woodhall Spa picked up RAF Woodhall Spa's position in the dry run.
    close = [s for s in scored if s[3] <= CLOSE_KM and s[0] >= NAME_CUTOFF]
    score, _, c, d = (close or scored)[0]
    if score < NAME_CUTOFF:
        return None, (f"best nearby name only {score:.2f} "
                      f"({c['name']!r} at {d:.1f}km)")
    if d > CLOSE_KM and score < FAR_NAME_CUTOFF:
        return None, (f"{c['name']!r} is {d:.1f}km away and only scores "
                      f"{score:.2f} — too weak to move a pin that far")
    return (c, d, score), None


def scan_file(rel, region, osm, max_shift, report):
    """Propose a match per record. Nothing is written here — contention
    between records has to be resolved across the whole region first."""
    path = os.path.join(ROOT, rel)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()

    proposals = []
    for m in RECORD_START.finditer(text):
        name = m.group(1)
        start = text.index("{", m.start())
        end, coords = top_level_coords(text, start)
        if not coords:
            report["skipped"].append((rel, name, "no top-level lat/lng"))
            continue
        lat, lng = float(coords.group(1)), float(coords.group(2))
        hit, why = best_match(name, lat, lng, osm["courses"], max_shift)
        if not hit:
            report["unmatched"].append((region, name, why))
            continue
        c, d, score = hit
        if abs(c["lat"] - lat) < 1e-6 and abs(c["lng"] - lng) < 1e-6:
            report["already"].append((region, name))
            continue
        proposals.append({
            "file": rel, "region": region, "name": name, "start": start,
            "end": end, "coords": coords, "osm": c, "km": d, "score": score,
        })
    return text, proposals


def drop_contested(proposals, report):
    """One OSM object may back at most one course.

    Found in a dry run against the cached South Africa data: Fancourt's three
    courses — The Links, Montagu and Outeniqua — all matched the single OSM
    object "The Links at Fancourt", which would have collapsed three distinct
    courses onto one pin. Multi-course venues are common and OSM often maps
    the venue rather than each course, so this is the normal case, not an
    edge one.

    Nothing is guessed: every contested record keeps the coordinate it has
    and is reported. Picking the best scorer would move one course and leave
    its siblings behind, which is a worse outcome than leaving all three as
    they are.
    """
    by_osm = defaultdict(list)
    for p in proposals:
        by_osm[p["osm"]["osm"]].append(p)
    keep = []
    for ref, group in by_osm.items():
        if len(group) == 1:
            keep.append(group[0])
            continue
        report["contested"].append({
            "osm": ref, "osm_name": group[0]["osm"]["name"],
            "courses": [p["name"] for p in group],
        })
    return keep


def apply_edits(text, proposals, path):
    """Rewrite each record's coordinate pair in place, back to front."""
    for p in sorted(proposals, key=lambda x: -x["start"]):
        start, end, coords, c = p["start"], p["end"], p["coords"], p["osm"]
        record = text[start:end]
        # Both the old coordSrc and the old osm ref are stripped first so a
        # re-run cannot accumulate duplicates of either.
        record = COORD_SRC.sub("", record)
        record = OSM_REF.sub("", record)
        m = COORDS.search(record, coords.start() - start - 1)
        pair = f',lat:{c["lat"]},lng:{c["lng"]}'
        record = (record[:m.start()] + pair
                  + f',coordSrc:"osm",osm:"{c["osm"]}"' + record[m.end():])
        text = text[:start] + record + text[end:]
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regions", required=True,
                    help=f"comma-separated: {', '.join(sorted(REGION_FILES))}")
    ap.add_argument("--max-shift", type=float, default=DEFAULT_MAX_SHIFT_KM,
                    help="km; a course whose best OSM candidate is further "
                         "away is reported, never moved (default: %(default)s)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    regions = [r.strip() for r in args.regions.split(",") if r.strip()]
    unknown = [r for r in regions if r not in REGION_FILES]
    if unknown:
        raise SystemExit(f"unknown region(s): {unknown}")

    osm_by_region = {r: load_osm(r) for r in regions}
    for r in regions:
        print(f"{r}: {osm_by_region[r]['count']} OSM courses "
              f"(fetched {osm_by_region[r]['fetched_at']})")

    # Every file in REGION_FILES[r] belongs wholly to r — the nations are in
    # separate files, so no per-record classification is needed.
    file_region = {}
    for r in regions:
        for f in REGION_FILES[r]:
            file_region[f] = r

    report = defaultdict(list)
    scanned = {}
    proposals = []
    for rel, region in sorted(file_region.items()):
        text, props = scan_file(rel, region, osm_by_region[region],
                                args.max_shift, report)
        scanned[rel] = text
        proposals.extend(props)

    # Contention is resolved across all files at once: a venue's courses can
    # sit in two different files (a London-catchment course and its Top 100
    # twin), and a per-file check would miss exactly that pair.
    proposals = drop_contested(proposals, report)

    by_file = defaultdict(list)
    for p in proposals:
        by_file[p["file"]].append(p)
        report["moved"].append((p["region"], p["name"], p["osm"]["name"],
                                p["km"], p["score"]))
    for rel in sorted(file_region):
        n = len(by_file.get(rel, ()))
        print(f"  {rel:32} {n} coordinate(s) {'would move' if args.dry_run else 'moved'}")
        if n and not args.dry_run:
            apply_edits(scanned[rel], by_file[rel], os.path.join(ROOT, rel))

    moved = report["moved"]
    if moved:
        shifts = sorted(d for _, _, _, d, _ in moved)
        print(f"\n{len(moved)} coordinates re-sourced from OpenStreetMap. "
              f"Shift: median {shifts[len(shifts)//2]:.2f}km, max {shifts[-1]:.2f}km")
        # The largest shifts are where a wrong match would show up, so they are
        # printed rather than summarised — a plausible count is exactly what a
        # bad mapping would also produce.
        print("largest moves (eyeball these — a wrong match looks like a big one):")
        for region, ours, theirs, d, score in sorted(moved, key=lambda x: -x[3])[:12]:
            same = "" if norm(ours) == norm(theirs) else f'  <- OSM calls it "{theirs}"'
            print(f"    {d:6.2f}km  {score:.2f}  {region:9} {ours}{same}")
    if report["contested"]:
        print(f"\n{len(report['contested'])} OSM object(s) claimed by more than one "
              f"course — all of them left alone (a multi-course venue that OSM "
              f"maps once; moving one course and not its siblings is worse than "
              f"moving none):")
        for c in report["contested"][:10]:
            print(f"    {c['osm_name']!r} <- {', '.join(c['courses'])}")
        if len(report["contested"]) > 10:
            print(f"    ... and {len(report['contested']) - 10} more")
    print(f"\n{len(report['already'])} already matched OSM exactly (unchanged)")
    print(f"{len(report['unmatched'])} had no confident match — coordinate left as it was:")
    for region, name, why in report["unmatched"][:20]:
        print(f"    {region:9} {name} — {why}")
    if len(report["unmatched"]) > 20:
        print(f"    ... and {len(report['unmatched']) - 20} more")
    for rel, name, why in report["skipped"]:
        print(f"  ! skipped {rel} {name}: {why}", file=sys.stderr)

    out = os.path.join(HERE, "output", "osm_coord_merge_report.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({k: v for k, v in report.items()}, fh, indent=1, ensure_ascii=False)
    print(f"\nFull report: scripts/output/osm_coord_merge_report.json")
    if args.dry_run:
        print("--dry-run, nothing written.")
    else:
        print("Now run: node scripts/test_course_ids.js && node scripts/test_data.js "
              "&& node scripts/test_fee_v2.js")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
