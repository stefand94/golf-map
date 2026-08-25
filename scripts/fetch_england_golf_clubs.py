#!/usr/bin/env python3
"""
Look up golf clubs against England Golf's public "Find and Play" club-finder
API. Used to source coordinates, website, and (optionally) contact/amenity
data for named clubs — originally used for the 100 "England Top 100" clubs.

This is an undocumented but public, unauthenticated API that powers England
Golf's own site (https://www.englandgolf.org/find-and-play). Endpoints used:

  GET  /api/clubs/GetClubsByName?name={query}
       Lightweight name search -> list of {id, name, ...} candidates.

  GET  /api/clubs/GetClubDetails?clubId={id}
       Full details for one club: address, lat/lng, phone, website,
       FacilityTypes/Icons (amenities), logo/banner image URLs, etc.

  GET  /api/clubs/GetRegionsForFindAndPlay
       County/region list (reference data, not fetched by default here).

  GET  /api/clubs/GetFacilityTypes?facilityTypeGroupId=1
       Facility-type taxonomy, including an IsWHSRated flag per type.

Input: a JSON file mapping a stable key -> the club name to search for, e.g.:
    {"royal-st-georges": "Royal St George's Golf Club", ...}
A starter file is NOT checked in (the actual Top 100 list of 100 names lives
in data.js already, having been resolved once) — pass your own --names-file
when re-running this for a new batch of clubs.

Output: writes scripts/output/england_golf_clubs.json with one entry per
input key: the resolved club id (or null + a "manual_review" flag if the
name search found nothing usable), plus the full GetClubDetails payload.

Usage:
    python3 scripts/fetch_england_golf_clubs.py --names-file names.json \\
        [--out scripts/output/england_golf_clubs.json]

Refresh cadence: manual/on-demand only.
"""
import argparse
import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://www.englandgolf.org/api/clubs"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def search_by_name(name):
    url = f"{BASE}/GetClubsByName?name={urllib.parse.quote(name)}"
    try:
        return fetch_json(url)
    except Exception as e:
        print(f"  ! search failed for '{name}': {e}", file=sys.stderr)
        return None


def get_club_details(club_id):
    url = f"{BASE}/GetClubDetails?clubId={club_id}"
    try:
        return fetch_json(url)
    except Exception as e:
        print(f"  ! details fetch failed for clubId={club_id}: {e}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--names-file",
        required=True,
        help="JSON file: {key: 'club name to search'}",
    )
    parser.add_argument("--out", default="scripts/output/england_golf_clubs.json")
    parser.add_argument(
        "--delay", type=float, default=0.3, help="Seconds between requests (be polite)"
    )
    args = parser.parse_args()

    with open(args.names_file) as f:
        names = json.load(f)

    results = {}
    manual_review = []

    for key, name in names.items():
        print(f"Searching: {key} -> '{name}'")
        candidates = search_by_name(name)
        time.sleep(args.delay)

        if not candidates:
            print(f"  ! no candidates for '{name}' — needs manual review "
                  f"(try a shorter/simpler search term, e.g. drop 'Golf Club' suffix)")
            manual_review.append(key)
            results[key] = {"query": name, "club_id": None, "details": None}
            continue

        club_id = candidates[0].get("id") or candidates[0].get("Id")
        details = get_club_details(club_id) if club_id else None
        time.sleep(args.delay)

        results[key] = {
            "query": name,
            "club_id": club_id,
            "candidates_found": len(candidates),
            "details": details,
        }

    out = {
        "fetched_at": datetime.date.today().isoformat(),
        "source": f"{BASE} (England Golf Find and Play, undocumented public API)",
        "requested": len(names),
        "resolved": len(names) - len(manual_review),
        "manual_review_needed": manual_review,
        "clubs": results,
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)

    print(f"\nWrote {len(results)} entries to {args.out}")
    if manual_review:
        print(f"{len(manual_review)} needed manual review: {manual_review}")
        print("(Known past cases: exact club names sometimes miss — try dropping "
              "'Golf Club', dropping apostrophes, or using a well-known alt name. "
              "A club genuinely absent from the directory, e.g. Swinley Forest, "
              "needs an alternative source such as api.postcodes.io.)")


if __name__ == "__main__":
    main()
