#!/usr/bin/env python3
"""
update_sw_cache_version.py — keep sw.js's CACHE_NAME in lockstep with the
actual content of the files it precaches.

Why this exists (GOLF-84): the app shipped several rounds of "the live site
is serving stale/broken JS" bugs (see plan Phase 20/25/26) that all traced
back to the same root cause — a browser only checks sw.js itself for byte
changes to decide whether to install a new service worker. sw.js's own
CACHE_NAME was a hand-typed constant ('golfmap-shell-v5'), so a push that
changed app files but forgot to bump that string left every returning
visitor's service worker installed, unchanged, still serving its old
cache-first copies of everything — forever, until someone remembered to
bump the version by hand.

This script removes the "remember to bump it" step: it hashes the content
of every file sw.js's PRECACHE_URLS list points at (NOT sw.js itself —
that would be circular, since sw.js's own bytes change when this script
rewrites CACHE_NAME into it) and writes that hash into CACHE_NAME. Run it
any time before a push; it's a no-op (exits 0, prints "unchanged") when
nothing precached actually changed content, and rewrites sw.js with a
fresh hash when something did — which is exactly the trigger a browser
needs to notice sw.js changed and install a fresh service worker, which is
what actually forces the hard reset.

GOLF-165: it hashes the committed content at HEAD, not the working tree.
This used to read the files off disk, which made the digest a property of
*whichever checkout happened to run the hook* rather than of the repo.
With git worktrees in play that is not a hypothetical: a docs-only push
from a worktree sitting on another branch stamped main's CACHE_NAME with
the hash of that worktree's older app files (c80e299083 -> 85a520a365 on
2026-09-20, commit 813b30d), and because DEC-011 wipes a visitor's saved
trips whenever APP_VERSION moves, a backlog-file edit silently deleted
every visitor's trips. Recomputing 813b30d from its own committed tree
gives c80e299083 — unchanged — which is what should have happened.

Hashing HEAD also makes the digest reproducible after the fact: anyone can
recompute what any commit's CACHE_NAME should have been, which is how the
above was diagnosed rather than argued about.

GOLF-132: the same digest is also stamped into js/app-version.js's
APP_VERSION constant, a tiny page-visible script the HTML loads before
js/state.js. That lets the page itself detect "has the deploy changed
since my last load" (to silently clear a visitor's saved trip, per
DEC-011) by comparing APP_VERSION to what it last saw, with no runtime
fetch and no second, independently-maintained version scheme. Like sw.js,
js/app-version.js is excluded from the hash input itself (circular
otherwise) but IS listed in PRECACHE_URLS so it's still cached/versioned
like every other precached file.

Usage:  python3 scripts/update_sw_cache_version.py
Exits non-zero only on a real error (missing file, unreadable sw.js).
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW_PATH = ROOT / 'sw.js'
APP_VERSION_PATH = ROOT / 'js' / 'app-version.js'
# Excluded from the hash input for the same reason sw.js itself is: this
# script rewrites APP_VERSION into this file, so hashing its own content
# would be circular.
HASH_EXCLUDED_FILES = {'js/app-version.js'}

# PRECACHE_URLS entries are relative URLs, not always literal filesystem
# paths — map the two exceptions by hand, everything else is a direct
# relative-path match (strip the leading './').
URL_TO_FILE = {
    './': 'london-golf-map-v5_1.html',           # index.html itself just meta-refreshes here
    './london-golf-map-v5_1': 'london-golf-map-v5_1.html',
}

def extract_precache_urls(sw_text):
    m = re.search(r'const PRECACHE_URLS\s*=\s*\[(.*?)\];', sw_text, re.S)
    if not m:
        raise SystemExit('FAIL: could not find PRECACHE_URLS array in sw.js')
    urls = re.findall(r"'([^']+)'", m.group(1))
    if not urls:
        raise SystemExit('FAIL: PRECACHE_URLS parsed empty — check sw.js format')
    return urls

def committed_bytes(rel):
    """The file's content at HEAD, or None if HEAD doesn't have it.

    GOLF-165: deliberately NOT the working copy. See the module docstring —
    reading from disk made the digest depend on which checkout ran the hook,
    and a worktree on another branch stamped main with its own app files.
    A pre-push hook is asking "what content is going out", and that is the
    committed content, not whatever happens to be lying in the tree.
    """
    r = subprocess.run(['git', 'show', f'HEAD:{rel}'],
                       cwd=ROOT, capture_output=True)
    return r.stdout if r.returncode == 0 else None


def main():
    sw_text = SW_PATH.read_text(encoding='utf-8')
    urls = extract_precache_urls(sw_text)

    h = hashlib.sha256()
    missing = []
    for url in urls:
        rel = URL_TO_FILE.get(url, url[2:] if url.startswith('./') else url)
        if rel in HASH_EXCLUDED_FILES:
            continue
        blob = committed_bytes(rel)
        if blob is None:
            missing.append((url, rel))
            continue
        h.update(blob)
    if missing:
        for url, rel in missing:
            print(f'FAIL: PRECACHE_URLS entry {url!r} -> {rel} is not committed at HEAD '
                  f'(a new precached file must be committed before it can be hashed)',
                  file=sys.stderr)
        sys.exit(1)

    digest = h.hexdigest()[:10]
    new_cache_name = f'golfmap-shell-v5-{digest}'

    m = re.search(r"const CACHE_NAME = '([^']*)';", sw_text)
    if not m:
        raise SystemExit('FAIL: could not find CACHE_NAME constant in sw.js')
    current = m.group(1)

    if current == new_cache_name:
        print(f'sw.js CACHE_NAME unchanged ({current}) — precached content has not changed.')
        return

    updated = sw_text.replace(f"const CACHE_NAME = '{current}';", f"const CACHE_NAME = '{new_cache_name}';", 1)
    SW_PATH.write_text(updated, encoding='utf-8')
    print(f'sw.js CACHE_NAME updated: {current} -> {new_cache_name}')

    # GOLF-132: keep js/app-version.js's APP_VERSION in lockstep with the
    # same digest, so the page can detect this same deploy without a
    # runtime fetch of sw.js.
    if not APP_VERSION_PATH.exists():
        raise SystemExit(f'FAIL: {APP_VERSION_PATH} does not exist')
    av_text = APP_VERSION_PATH.read_text(encoding='utf-8')
    av_m = re.search(r"const APP_VERSION='([^']*)';", av_text)
    if not av_m:
        raise SystemExit('FAIL: could not find APP_VERSION constant in js/app-version.js')
    av_current = av_m.group(1)
    av_updated = av_text.replace(f"const APP_VERSION='{av_current}';", f"const APP_VERSION='{new_cache_name}';", 1)
    APP_VERSION_PATH.write_text(av_updated, encoding='utf-8')
    print(f'js/app-version.js APP_VERSION updated: {av_current} -> {new_cache_name}')

if __name__ == '__main__':
    main()
