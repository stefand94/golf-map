#!/usr/bin/env python3
"""GOLF-164: stamp a content hash into the Worker so a deploy is verifiable.

WHY

Twice — GOLF-149 and GOLF-155 — a change to scripts/cloudflare-worker/
ors-proxy.js could not be confirmed live from outside. A change that only
touches logging or an error path is externally identical to the old code: a
200 is equally consistent with both, and the only response header the Worker
emitted was X-POI-Cache. Confirming a deploy needed the Cloudflare dashboard
or `wrangler tail` during a forced failure, both owner-only, so "is the new
code live?" was answered by trust rather than by evidence.

This hashes the Worker source and writes that hash into its WORKER_BUILD
constant, which it returns as X-Worker-Build on every response. Then:

    curl -sI https://api.golftripper.uk/ | grep -i x-worker-build
    python3 scripts/update_worker_build.py --print

Same value and the deployed Worker is this source. Different and it is not.

A content hash rather than a commit sha, deliberately: the question is "is
THIS code running", not "which commit was deployed from" — and the Worker's
own header comment says it auto-deploys from git while the project's notes
say it needs a manual redeploy. One of those is wrong, and this settles it
empirically instead of by argument.

Same shape and reasoning as update_sw_cache_version.py (GOLF-84), including
excluding the stamped line itself from the hash input, which would otherwise
be circular. Run by .githooks/pre-push; a no-op when nothing changed.

Usage:
    python3 scripts/update_worker_build.py           # stamp if needed
    python3 scripts/update_worker_build.py --print   # just show the hash
"""

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKER = ROOT / "scripts" / "cloudflare-worker" / "ors-proxy.js"
STAMP = re.compile(r"^const WORKER_BUILD = '([^']*)';$", re.MULTILINE)
DIGEST_LEN = 10


def compute(text):
    """Hash the source with the stamp line neutralised, so re-stamping the
    same code is idempotent rather than a new hash every run."""
    neutral = STAMP.sub("const WORKER_BUILD = '';", text)
    return hashlib.sha256(neutral.encode("utf-8")).hexdigest()[:DIGEST_LEN]


def main():
    show_only = "--print" in sys.argv
    try:
        text = WORKER.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"update_worker_build: cannot read {WORKER}: {exc}", file=sys.stderr)
        return 1

    m = STAMP.search(text)
    if not m:
        print("update_worker_build: no `const WORKER_BUILD = '...';` line in "
              f"{WORKER.relative_to(ROOT)} — has it been renamed or removed?",
              file=sys.stderr)
        return 1

    digest = compute(text)
    if show_only:
        print(digest)
        return 0
    if m.group(1) == digest:
        print(f"ors-proxy.js WORKER_BUILD unchanged ({digest})")
        return 0

    WORKER.write_text(STAMP.sub(f"const WORKER_BUILD = '{digest}';", text, count=1),
                      encoding="utf-8")
    print(f"ors-proxy.js WORKER_BUILD updated: {m.group(1)} -> {digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
