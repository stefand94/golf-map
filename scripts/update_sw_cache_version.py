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

This script removes the "remember to bump it" step: it hashes the actual
on-disk content of every file sw.js's PRECACHE_URLS list points at (NOT
sw.js itself — that would be circular, since sw.js's own bytes change when
this script rewrites CACHE_NAME into it) and writes that hash into
CACHE_NAME. Run it any time before a push; it's a no-op (exits 0, prints
"unchanged") when nothing precached actually changed content, and rewrites
sw.js with a fresh hash when something did — which is exactly the trigger
a browser needs to notice sw.js changed and install a fresh service worker,
which is what actually forces the hard reset.

Usage:  python3 scripts/update_sw_cache_version.py
Exits non-zero only on a real error (missing file, unreadable sw.js).
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW_PATH = ROOT / 'sw.js'

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

def main():
    sw_text = SW_PATH.read_text(encoding='utf-8')
    urls = extract_precache_urls(sw_text)

    h = hashlib.sha256()
    missing = []
    for url in urls:
        rel = URL_TO_FILE.get(url, url[2:] if url.startswith('./') else url)
        fp = ROOT / rel
        if not fp.exists():
            missing.append((url, rel))
            continue
        h.update(fp.read_bytes())
    if missing:
        for url, rel in missing:
            print(f'FAIL: PRECACHE_URLS entry {url!r} -> {rel} does not exist on disk', file=sys.stderr)
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

if __name__ == '__main__':
    main()
