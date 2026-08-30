#!/usr/bin/env python3
"""
GOLF-77: look up golf clubs against Golf Ireland's public "Find a club"
club-finder API. Same undocumented-but-public, unauthenticated API shape
as England Golf/Scottish Golf/Wales Golf's (all run on the "DotGolf"
white-label platform, confirmed live via the Browser tool by inspecting
network traffic on golfireland.ie — same endpoint names, same response
fields, verified directly:
  POST https://www.golfireland.ie/api/clubs/FindClubs        (382 clubs live)
  GET  https://www.golfireland.ie/api/clubs/GetClubsByName?name=...
  GET  https://www.golfireland.ie/api/clubs/GetClubDetails?clubId=...
This is a straight copy of fetch_scottish_golf_clubs.py with BASE swapped;
see that script's / fetch_england_golf_clubs.py's docstrings for endpoint
details this mirrors exactly.

Input: a JSON file mapping a stable key -> the club name to search for, e.g.:
    {"royal-county-down": "Royal County Down Golf Club", ...}

Output: writes scripts/output/ireland_golf_clubs.json — same shape as
england_golf_clubs.json / scottish_golf_clubs.json, so merge_club_details.py
/ merge_club_images.py work against it unchanged.

Usage:
    python3 scripts/fetch_ireland_golf_clubs.py --names-file names.json \\
        [--out scripts/output/ireland_golf_clubs.json]

Refresh cadence: manual/on-demand only.
"""
import argparse
import datetime
import difflib
import json
import os
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://www.golfireland.ie/api/clubs"


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


def best_candidate(name, candidates):
    def score(cand):
        cname = (cand.get("ClubName") or "").lower()
        return difflib.SequenceMatcher(None, name.lower(), cname).ratio()

    return max(candidates, key=score)


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
    parser.add_argument("--out", default="scripts/output/ireland_golf_clubs.json")
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

        chosen = best_candidate(name, candidates)
        club_id = chosen.get("ClubId")
        details = get_club_details(club_id) if club_id else None
        time.sleep(args.delay)

        results[key] = {
            "query": name,
            "club_id": club_id,
            "matched_name": chosen.get("ClubName"),
            "candidates_found": len(candidates),
            "details": details,
        }

    out = {
        "fetched_at": datetime.date.today().isoformat(),
        "source": f"{BASE} (Golf Ireland Find a Club, undocumented public API)",
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


if __name__ == "__main__":
    main()
