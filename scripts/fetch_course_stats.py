#!/usr/bin/env python3
"""
GOLF-12: fetch par/slope/course rating from the UK Golf Course Data API
(RapidAPI, host uk-golf-course-data-api.p.rapidapi.com — marketed as
golfapi.uk) for a target set of courses.

Scope (per stakeholder, first pass): every London-catchment 18-hole course
(data/courses-london.js) plus England's Top 30 (data/courses-top100.js,
t100.eng <= 30) — not all 221, to fit inside the free tier's 200
requests/month cap. See scripts/GOLF-12-course-stats-spike.md for why this
API and not a paid alternative.

Two calls per unique *club* (several Top 100 entries share one physical
club, e.g. Sunningdale Old/New) — not per course entry:
  1. GET /clubs?search=<name>          -> resolve to a club id
  2. GET /clubs/{id}/courses           -> par/course_rating/slope_rating
     per course at that club, already embedded per tee set (no separate
     /courses/{id}/scorecard call needed)

127 unique target clubs x 2 calls = 254 > the 200/month free-tier cap, so
this script is resumable and rate-limited (5 req/min on BASIC): it writes
to scripts/output/course_stats.json incrementally and skips anything
already resolved on a re-run, so a second run next month (once the quota
resets) picks up exactly where this one left off. Pass --max-requests to
cap how much quota a single run is allowed to spend.

The API key is never passed on the command line or hardcoded here — it's
read from scripts/output/.rapidapi_key (gitignored, chmod 600), which you
create once with your own RapidAPI key for golfapi.uk's free tier.

Usage:
    python3 scripts/fetch_course_stats.py --max-requests 180
"""
import argparse
import difflib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_HOST = "uk-golf-course-data-api.p.rapidapi.com"
API_BASE = f"https://{API_HOST}"
KEY_FILE = "scripts/output/.rapidapi_key"
REQUEST_GAP_SECONDS = 13  # BASIC plan: 5 req/min: stay comfortably under that


def load_key():
    if not os.path.exists(KEY_FILE):
        print(f"Missing {KEY_FILE} — create it with your RapidAPI key for "
              f"golfapi.uk (one line, no quotes). It's gitignored.", file=sys.stderr)
        sys.exit(1)
    with open(KEY_FILE) as f:
        return f.read().strip()


def api_get(path, key, request_count):
    url = f"{API_BASE}{path}"
    req = urllib.request.Request(url, headers={
        "x-rapidapi-host": API_HOST,
        "x-rapidapi-key": key,
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            request_count[0] += 1
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code} for {path}: {body}")


def base_name(name):
    return re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def find_target_courses():
    """Loads data/*.js via Node's vm module (matches test_data.js's approach)
    and returns the scoped course-name list: London 18-hole + England Top 30."""
    import subprocess
    js = """
    const fs=require('fs'),vm=require('vm');
    const sandbox={};vm.createContext(sandbox);
    ['data/config.js','data/stations.js','data/courses-london.js','data/courses-top100.js'].forEach(f=>{
      let code=fs.readFileSync(f,'utf8').replace(/^(const|let) /gm,'var ');
      vm.runInContext(code,sandbox,{filename:f});
    });
    const {C}=sandbox;
    const london18=C.filter(c=>!c.top100 && /\\b18\\b/.test(c.spec));
    const top30=C.filter(c=>c.top100 && c.t100 && typeof c.t100.eng==='number' && c.t100.eng<=30);
    console.log(JSON.stringify([...london18,...top30].map(c=>c.n)));
    """
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-requests", type=int, default=180,
                         help="Hard cap on API calls this run (default 180, leaves headroom in the 200/month free tier)")
    parser.add_argument("--out", default="scripts/output/course_stats.json")
    args = parser.parse_args()

    key = load_key()
    course_names = find_target_courses()
    clubs = sorted({base_name(n) for n in course_names})
    print(f"{len(course_names)} target courses -> {len(clubs)} unique clubs")

    results = {}
    if os.path.exists(args.out):
        with open(args.out) as f:
            results = json.load(f)
        print(f"Resuming: {len(results)} clubs already resolved from a previous run")

    todo = [c for c in clubs if c not in results]
    print(f"{len(todo)} clubs left to fetch")

    request_count = [0]
    fetched, no_match, errors = 0, [], []

    for club_name in todo:
        if request_count[0] + 2 > args.max_requests:
            print(f"\nHit --max-requests ({args.max_requests}) — stopping here. "
                  f"Re-run this script (same command) once quota resets to continue.")
            break
        try:
            time.sleep(REQUEST_GAP_SECONDS if request_count[0] else 0)
            search = api_get(f"/clubs?search={urllib.parse.quote(club_name)}", key, request_count)
            candidates = search.get("clubs", [])
            if not candidates:
                no_match.append(club_name)
                results[club_name] = None
                continue
            # best name match among candidates, since search can return near-misses
            names = [c["name"] for c in candidates]
            best = difflib.get_close_matches(club_name, names, n=1, cutoff=0.5)
            club = next((c for c in candidates if c["name"] == best[0]), candidates[0]) if best else candidates[0]

            time.sleep(REQUEST_GAP_SECONDS)
            courses = api_get(f"/clubs/{club['id']}/courses", key, request_count)
            results[club_name] = {"club_id": club["id"], "matched_name": club["name"], "courses": courses}
            fetched += 1
            print(f"  {club_name} -> {club['name']} ({len(courses)} course(s))")
        except RuntimeError as e:
            errors.append((club_name, str(e)))
            print(f"  ! {club_name}: {e}", file=sys.stderr)
        finally:
            # write after every club so a crash/quota-stop doesn't lose progress
            with open(args.out, "w") as f:
                json.dump(results, f, indent=2, sort_keys=True)

    print(f"\nFetched {fetched} clubs this run ({request_count[0]} API calls used).")
    if no_match:
        print(f"No match found for: {no_match}")
    if errors:
        print(f"Errors: {errors}")
    remaining = len(clubs) - len([k for k, v in results.items() if v is not None]) - len(no_match)
    if remaining > 0 or len(results) < len(clubs):
        left = [c for c in clubs if c not in results]
        if left:
            print(f"{len(left)} clubs still unfetched — re-run this script once your monthly quota resets.")


if __name__ == "__main__":
    main()
