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

GOLF-210: the same digest is also stamped into the app HTML as a `?v=`
query on every local <script src>. Cloudflare serves every .js with
`max-age=14400`, so without it a returning visitor's browser could run
four-hour-old JS against fresh HTML (or, with an old service worker,
old cache-first JS against network-first HTML). A new build means new
script URLs, which neither cache has seen. The `?v=` values are removed
from the HTML before hashing, so the stamp never feeds its own digest.

GOLF-205: the pre-push hook used to commit the stamp after git had already
decided what to push, so the bump shipped one push late: the deploy went
out with new files under the old version. `--commit` writes the stamp as a
commit of its own, built from HEAD's committed files only, so nothing
uncommitted or staged is swept into it. .githooks/post-commit runs it after
every commit, and .githooks/pre-push runs it as a backstop that stops the
push when it had to add a commit, so the push can be re-run with it.

Usage:  python3 scripts/update_sw_cache_version.py            (stamps the working tree)
        python3 scripts/update_sw_cache_version.py --commit   (stamps HEAD as a new commit)
Exits non-zero only on a real error (missing file, unreadable sw.js).
With --commit, exits 3 when it made a commit, so a hook can tell.
"""
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW_REL = 'sw.js'
APP_VERSION_REL = 'js/app-version.js'
HTML_REL = 'london-golf-map-v5_1.html'
# Excluded from the hash input for the same reason sw.js itself is: this
# script rewrites APP_VERSION into this file, so hashing its own content
# would be circular.
HASH_EXCLUDED_FILES = {APP_VERSION_REL}

# PRECACHE_URLS entries are relative URLs, not always literal filesystem
# paths — map the exceptions by hand, everything else is a direct
# relative-path match (strip the leading './').
URL_TO_FILE = {
    './': HTML_REL,           # index.html itself just meta-refreshes here
    './london-golf-map-v5_1': HTML_REL,
}

CACHE_NAME_RE = re.compile(r"const CACHE_NAME = '([^']*)';")
APP_VERSION_RE = re.compile(r"const APP_VERSION='([^']*)';")
# A local script tag, with or without a ?v= stamp. External (https://) tags
# are left alone: they are versioned by their own URLs.
SCRIPT_TAG_RE = re.compile(r'(<script src="(?:js|data)/[^"?]+\.js)(?:\?v=[0-9a-f]*)?(")')


def extract_precache_urls(sw_text):
    m = re.search(r'const PRECACHE_URLS\s*=\s*\[(.*?)\];', sw_text, re.S)
    if not m:
        raise SystemExit('FAIL: could not find PRECACHE_URLS array in sw.js')
    urls = re.findall(r"'([^']+)'", m.group(1))
    if not urls:
        raise SystemExit('FAIL: PRECACHE_URLS parsed empty — check sw.js format')
    return urls


def git(*args, **kw):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, check=True, **kw).stdout


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


def unstamp_html(text):
    return SCRIPT_TAG_RE.sub(r'\1\2', text)


def compute_cache_name():
    sw_blob = committed_bytes(SW_REL)
    if sw_blob is None:
        raise SystemExit('FAIL: sw.js is not committed at HEAD')
    urls = extract_precache_urls(sw_blob.decode('utf-8'))

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
        if rel == HTML_REL:
            blob = unstamp_html(blob.decode('utf-8')).encode('utf-8')
        h.update(blob)
    if missing:
        for url, rel in missing:
            print(f'FAIL: PRECACHE_URLS entry {url!r} -> {rel} is not committed at HEAD '
                  f'(a new precached file must be committed before it can be hashed)',
                  file=sys.stderr)
        sys.exit(1)
    return f'golfmap-shell-v5-{h.hexdigest()[:10]}'


def stamp(rel, text, cache_name):
    """Return `text` with this file's version stamp(s) set to cache_name.

    Pure text substitution, so it works the same on HEAD's copy and on a
    working copy with unrelated edits in it."""
    if rel == SW_REL:
        if not CACHE_NAME_RE.search(text):
            raise SystemExit('FAIL: could not find CACHE_NAME constant in sw.js')
        return CACHE_NAME_RE.sub(f"const CACHE_NAME = '{cache_name}';", text, count=1)
    if rel == APP_VERSION_REL:
        if not APP_VERSION_RE.search(text):
            raise SystemExit('FAIL: could not find APP_VERSION constant in js/app-version.js')
        return APP_VERSION_RE.sub(f"const APP_VERSION='{cache_name}';", text, count=1)
    if rel == HTML_REL:
        if not SCRIPT_TAG_RE.search(text):
            raise SystemExit('FAIL: found no local <script src> tags in the app HTML')
        build = cache_name.rsplit('-', 1)[1]
        return SCRIPT_TAG_RE.sub(rf'\1?v={build}\2', text)
    raise ValueError(rel)


STAMPED_FILES = (SW_REL, APP_VERSION_REL, HTML_REL)


def stamp_working_tree(cache_name):
    changed = []
    for rel in STAMPED_FILES:
        path = ROOT / rel
        if not path.exists():
            raise SystemExit(f'FAIL: {rel} does not exist')
        old = path.read_text(encoding='utf-8')
        new = stamp(rel, old, cache_name)
        if new != old:
            path.write_text(new, encoding='utf-8')
            changed.append(rel)
    return changed


def git_path(name):
    p = Path(git('rev-parse', '--git-path', name).decode().strip())
    return p if p.is_absolute() else ROOT / p


def operation_in_progress():
    for name in ('rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'):
        if git_path(name).exists():
            return name
    return None


def commit_stamp(cache_name):
    """Commit HEAD's own files with the stamps applied, on top of HEAD.

    Built with a throwaway index (read-tree HEAD, swap in the stamped blobs,
    write-tree, commit-tree), so the commit holds exactly HEAD plus the
    stamps: nothing staged or unstaged is swept in. Afterwards the real
    index and working tree get the same stamps, leaving any other edits to
    those files where they were."""
    head = git('rev-parse', 'HEAD').decode().strip()
    new_blobs = {}
    for rel in STAMPED_FILES:
        old = committed_bytes(rel)
        if old is None:
            raise SystemExit(f'FAIL: {rel} is not committed at HEAD')
        new = stamp(rel, old.decode('utf-8'), cache_name).encode('utf-8')
        if new != old:
            new_blobs[rel] = git('hash-object', '-w', '--stdin', input=new).decode().strip()
    if not new_blobs:
        return None

    tmp_index = str(git_path('index.golf-stamp'))
    env = {**os.environ, 'GIT_INDEX_FILE': tmp_index}
    try:
        subprocess.run(['git', 'read-tree', 'HEAD'], cwd=ROOT, env=env, check=True)
        for rel, blob in new_blobs.items():
            mode = git('ls-tree', 'HEAD', '--', rel).decode().split()[0]
            subprocess.run(['git', 'update-index', '--cacheinfo', f'{mode},{blob},{rel}'],
                           cwd=ROOT, env=env, check=True)
        tree = subprocess.run(['git', 'write-tree'], cwd=ROOT, env=env, check=True,
                              capture_output=True).stdout.decode().strip()
    finally:
        if os.path.exists(tmp_index):
            os.remove(tmp_index)
    msg = 'sw.js: auto-bump CACHE_NAME (precached content changed)\n'
    commit = git('commit-tree', tree, '-p', head, input=msg.encode()).decode().strip()
    git('update-ref', '-m', 'golf-stamp: auto-bump CACHE_NAME', 'HEAD', commit, head)

    # Real index: move each stamped path to the new blob only where it still
    # held HEAD's blob, so a partly-staged change to the same file survives.
    for rel, blob in new_blobs.items():
        r = subprocess.run(['git', 'rev-parse', f':{rel}'], cwd=ROOT, capture_output=True)
        if r.returncode == 0 and r.stdout.decode().strip() == git('rev-parse', f'{head}:{rel}').decode().strip():
            mode = git('ls-tree', commit, '--', rel).decode().split()[0]
            git('update-index', '--cacheinfo', f'{mode},{blob},{rel}')
    stamp_working_tree(cache_name)
    return commit


def main():
    cache_name = compute_cache_name()

    if '--commit' in sys.argv[1:]:
        op = operation_in_progress()
        if op:
            print(f'stamp: {op} in progress, not committing; the pre-push check will catch it.')
            return 0
        commit = commit_stamp(cache_name)
        if not commit:
            print(f'sw.js CACHE_NAME unchanged ({cache_name}) — precached content has not changed.')
            return 0
        print(f'stamp: committed {commit[:7]} — CACHE_NAME, APP_VERSION and the HTML ?v= now {cache_name}.')
        return 3

    changed = stamp_working_tree(cache_name)
    if not changed:
        print(f'sw.js CACHE_NAME unchanged ({cache_name}) — precached content has not changed.')
    else:
        print(f'stamped {cache_name} into: {", ".join(changed)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
