#!/usr/bin/env python3
"""Collapse duplicate POIs in scripts/output/pois_raw.json.

WHY THIS EXISTS

fetch_pois.py dedupes on OSM id, deliberately: two genuinely different things
can share a name (there are several Penderyn distilleries), so collapsing by
name during the fetch would lose real places. The cost of that choice is that
one place mapped as two OSM objects survives as two records — and at runtime
that is two pins on top of each other for the same castle.

Observed in the real data:
  * Loch Lomond and The Trossachs National Park — two ways, same name.
  * Killarney National Park — once as "National park", once as "Attraction",
    because it carries tags from both query groups.

So the fetch stays permissive and this step, which can see the whole dataset
at once, decides what is actually the same place.

THE MATCHING RULE

Name alone is far too loose ("St Mary's Church" is hundreds of distinct
buildings). Proximity alone is too loose as well — a castle, its car park and
its tea room are all within 200m and are three different records that happen
to sit together, though only one is worth a pin.

The first version of this script got it badly wrong in a way worth recording,
because the mistake is tempting: it stripped category nouns ("museum",
"beach", "castle") as "generic" before comparing. That made "Combe Martin
Museum" and "Combe Martin beach" identical, merged Tate St Ives into "St Ives
Museum", and collapsed Tintagel Castle with Tintagel Old Post Office. The
category noun is only noise when both records are the same KIND of thing —
across kinds it is the entire distinguishing signal.

So the rule is two-tier, and which tier applies depends on the categories:

  1. LIGHT match, allowed across categories: names identical after lowercasing
     and stripping accents/punctuation only, with every word kept. This is
     what catches "Killarney National Park" filed once as a National park and
     once as an Attraction — same words, so same place.
  2. HEAVY match, allowed only within one category family: names identical
     after also dropping generic words. This is the owner's Kruger case —
     "Kruger National Park" and "Kruger Park" both reduce to "kruger" — and it
     is only safe because both records are already known to be parks.

Radius is scaled by category rather than fixed. Area features are the reason:
two mappings of one national park can have centroids several km apart (Loch
Lomond is in the data twice, as two separate ways), while two hills called
"Hawk's Tor" 11km apart are genuinely two hills. So area categories get a
generous radius and point features get a tight one.

Deliberately NOT edit distance, and deliberately no token-subset rule. Edit
distance measures the wrong thing: "Loch Awe" and "Loch Ewe" differ by one
character and are 80 miles apart, while "Kruger Park" and "Kruger National
Park" differ by nine and are the same place. The subset rule ("glenfinnan" is
a subset of "glenfinnan monument") was tried and produced almost every false
positive in the list above — a place and a museum about that place share a
name stem constantly, and they are two different stops.

WHICH RECORD WINS

The one that will rank best and display best: a Wikidata id first (it is the
notability signal and the better-mapped record), then the higher category
baseline, then the longer name — "Killarney National Park" as a National park
beats the same place as a generic Attraction.
"""

import json
import math
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

IN = "scripts/output/pois_raw.json"
OUT = "scripts/output/pois_deduped.json"

# How far apart two records can be and still be one place, by category.
# Area features are mapped as polygons whose centroid depends on where the
# boundary happens to be drawn, so two mappings diverge; a summit or a museum
# door does not.
RADIUS_KM = {
    "National park": 25.0,
    "Nature reserve": 8.0,
    "Beach": 1.5,          # beaches are linear; two mappings sit apart
    "Historic site": 0.6,
}
RADIUS_KM_DEFAULT = 0.6

# Categories that describe the same KIND of thing, so the heavy name match is
# safe between them. Everything not listed only matches its own category.
FAMILIES = [
    {"National park", "Nature reserve"},
    {"Castle", "Ruins"},
    {"Museum", "Gallery"},
]

# Dropped only in the HEAVY comparison, which never runs across families.
# Category nouns are NOT in this list on purpose — see the module docstring.
GENERIC_PHRASES = [
    "national nature reserve", "local nature reserve", "nature reserve",
    "national park", "country park", "national forest", "forest park",
    "marine reserve", "wildlife reserve", "nature park", "game reserve",
]
GENERIC_WORDS = {"the", "a", "an", "of", "and", "at", "national", "park", "reserve"}


