#!/usr/bin/env python3
"""
GOLF-78: look up golf clubs against Handicap Network Africa's public
"Find and play" club-finder (handicaps.co.za) — South African golf's
handicapping body, the SA equivalent of England Golf/Scottish Golf/Wales
Golf/Golf Ireland. Confirmed live via the Browser tool by inspecting
network traffic on handicaps.co.za/find-and-play.

Unlike the England/Scotland/Wales/Ireland DotGolf sites (a single
GetClubsByName(name) -> GetClubDetails(clubId) pair), this site's search
API is location/radius-based, not name-based, so it needs a different
two-step lookup:

  1. POST /api/clubs/GetClubHierarchies {} (no params) — returns EVERY
     club nationally (449 at last run) with just {ClubID, ClubName,
     RegionName, ...}, no coordinates. Fetched once per run and matched
     client-side against the requested names (best-match via difflib,
     same convention as the other nations' scripts).
  2. POST /api/clubs/FindClubs {"clubId": <id>, "pageNumber":1,
     "pageSize":10} — returns that one club's full record, INCLUDING
     Latitude/Longitude, Phone, Website, LogoImage, TeeBookingUrl,
     MembershipUrl etc. — the exact same field set as the DotGolf sites,
     so merge_club_details.py / merge_club_images.py need no changes.
     (Confirmed live: no per-club "View Details" page call needed —
     coordinates come back directly from FindClubs.)

Input: a JSON file mapping a stable key -> the club name to search for,
e.g. {"fancourt": "Fancourt Country Club", ...} — same shape as every
other nation's names file.

Output: writes scripts/output/south_africa_golf_clubs.json — same shape
as england_golf_clubs.json (a "clubs" dict of {query, club_id,
matched_name, candidates_found, details}), so the existing merge scripts
work against it unchanged.

Usage:
    python3 scripts/fetch_south_africa_golf_clubs.py \\
        --names-file scripts/output/southafrica_names.json \\
        --out scripts/output/south_africa_golf_clubs.json

Refresh cadence: manual/on-demand only. No fee/access/architect/note
data exists in this API at all (unlike the DotGolf sites, which are also
silent on those fields for the UK/Ireland nations) — that content is
still hand-curated the same way Scotland/Wales/Ireland's was.
"""
import argparse
import datetime
import difflib
import json
import os
import sys
import time
import urllib.request

BASE = "https://www.handicaps.co.za/api/clubs"


def post_json(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def get_hierarchy():
    """One call, returns every club nationally: [{ClubID, ClubName, RegionName, ...}, ...]"""
    return post_json(f"{BASE}/GetClubHierarchies", {})


def best_candidate(name, candidates):
    def score(cand):
        cname = (cand.get("ClubName") or "").lower()
        return difflib.SequenceMatcher(None, name.lower(), cname).ratio()

    return max(candidates, key=score)


def get_club_details(club_id):
    try:
        data = post_json(f"{BASE}/FindClubs", {"clubId": club_id, "pageNumber": 1, "pageSize": 10})
        return data[0] if isinstance(data, list) and data else None
    except Exception as e:
        print(f"  ! FindClubs failed for clubId={club_id}: {e}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--names-file", required=True, help="JSON file: {key: 'club name to search'}")
    parser.add_argument("--out", default="scripts/output/south_africa_golf_clubs.json")
    parser.add_argument("--delay", type=float, default=0.2, help="Seconds between FindClubs requests")
    args = parser.parse_args()

    with open(args.names_file) as f:
        names = json.load(f)

    print("Fetching national club hierarchy (one call, ~450 clubs)...")
    hierarchy = get_hierarchy()
    print(f"  got {len(hierarchy)} clubs nationally")

    results = {}
    manual_review = []

    for key, name in names.items():
        print(f"Matching: {key} -> '{name}'")
        candidates = [c for c in hierarchy if c.get("ClubName")]
        if not candidates:
            manual_review.append(key)
            results[key] = {"query": name, "club_id": None, "details": None}
            continue

        chosen = best_candidate(name, candidates)
        club_id = chosen.get("ClubID")
        details = get_club_details(club_id) if club_id else None
        time.sleep(args.delay)

        results[key] = {
            "query": name,
            "club_id": club_id,
            "matched_name": chosen.get("ClubName"),
            "region_hint": chosen.get("RegionName"),
            "candidates_found": len(candidates),
            "details": details,
        }
        if not details:
            manual_review.append(key)

    out = {
        "fetched_at": datetime.date.today().isoformat(),
        "source": f"{BASE} (Handicap Network Africa Find and Play, undocumented public API)",
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
