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

GOLF-121a: pass --all (no --names-file) to iterate every club from
GetClubHierarchies instead of matching a names list. Resumable — a re-run
skips ClubIDs already resolved in --out, so a crash mid-run just
continues. Output shape is identical (ClubID as the key).

    python3 scripts/fetch_south_africa_golf_clubs.py --all \\
        --out scripts/output/south_africa_golf_clubs_all.json

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


def run_all(args):
    """GOLF-121a: skip the names file, iterate EVERY club from
    GetClubHierarchies and FindClubs each one. Resumable — a re-run
    skips ClubIDs already present in the out file, so a crash/timeout
    partway through just continues. Output shape is identical to
    --names-file mode ({clubs: {key: {...}}}) with ClubID as the key,
    so the merge step needs no changes."""
    print("Fetching national club hierarchy (one call, ~450 clubs)...")
    hierarchy = [c for c in get_hierarchy() if c.get("ClubID") and c.get("ClubName")]
    print(f"  got {len(hierarchy)} clubs nationally")

    existing = {}
    if os.path.exists(args.out):
        with open(args.out) as f:
            existing = json.load(f).get("clubs", {})
        print(f"  resuming: {len(existing)} clubs already in {args.out}")

    results = dict(existing)
    manual_review = []
    total = len(hierarchy)
    for i, club in enumerate(hierarchy, 1):
        club_id = club.get("ClubID")
        key = str(club_id)
        if key in results and results[key].get("details"):
            continue
        name = club.get("ClubName")
        print(f"[{i}/{total}] {key} -> '{name}'")
        details = get_club_details(club_id)
        time.sleep(args.delay)
        results[key] = {
            "query": name,
            "club_id": club_id,
            "matched_name": name,
            "region_hint": club.get("RegionName"),
            "candidates_found": total,
            "details": details,
        }
        if not details:
            manual_review.append(key)
        if i % 25 == 0:
            _write_out(args.out, results, manual_review, total)

    _write_out(args.out, results, manual_review, total)
    print(f"\nWrote {len(results)} entries to {args.out}")
    if manual_review:
        print(f"{len(manual_review)} had no FindClubs detail: {manual_review}")


def _write_out(path, results, manual_review, requested):
    out = {
        "fetched_at": datetime.date.today().isoformat(),
        "source": f"{BASE} (Handicap Network Africa Find and Play, undocumented public API)",
        "requested": requested,
        "resolved": len([r for r in results.values() if r.get("details")]),
        "manual_review_needed": manual_review,
        "clubs": results,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--names-file", help="JSON file: {key: 'club name to search'}")
    parser.add_argument("--all", action="store_true",
                        help="GOLF-121a: ignore --names-file, pull every club from GetClubHierarchies (resumable)")
    parser.add_argument("--out", default="scripts/output/south_africa_golf_clubs.json")
    parser.add_argument("--delay", type=float, default=0.3, help="Seconds between FindClubs requests")
    args = parser.parse_args()

    if args.all:
        run_all(args)
        return

    if not args.names_file:
        parser.error("--names-file is required unless --all is given")

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