def light(name):
    """Case/accent/punctuation-insensitive key. Every word kept."""
    s = unicodedata.normalize("NFKD", name.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    # Apostrophes are deleted, not spaced out, so a possessive matches the
    # spelling without one: "Dr Johnson's House" and "Dr. Johnsons House" are
    # the same museum, but spacing the apostrophe leaves a stray "s" token and
    # they never match.
    s = re.sub(r"['‘’ʼ]", "", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def heavy(name):
    """Light key with generic park/reserve wording dropped. Same-family only."""
    s = light(name)
    for phrase in GENERIC_PHRASES:
        s = s.replace(phrase, " ")
    tokens = [t for t in s.split() if t and t not in GENERIC_WORDS]
    # If stripping removed everything ("The National Park"), keep the light key
    # rather than letting every such record match every other.
    return " ".join(tokens) if tokens else s


def same_family(a, b):
    if a == b:
        return True
    return any(a in f and b in f for f in FAMILIES)


def radius(a, b):
    return max(RADIUS_KM.get(a, RADIUS_KM_DEFAULT), RADIUS_KM.get(b, RADIUS_KM_DEFAULT))


def km(a, b):
    """Great-circle distance. Cheap enough — only called on near neighbours."""
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def better(a, b, base):
    """True if a should be kept over b."""
    ka = (1 if a.get("wikidata") else 0, base.get(a["category"], 5), len(a["name"]))
    kb = (1 if b.get("wikidata") else 0, base.get(b["category"], 5), len(b["name"]))
    return ka >= kb


# A name that recurs across the dataset is a label, not a name — "Railway
# viaduct", "Hut Circle", "Engine House". Two of those 200m apart are two
# viaducts, not one mapped twice, so they have to almost coincide to merge.
SAME_WIKIDATA_RADIUS_KM = 40.0
GENERIC_NAME_MIN_USES = 5
GENERIC_NAME_RADIUS_KM = 0.05

# ...except when the repeated name belongs to a BOUNDARY. A large protected
# area is often mapped as many separate ways, each carrying the area's name
# and tags: "Strangford AONB" arrives as 107 records spread over ~25km. The
# generic-name rule above reads 107 uses as "this is a label, not a name" and
# tightens the radius to 50m, so the fragments survive as 107 near-identical
# pins in a region that only has 541 POIs in total.
#
# A boundary tag is what separates the two cases. "Railway viaduct" is a node
# or a short way with no boundary, repeated across the country because it is
# a description; a named boundary is one area, however many ways OSM splits
# it into. So same-name records that BOTH carry a boundary tag merge at a
# radius big enough to span the whole area, and skip the generic-name rule.
BOUNDARY_FRAGMENT_RADIUS_KM = 40.0

# The same escape applies to an area with no boundary tag, which is commoner
# than it sounds: "Risley, Holcroft and Chat Moss National Nature Reserve" is
# 11 ways carrying nothing but leisure=nature_reserve, inside 9.7km.
#
# Two conditions together, because neither is safe alone. The name has to be
# specific — a real name, not a description — and every record sharing it has
# to sit in a small area. "Hut Circle" and "Crannog" are short descriptions;
# "St Mary's Church" is specific but spread across the country, and those are
# ten different churches. Only a long name in one place means one thing mapped
# many times.
FRAGMENT_EXTENT_KM = 15.0
SPECIFIC_NAME_CHARS = 25
SPECIFIC_NAME_WORDS = 4


def is_boundary(p):
    return bool((p.get("tags") or {}).get("boundary"))


def specific(name):
    return len(name) >= SPECIFIC_NAME_CHARS or len(name.split()) >= SPECIFIC_NAME_WORDS


def dedupe(pois, base, verbose=True):
    # Bucket by a ~28km grid cell so we only ever compare near neighbours
    # instead of all pairs — 27k records all-pairs is 360M comparisons.
    cell = 0.25
    grid = {}
    name_uses = {}
    for i, p in enumerate(pois):
        key = (int(p["lat"] / cell), int(p["lng"] / cell))
        grid.setdefault(key, []).append(i)
        lk = light(p["name"])
        name_uses[lk] = name_uses.get(lk, 0) + 1

    # How far apart the records sharing each name are, as a bbox diagonal.
    # Cheap, and only used to tell one fragmented area from a repeated label.
    spread = {}
    for p in pois:
        lk = light(p["name"])
        b = spread.get(lk)
        if b is None:
            spread[lk] = [p["lat"], p["lat"], p["lng"], p["lng"]]
        else:
            b[0] = min(b[0], p["lat"]); b[1] = max(b[1], p["lat"])
            b[2] = min(b[2], p["lng"]); b[3] = max(b[3], p["lng"])
    extent = {k: km((b[0], b[2]), (b[1], b[3])) for k, b in spread.items()}

    # How many ids each Wikidata entity is claimed by, so the wide scan below
    # is spent only on records that could actually use it.
    id_uses = {}
    for p in pois:
        if p.get("wikidata"):
            id_uses[p["wikidata"]] = id_uses.get(p["wikidata"], 0) + 1

    # The grid silently caps every merge radius: ±1 cell of 0.25° reaches about
    # 30km of longitude at Scottish latitudes, so the 40km boundary-fragment
    # and same-id rules could never fire at their stated distance — the two
    # records were never compared. Loch Lomond's three pieces span 28km and
    # sat in cells two apart. Widen the scan to cover the largest radius, but
    # only for the records that can reach it (a boundary, or a shared id);
    # everything else keeps the cheap 3x3 and the old cost.
    wide = max(BOUNDARY_FRAGMENT_RADIUS_KM, SAME_WIKIDATA_RADIUS_KM)

    def spans(p, far):
        if not far:
            return 1, 1
        sy = int(math.ceil(wide / (111.0 * cell)))
        coslat = max(math.cos(math.radians(p["lat"])), 0.05)
        sx = int(math.ceil(wide / (111.0 * coslat * cell)))
        return sy, sx

    merged_into = {}
    merges = []
    for i, p in enumerate(pois):
        if i in merged_into:
            continue
        pl, ph = light(p["name"]), heavy(p["name"])
        gy, gx = int(p["lat"] / cell), int(p["lng"] / cell)
        sy, sx = spans(p, is_boundary(p) or id_uses.get(p.get("wikidata"), 0) > 1)
        for dy in range(-sy, sy + 1):
            for dx in range(-sx, sx + 1):
                for j in grid.get((gy + dy, gx + dx), ()):
                    if j <= i or j in merged_into:
                        continue
                    q = pois[j]
                    d = km((p["lat"], p["lng"]), (q["lat"], q["lng"]))
                    limit = radius(p["category"], q["category"])
                    same_name = pl == light(q["name"])
                    same_id = (bool(p.get("wikidata"))
                               and p.get("wikidata") == q.get("wikidata"))
                    if same_name and same_id:
                        # Same name and both pointing at the same Wikidata
                        # entity: they are not two things that happen to share
                        # a label, they are two mappings of one thing. Trust
                        # that over the distance heuristics — this is what
                        # rescues an entity OSM split into pieces with no
                        # boundary tag to recognise it by.
                        limit = max(limit, SAME_WIKIDATA_RADIUS_KM)
                    elif same_name and is_boundary(p) and is_boundary(q):
                        limit = max(limit, BOUNDARY_FRAGMENT_RADIUS_KM)
                    elif (same_name and specific(p["name"])
                          and extent.get(pl, 0) <= FRAGMENT_EXTENT_KM):
                        pass   # one area mapped as many pieces; category radius
                    elif max(name_uses.get(pl, 0),
                             name_uses.get(light(q["name"]), 0)) >= GENERIC_NAME_MIN_USES:
                        limit = min(limit, GENERIC_NAME_RADIUS_KM)
                    if d > limit:
                        continue
                    hit = None
                    if pl == light(q["name"]):
                        hit = "light"
                    elif same_family(p["category"], q["category"]) and ph == heavy(q["name"]):
                        hit = "heavy"
                    if not hit:
                        continue
                    keep, drop = (i, j) if better(p, q, base) else (j, i)
                    merged_into[drop] = keep
                    merges.append((hit, d, pois[keep], pois[drop]))
                    if drop == i:
                        break

    kept = [p for i, p in enumerate(pois) if i not in merged_into]
    # A dropped record can still carry the only Wikidata id, which is the
    # notability signal — move it across rather than losing the ranking.
    by_index = {id(p): p for p in kept}
    for drop, keep in merged_into.items():
        k, d = pois[keep], pois[drop]
        if not k.get("wikidata") and d.get("wikidata"):
            k["wikidata"] = d["wikidata"]
    if verbose:
        print(f"{len(pois)} -> {len(kept)} ({len(merges)} merged)")
    return kept, merges


def main():
    if not os.path.exists(IN):
        raise SystemExit(f"{IN} not found — run fetch_pois.py first")
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "fp", os.path.join(os.path.dirname(os.path.abspath(__file__)), "fetch_pois.py"))
    fp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fp)

    pois = json.load(open(IN, encoding="utf-8"))
    kept, merges = dedupe(pois, fp.CATEGORY_BASE)

    print("\nSample merges:")
    for hit, d, keep, drop in merges[:25]:
        print(f"  [{hit:<6} {d:5.2f}km] kept {keep['category']:<14}{keep['name']}")
        print(f"  {'':16} drop {drop['category']:<14}{drop['name']}")
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(kept, fh, ensure_ascii=False, indent=1)
    print(f"\nWrote {len(kept)} -> {OUT}")


if __name__ == "__main__":
    main()
