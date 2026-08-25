#!/usr/bin/env python3
"""
GOLF-21: decode and resize club logo images out of England Golf's
GetClubDetails responses, already fetched by fetch_england_golf_clubs.py.
Does NOT hit the network again — reuses the LogoImage base64 blobs already
sitting in scripts/output/england_golf_clubs.json from GOLF-11.

Those blobs average ~470KB each as raw base64 JPEG — GOLF-11 deliberately
did not inline them into data/courses-top100.js (would have added tens of
MB to a ~130KB data file). This resizes each down to a small real file
(~160px wide, JPEG quality ~70, landing around 15-25KB) and saves it under
images/clubs/ instead, referenced by path.

Requires Pillow (pip install Pillow) — a one-time local dev dependency for
this script only, never shipped to the browser. Every other script in this
repo uses only the Python standard library; this is the one exception,
flagged deliberately.

Usage:
    python3 scripts/fetch_club_images.py \\
        --clubs scripts/output/england_golf_clubs.json \\
        --out-dir images/clubs

Writes one .jpg per club that has a LogoImage, named by a slug of the club
key (matching scripts/output/top100_club_names.json's keys), plus
scripts/output/club_images.json mapping course name -> image path for
merge_club_images.py to consume.
"""
import argparse
import base64
import io
import json
import os
import re
import sys

try:
    from PIL import Image
except ImportError:
    print("Pillow is required: pip install Pillow", file=sys.stderr)
    sys.exit(1)

TARGET_WIDTH = 160
JPEG_QUALITY = 70


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clubs", default="scripts/output/england_golf_clubs.json")
    parser.add_argument("--names", default="scripts/output/top100_club_names.json")
    parser.add_argument("--out-dir", default="images/clubs")
    parser.add_argument("--out-map", default="scripts/output/club_images.json")
    args = parser.parse_args()

    with open(args.clubs) as f:
        clubs = json.load(f)["clubs"]
    with open(args.names) as f:
        names = json.load(f)  # key -> base club name searched

    os.makedirs(args.out_dir, exist_ok=True)

    written = 0
    mapping = {}  # base club name -> relative image path
    for key, base_name in names.items():
        entry = clubs.get(key)
        details = entry.get("details") if entry else None
        logo_b64 = details.get("LogoImage") if details else None
        if not logo_b64:
            continue
        try:
            raw = base64.b64decode(logo_b64)
            img = Image.open(io.BytesIO(raw)).convert("RGB")
        except Exception as e:
            print(f"  ! failed to decode/open image for '{base_name}': {e}", file=sys.stderr)
            continue

        ratio = TARGET_WIDTH / img.width
        target_size = (TARGET_WIDTH, max(1, round(img.height * ratio)))
        img = img.resize(target_size, Image.LANCZOS)

        slug = re.sub(r"[^a-z0-9]+", "-", base_name.lower()).strip("-")
        rel_path = f"{args.out_dir}/{slug}.jpg"
        img.save(rel_path, "JPEG", quality=JPEG_QUALITY, optimize=True)
        size_kb = os.path.getsize(rel_path) / 1024
        mapping[base_name] = rel_path
        written += 1
        print(f"  {base_name} -> {rel_path} ({size_kb:.0f} KB)")

    with open(args.out_map, "w") as f:
        json.dump(mapping, f, indent=2, sort_keys=True)

    total_kb = sum(os.path.getsize(p) for p in mapping.values()) / 1024
    print(f"\nWrote {written} images ({total_kb:.0f} KB total) to {args.out_dir}")
    print(f"Wrote name->path mapping to {args.out_map}")


if __name__ == "__main__":
    main()
