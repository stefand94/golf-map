#!/usr/bin/env python3
"""
GOLF-88 (implementation): fetch a real, openly-licensed photo per course
from Wikimedia Commons, following the proposal's recommended source
(https://claude.ai/code/artifact/621d7880-b82f-4251-989c-39fa904b16b4) and
this app's existing "fetch once, bake into static files" pipeline pattern.

Unlike a MediaSearch page-scrape, this hits Commons' own structured API
(action=query, generator=search, prop=imageinfo with iiprop=extmetadata),
which returns machine-readable license/attribution fields per file —
license short name, artist/photographer, credit, description-page URL —
everything the CC-BY-SA attribution requirement actually needs. No API key.

For each course:
  1. Search Commons for "<course name> golf course <nation>" in the File
     namespace (ns=6).
  2. Filter candidates to openly-licensed ones (CC0/CC-BY/CC-BY-SA/public
     domain) and away from obvious non-photo files (logos, maps, flags,
     scorecards, aerial-only diagrams) via filename heuristics.
  3. Take the first surviving candidate, download it, resize to a real
     small file (target ~640px wide, JPEG quality 78 — larger than the
     160px club-logo thumbnail from GOLF-21, since this is the hero photo
     for a course rather than a small badge).
  4. Save under images/courses/<slug>.jpg.
  5. Record attribution (photographer, license, Commons source URL)
     alongside it.

Requires Pillow (pip install Pillow) — matches fetch_club_images.py's
existing precedent as the one script needing it beyond stdlib.

Usage:
    python3 scripts/fetch_course_images.py \\
        --courses scripts/output/course_image_targets.json \\
        --out-dir images/courses

--courses is {key: {"name": "Course Name", "nation": "England"}}.
Writes images/courses/*.jpg plus scripts/output/course_images.json:
    {course_name: {path, photographer, license, sourceUrl, width, height}}
for merge_course_images.py to consume. A course with no acceptable
candidate is simply omitted — degrades gracefully, same convention as
every other optional field in this app.
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

try:
    from PIL import Image
except ImportError:
    print("Pillow is required: pip install Pillow", file=sys.stderr)
    sys.exit(1)

API = "https://commons.wikimedia.org/w/api.php"
UA = "GolfTripperImageFetch/1.0 (https://github.com/stefand94/golf-map; personal non-commercial project)"

TARGET_WIDTH = 640
JPEG_QUALITY = 78

# License short-names Commons reports that we treat as safely reusable.
# (Full CC0/PD/CC-BY family — CC-BY-SA/BY require attribution, which we
# capture; we never take a "non-commercial" or "no derivatives" license,
# and Commons overwhelmingly doesn't host those anyway.)
OK_LICENSE_RE = re.compile(
    r"cc[-\s]?by|cc0|public\s*domain|pd[-\s]|attribution", re.I
)
BAD_LICENSE_RE = re.compile(r"non[-\s]?commercial|no[-\s]?derivatives|nc-|nd-", re.I)

# Filename heuristics to skip non-photo files.
SKIP_FILENAME_RE = re.compile(
    r"logo|\bmap\b|flag|scorecard|coat[_ ]of[_ ]arms|crest|icon|diagram|"
    r"location[_ ]map|\bqr\b|banner",
    re.I,
)


def api_get(params):
    q = dict(params)
    q["format"] = "json"
    url = API + "?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def strip_html(s):
    if not s:
        return ""
    return re.sub(r"<[^>]+>", "", s).strip()


def search_candidates(query, limit=6):
    data = api_get(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,  # File:
            "gsrlimit": limit,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size|mime",
        }
    )
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for p in pages.values():
        title = p.get("title", "")
        infos = p.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        mime = info.get("mime", "")
        if not mime.startswith("image/") or mime in ("image/svg+xml", "image/vnd.djvu"):
            continue
        if title.lower().endswith((".djvu", ".pdf", ".tiff", ".tif")):
            continue
        if SKIP_FILENAME_RE.search(title):
            continue
        meta = info.get("extmetadata") or {}
        license_short = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
        if BAD_LICENSE_RE.search(license_short):
            continue
        if not OK_LICENSE_RE.search(license_short):
            continue
        artist = strip_html(meta.get("Artist", {}).get("value", ""))
        credit = strip_html(meta.get("Credit", {}).get("value", ""))
        out.append(
            {
                "title": title,
                "url": info.get("url"),
                "descriptionurl": info.get("descriptionurl"),
                "width": info.get("width"),
                "height": info.get("height"),
                "license": license_short or "Unknown open license",
                "photographer": artist or credit or "Unknown (see source)",
            }
        )
    return out


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--courses", default="scripts/output/course_image_targets.json")
    parser.add_argument("--out-dir", default="images/courses")
    parser.add_argument("--out-map", default="scripts/output/course_images.json")
    parser.add_argument("--sleep", type=float, default=0.5, help="delay between API calls (politeness)")
    args = parser.parse_args()

    with open(args.courses) as f:
        targets = json.load(f)

    os.makedirs(args.out_dir, exist_ok=True)
    mapping = {}
    hits, misses = 0, []

    for key, t in targets.items():
        name = t["name"]
        nation = t.get("nation", "")
        query = f"{name} golf course {nation}".strip()
        try:
            candidates = search_candidates(query)
        except Exception as e:
            print(f"  ! search failed for '{name}': {e}", file=sys.stderr)
            misses.append(name)
            continue
        time.sleep(args.sleep)

        if not candidates:
            print(f"  - no candidate: {name}")
            misses.append(name)
            continue

        img = None
        c = None
        for cand in candidates:
            try:
                req = urllib.request.Request(cand["url"], headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=30) as r:
                    raw = r.read()
                img = Image.open(io.BytesIO(raw)).convert("RGB")
                c = cand
                break
            except Exception as e:
                print(f"  ! download/decode failed for '{name}' ({cand['title']}): {e}", file=sys.stderr)
        if img is None:
            misses.append(name)
            continue

        if img.width > TARGET_WIDTH:
            ratio = TARGET_WIDTH / img.width
            img = img.resize((TARGET_WIDTH, max(1, round(img.height * ratio))), Image.LANCZOS)

        slug = slugify(name)
        rel_path = f"{args.out_dir}/{slug}.jpg"
        img.save(rel_path, "JPEG", quality=JPEG_QUALITY, optimize=True)
        size_kb = os.path.getsize(rel_path) / 1024

        mapping[name] = {
            "path": rel_path,
            "photographer": c["photographer"],
            "license": c["license"],
            "sourceUrl": c["descriptionurl"] or c["url"],
            "width": img.width,
            "height": img.height,
        }
        hits += 1
        print(f"  {name} -> {rel_path} ({size_kb:.0f} KB, {c['license']}, {c['photographer']})")

    with open(args.out_map, "w") as f:
        json.dump(mapping, f, indent=2, sort_keys=True)

    print(f"\n{hits} of {len(targets)} courses got a real photo.")
    if misses:
        print(f"No image for {len(misses)}: {misses}")
    print(f"Wrote {args.out_map}")


if __name__ == "__main__":
    main()
