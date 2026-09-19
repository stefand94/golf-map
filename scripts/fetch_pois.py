#!/usr/bin/env python3
"""
GOLF-148: build the notable-POI dataset — "things worth stopping for" along
a golf trip: whisky distilleries, castles, national parks, beaches, museums,
viewpoints, lighthouses and so on.

WHY THIS IS A BUILD-TIME SCRIPT AND NOT A RUNTIME QUERY
-------------------------------------------------------
Hotels have to be live: they're dense, they open and close, and you can pan
anywhere. Notable POIs are the opposite — sparse, stable (castles don't
move), and the product only ever shows the top handful along a route. That
makes the whole useful dataset small enough to ship as a static file, which
is the same "zero runtime API calls for course data" pattern the course data
already uses (CLAUDE.md). Consequences worth stating plainly:

  * no Overpass on the runtime path at all, so none of its 8-50s latency,
    its 504s, or its fair-use limits (DEC-016) apply to this feature;
  * ranking is computed once, here, instead of per request;
  * the "show more POIs" button is a deeper slice of an array already in
    memory rather than a second slow round trip.

RANKING
-------
Notability is Wikidata sitelink count: how many language Wikipedias have an
article about the thing. Edinburgh Castle has ~60, a minor listed building
has 1, most things have none. It's a far better "is this worth a detour"
signal than anything in the OSM tags, and it costs nothing at runtime
because it's baked in here.

That alone would rank a famous museum above every beach in the country, so
each category also carries a baseline score (CATEGORY_BASE) — a national
park is worth stopping for whether or not anyone wrote an article about it.
Final score = category baseline + sitelinks. Deliberately simple and
inspectable; tune the table, not the formula.

Same fetch-once -> JSON intermediate -> scripted merge pattern as every
other script here (CLAUDE.md). This writes JSON only; it never touches
data/*.js.

Usage:
    python3 scripts/fetch_pois.py                 # all regions
    python3 scripts/fetch_pois.py --region scotland southafrica
    python3 scripts/fetch_pois.py --skip-wikidata # Overpass only, fast
    # writes scripts/output/pois_raw.json
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# overpass-api.de first and a real User-Agent: it answers 406 to a request
# without one (see GOLF-147 — this is what had the Cloudflare Worker pinned
# to the slower mirror for months).
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
UA = "golf-map-dev-script (one-off static data fetch, see scripts/README.md)"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
OUT = "scripts/output/pois_raw.json"

# OSM relation ids -> Overpass area id is 3600000000 + relation id. The bbox
# is only used to cut a region into tiles (see TILE_DEG); the area id is what
# actually decides membership, so tiles never bleed across a border.
REGIONS = {
    "england":          {"area": 58447,  "bbox": (49.8, -6.5, 55.9, 1.9)},
    "scotland":         {"area": 58446,  "bbox": (54.6, -8.7, 60.9, -0.7)},
    "wales":            {"area": 58437,  "bbox": (51.3, -5.5, 53.5, -2.6)},
    "ireland":          {"area": 62273,  "bbox": (51.4, -10.7, 55.5, -5.9)},
    "northern-ireland": {"area": 156393, "bbox": (54.0, -8.2, 55.3, -5.4)},
    "southafrica":      {"area": 87565,  "bbox": (-35.0, 16.4, -22.1, 33.0)},
}

# A whole-country query for the heavier groups does not complete: England's
# `heritage` group (10 tag clauses across the entire country) 504'd on
# overpass-api.de and then sat on the slow mirror indefinitely. Tiling is the
# fix — each tile is a small, fast query, one failure loses one tile rather
# than a whole region, and it keeps the tag lists broad (the owner explicitly
# wants a lot of POIs, so shrinking the tag list was the wrong lever).
TILE_DEG = 2.5

# Two queries per tile, not one per theme. Tiling already keeps each query
# small, so splitting further only multiplies round trips (518 -> 148 across
# all regions). The split that does still matter is the notability gate:
#
#   GATED_TAGS   kept only when the object carries a wikipedia/wikidata tag.
#                "museum", "attraction", "viewpoint" and "peak" are applied
#                to enormous numbers of trivial objects — every village
#                display case, every cairn — so without a gate they'd swamp
#                the dataset and drown the things worth driving to.
#
#   OPEN_TAGS    kept regardless, because the tag *is* the recommendation.
#                A working distillery with no Wikipedia article is precisely
#                what this feature exists to surface; likewise a national
#                park, a beach or a lighthouse.
GATED_TAGS = [
    # heritage
    '["historic"="castle"]', '["historic"="fort"]',
    '["historic"="ruins"]', '["historic"="monument"]',
    '["historic"="archaeological_site"]', '["historic"="manor"]',
    '["historic"="church"]', '["building"="cathedral"]',
    '["historic"="tower"]', '["historic"="battlefield"]',
    '["historic"="garden"]',
    # culture
    '["tourism"="museum"]', '["tourism"="gallery"]',
    '["tourism"="attraction"]', '["tourism"="artwork"]',
    '["tourism"="zoo"]', '["tourism"="aquarium"]',
    '["tourism"="theme_park"]',
    # views
    '["tourism"="viewpoint"]', '["natural"="peak"]',
    '["leisure"="garden"]["garden:type"="botanical"]',
]

OPEN_TAGS = [
    # drink — the original ask ("whisky distilleries")
    '["craft"="distillery"]', '["craft"="brewery"]',
    '["craft"="winery"]', '["industrial"="distillery"]',
    # nature
    #
    # boundary=national_park alone finds almost nothing in the UK. The first
    # version queried only that and came back with zero national parks in
    # England and Wales, and Loch Lomond but not the Cairngorms in Scotland —
    # which reads like "OSM is missing the Lake District" and is really a
    # tagging-convention mismatch. UK parks are mapped as
    # boundary=protected_area carrying designation=national_park, and the 31
    # boundary=national_park objects in England are mostly unnamed fragments.
    # Both spellings are queried; dedupe_pois.py collapses parks that carry
    # both (National park has a 25km merge radius for exactly this reason).
    #
    # The protected_area clauses are deliberately qualified by designation or
    # protect_class. Bare boundary=protected_area would pull in every SSSI and
    # local nature reserve in Britain — tens of thousands of records that are
    # legal designations, not places you would drive to.
    '["boundary"="national_park"]',
    '["boundary"="protected_area"]["designation"="national_park"]',
    '["boundary"="protected_area"]["protect_class"="2"]',
    '["leisure"="nature_reserve"]',
    # waterfalls are waterway=waterfall, NOT natural=waterfall. The first
    # version queried the latter and collected exactly one waterfall from
    # England, Scotland and Wales combined — which is the kind of wrong that
    # looks like working code, because a query for a nonexistent tag returns
    # a valid empty result rather than an error.
    '["waterway"="waterfall"]', '["natural"="cave_entrance"]',
    '["natural"="arch"]', '["natural"="hot_spring"]',
    # coast
    '["natural"="beach"]', '["man_made"="lighthouse"]',
]

GROUPS = [
    {"name": "notable", "gated": True, "tags": GATED_TAGS},
    {"name": "open", "gated": False, "tags": OPEN_TAGS},
]

# Baseline "worth a detour" score before notability is added. These are
# judgement calls, and they are meant to be edited — they encode the product
# opinion that a national park beats a gallery for a golf road trip.
CATEGORY_BASE = {
    "National park": 45,
    "Distillery": 35,
    "Castle": 30,
    "Nature reserve": 22,
    "Beach": 20,
    "Waterfall": 20,
    "Winery": 20,
    "Brewery": 16,
    "Museum": 15,
    "Lighthouse": 15,
    "Cathedral": 15,
    "Hot spring": 15,
    "Arch": 14,
    "Aquarium": 12,
    "Church": 10,
    "Historic site": 12,
    "Ruins": 12,
    "Gardens": 12,
    "Viewpoint": 10,
    "Gallery": 10,
    "Cave": 10,
    "Attraction": 8,
    "Zoo": 12,
    "Peak": 8,
    "Monument": 8,
    "Artwork": 4,
}

# First match wins, so order matters: a castle that is also an attraction
# should read as a castle.
CATEGORY_RULES = [
    # All three spellings of "this is a national park" are tested first, and
    # ahead of leisure=nature_reserve: a park boundary often carries the
    # reserve tag too, and the first matching rule wins.
    (("boundary", "national_park"), "National park"),
    (("designation", "national_park"), "National park"),
    (("protect_class", "2"), "National park"),
    (("craft", "distillery"), "Distillery"),
    (("industrial", "distillery"), "Distillery"),
    (("craft", "winery"), "Winery"),
    (("craft", "brewery"), "Brewery"),
    (("historic", "castle"), "Castle"),
    (("historic", "fort"), "Castle"),
    (("historic", "manor"), "Historic site"),
    (("historic", "ruins"), "Ruins"),
    (("historic", "archaeological_site"), "Ruins"),
    (("historic", "battlefield"), "Historic site"),
    (("historic", "monument"), "Monument"),
    (("historic", "tower"), "Historic site"),
    # building=cathedral must be tested BEFORE historic=church: a cathedral
    # usually carries both, and the first matching rule wins.
    (("building", "cathedral"), "Cathedral"),
    (("historic", "church"), "Church"),
    (("leisure", "nature_reserve"), "Nature reserve"),
    (("waterway", "waterfall"), "Waterfall"),
    (("natural", "cave_entrance"), "Cave"),
    (("natural", "arch"), "Arch"),
    (("natural", "hot_spring"), "Hot spring"),
    (("natural", "beach"), "Beach"),
    (("man_made", "lighthouse"), "Lighthouse"),
    (("tourism", "museum"), "Museum"),
    (("tourism", "gallery"), "Gallery"),
    (("tourism", "zoo"), "Zoo"),
    (("tourism", "aquarium"), "Aquarium"),
    (("tourism", "theme_park"), "Attraction"),
    (("tourism", "viewpoint"), "Viewpoint"),
    (("tourism", "artwork"), "Artwork"),
    (("natural", "peak"), "Peak"),
    (("historic", "garden"), "Gardens"),
    (("leisure", "garden"), "Gardens"),
    (("tourism", "attraction"), "Attraction"),
]


def categorise(tags):
    for (k, v), label in CATEGORY_RULES:
        if tags.get(k) == v:
            return label
    if "historic" in tags:
        return "Historic site"
    return "Attraction"


# Tags kept on each record for scoring. Overpass already returns all of them
# (the queries end `out center tags`), so this is free.
SCORING_TAGS = (
    "designation", "protect_class", "protection_title", "heritage",
    "listed_status", "blue_flag", "website", "whc:criteria",
)

# Every key CATEGORY_RULES reads, kept alongside them so that a bad rule can
# be corrected by re-running categorise() over the saved JSON instead of
# re-fetching the whole dataset from Overpass.
#
# WHY: this has now cost two full re-fetches. `historic=church` was mapped to
# "Cathedral", which gave ~450 parish churches a cathedral's baseline — Britain
# has about 60 cathedrals and the first dataset had 511. The fix was one line,
# but the records had kept only the scoring tags, so nothing on disk could say
# which of the 511 were churches. Overpass had to be asked again for data it
# had already sent. Derived from CATEGORY_RULES rather than hand-listed, so a
# new rule cannot forget to add its key here.
CATEGORY_TAGS = tuple(sorted({k for (k, _), _ in CATEGORY_RULES}))
KEEP_TAGS = tuple(sorted(set(SCORING_TAGS) | set(CATEGORY_TAGS)))

# How much each designation is worth on top of the category baseline.
#
# WHY THIS EXISTS: notability came only from Wikidata sitelinks, which works
# for a castle and not at all for a nature reserve — 20% of reserves have a
# Wikidata id, 9% of beaches, 7% of breweries. Everything else scored exactly
# its category baseline, so ~30% of the dataset was tied with no tiebreaker
# and "the 5 most notable things" would have returned five alphabetically
# first reserves. These tags are the signal that distinguishes them, and OSM
# already carries it: protect_class is an IUCN severity scale, and the UK
# designations say plainly whether something is nationally or locally
# important.
PROTECT_CLASS_BONUS = {
    "1a": 25, "1b": 25, "2": 25, "3": 12, "4": 8, "5": 10, "6": 5,
    "7": 2,  # UK Local Nature Reserve — the common case, deliberately low
}
DESIGNATION_BONUS = {
    "world_heritage_site": 40,
    "national_park": 25,
    "national_nature_reserve": 18,
    "area_of_outstanding_natural_beauty": 12,
    "ramsar": 10,
    "site_of_special_scientific_interest": 8,
    "special_area_of_conservation": 8,
    "special_protection_area": 8,
    "local_nature_reserve": 2,
}
HERITAGE_BONUS = {"1": 20, "2": 12, "3": 6, "4": 3, "yes": 4}
LISTED_BONUS = {"grade i": 15, "grade ii*": 8, "grade ii": 3}


def tag_bonus(tags):
    """Notability from designation tags, for records Wikidata can't rank."""
    if not tags:
        return 0
    # Protection signals are combined with max(), not sum(). `designation`,
    # `protection_title` and `protect_class` are three ways of stating the
    # SAME fact — a national park routinely carries designation=national_park
    # and protect_class=2 — so summing them scores a place for how thoroughly
    # it happens to be tagged rather than for how protected it is, and rewards
    # mapping completeness over significance. The strongest designation wins;
    # genuinely independent axes (heritage listing, blue flag) still add.
    protection = 0
    raw = (tags.get("designation") or "").lower()
    raw = raw + ";" + (tags.get("protection_title") or "").lower()
    for token in re.split(r"[;,]", raw):
        key = token.strip().replace(" ", "_")
        if key in DESIGNATION_BONUS:
            protection = max(protection, DESIGNATION_BONUS[key])
    protection = max(
        protection,
        PROTECT_CLASS_BONUS.get(str(tags.get("protect_class", "")).strip().lower(), 0),
    )
    bonus = protection
    bonus += HERITAGE_BONUS.get(str(tags.get("heritage", "")).strip().lower(), 0)
    bonus += LISTED_BONUS.get(str(tags.get("listed_status", "")).strip().lower(), 0)
    if str(tags.get("blue_flag", "")).lower() == "yes":
        bonus += 12
    # Weak signal, deliberately worth almost nothing on its own: someone
    # bothered to add a website, so the place is maintained rather than a
    # bare polygon. Only ever breaks a tie between two otherwise equal records.
    if tags.get("website"):
        bonus += 1
    return bonus


def check_tag_coverage():
    """Every queried tag needs a CATEGORY_RULE and every category a baseline.

    Without this, a queried tag with no rule falls through categorise() to
    "Attraction" and scores 8 — so the POIs are silently mis-labelled and
    under-ranked instead of missing, which is far harder to notice than an
    empty category. natural=arch and natural=hot_spring shipped that way in
    the first version: both were queried, neither had a rule, and both
    disappeared into the Attraction pile where nothing looked wrong.
    """
    rule_keys = {kv for kv, _ in CATEGORY_RULES}
    problems = []
    for group in GROUPS:
        for tag in group["tags"]:
            pairs = re.findall(r'\["([^"]+)"="([^"]+)"\]', tag)
            if not pairs:
                problems.append(f"unparseable tag filter: {tag}")
            elif not any(p in rule_keys for p in pairs):
                problems.append(f"{tag} has no CATEGORY_RULES entry")
    for _, label in CATEGORY_RULES:
        if label not in CATEGORY_BASE:
            problems.append(f'category "{label}" has no CATEGORY_BASE score')
    if problems:
        raise SystemExit(
            "fetch_pois.py is misconfigured:\n  "
            + "\n  ".join(problems)
        )


# overpass-api.de starts returning 429 well before this script runs out of
# work, and the first version treated a 429 as "this mirror is dead, try the
# other one, then give up on the tile" — which silently dropped whole tiles
# from the dataset. A rate limit is a "wait", not a failure: back off and come
# back. Holes in a pre-baked dataset are invisible at runtime (the map just
# quietly has no castles in one county), so losing a tile must be loud and
# retried rather than shrugged off.
MAX_ATTEMPTS = 5
BACKOFF_BASE_S = 20
# Pause between successful tiles. 2s provoked sustained 429s from
# overpass-api.de; this run is a one-off and correctness beats speed.
TILE_PAUSE_S = 6
# Tiles that failed every attempt of both passes, reported loudly at the end
# so a holey dataset is never mistaken for a complete one.
HOLES = []


def overpass(query, attempt_label):
    """POST a query to each mirror, retrying with backoff. None if all fail."""
    body = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(MAX_ATTEMPTS):
        for url in OVERPASS_URLS:
            host = url.split("/")[2]
            try:
                req = urllib.request.Request(
                    url, data=body, headers={"User-Agent": UA}
                )
                with urllib.request.urlopen(req, timeout=600) as resp:
                    return json.loads(resp.read())
            except urllib.error.HTTPError as exc:
                retryable = exc.code in (429, 502, 503, 504)
                print(f"    {attempt_label}: {host} HTTP {exc.code}"
                      f"{' (will retry)' if retryable else ''}",
                      file=sys.stderr, flush=True)
                if not retryable:
                    continue
            except Exception as exc:  # noqa: BLE001
                print(f"    {attempt_label}: {host} failed ({exc})",
                      file=sys.stderr, flush=True)
        # Both mirrors refused this round — wait longer each time. 429 in
        # particular means "you are asking too fast", so the pause has to be
        # substantial rather than a token sleep.
        if attempt < MAX_ATTEMPTS - 1:
            wait = BACKOFF_BASE_S * (2 ** attempt)
            print(f"    {attempt_label}: backing off {wait}s "
                  f"(attempt {attempt + 2}/{MAX_ATTEMPTS})", flush=True)
            time.sleep(wait)
    return None


def tiles(bbox, step=TILE_DEG):
    """Cut a region bbox into <=step-degree tiles."""
    south, west, north, east = bbox
    out = []
    lat = south
    while lat < north:
        lng = west
        while lng < east:
            out.append((lat, lng, min(lat + step, north), min(lng + step, east)))
            lng += step
        lat += step
    return out


def build_query(area_id, group, tile):
    s, w, n, e = tile
    # Each clause is filtered by BOTH the tile bbox and the region area, so a
    # tile that straddles a border still only yields that region's objects.
    clauses = "\n".join(
        f"  nwr{tag}({s:.4f},{w:.4f},{n:.4f},{e:.4f})(area.r);"
        for tag in group["tags"]
    )
    # `out center tags` gives one representative coordinate for ways and
    # relations (a national park is a huge polygon; we want a pin).
    return (
        f"[out:json][timeout:300];\n"
        f"area({3600000000 + area_id})->.r;\n"
        f"(\n{clauses}\n);\n"
        f"out center tags;"
    )


def collect(data, group, region, found):
    kept = 0
    for el in data.get("elements", []):
        tags = el.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        wikidata = tags.get("wikidata")
        if group["gated"] and not (wikidata or tags.get("wikipedia")):
            continue
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lng = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lng is None:
            continue
        key = f"{el['type']}/{el['id']}"
        # Tiles share edges and an object can carry tags from two groups, so
        # dedupe on the OSM id rather than trusting the queries not to overlap.
        found[key] = {
            "name": name,
            "category": categorise(tags),
            "lat": round(float(lat), 5),
            "lng": round(float(lng), 5),
            "region": region,
            "wikidata": wikidata,
            "osm": key,
            # Which GROUPS entry produced this record. Not shipped to the
            # browser — it exists so a single group can be re-fetched after a
            # tag fix and merged back over the previous run without redoing
            # the groups that were already correct.
            "group": group["name"],
            # Designation/protection tags, kept for scoring. `out center tags`
            # already returns every tag on the object, so these cost nothing
            # extra to collect — the first version downloaded them and threw
            # them away, which is why 30% of records ended up with no
            # tiebreaker at all. See tag_bonus().
            "tags": {k: tags[k] for k in KEEP_TAGS if k in tags},
        }
        kept += 1
    return kept


def fetch_region(region, spec, only_groups=None):
    found = {}
    region_tiles = tiles(spec["bbox"])
    for group in GROUPS:
        if only_groups and group["name"] not in only_groups:
            continue
        kept = 0
        pending = list(enumerate(region_tiles, 1))
        # Two passes: anything still failing after the in-request backoff gets
        # one more go at the end, by which point the rate limit has usually
        # cleared. A tile that fails both passes is reported as a hole rather
        # than silently missing.
        for final_pass in (False, True):
            if not pending:
                break
            if final_pass:
                print(f"  [{region}] retrying {len(pending)} failed tile(s) "
                      f"after a pause…", flush=True)
                time.sleep(60)
            still_failing = []
            for i, tile in pending:
                label = f"{region}/{group['name']} tile {i}/{len(region_tiles)}"
                data = overpass(build_query(spec["area"], group, tile), label)
                if data is None:
                    still_failing.append((i, tile))
                    continue
                kept += collect(data, group, region, found)
                # Courtesy pause — a free shared service, and DEC-016's
                # fair-use constraint applies here as much as to the Worker.
                time.sleep(TILE_PAUSE_S)
            pending = still_failing
        if pending:
            holes = ", ".join(str(i) for i, _ in pending)
            HOLES.append(f"{region}/{group['name']} tiles {holes}")
            print(f"    !! {region}/{group['name']}: {len(pending)} tile(s) "
                  f"UNRECOVERED ({holes})", file=sys.stderr, flush=True)
        print(f"  [{region}] {group['name']:<10} kept {kept:>5}", flush=True)
    return list(found.values())


def add_sitelinks(pois):
    """Fill in Wikidata sitelink counts, 50 ids per API call."""
    ids = sorted({p["wikidata"] for p in pois if p.get("wikidata")})
    print(f"\nResolving notability for {len(ids)} Wikidata ids…", flush=True)
    counts = {}
    for i in range(0, len(ids), 50):
        batch = ids[i:i + 50]
        params = urllib.parse.urlencode({
            "action": "wbgetentities",
            "ids": "|".join(batch),
            "props": "sitelinks",
            "format": "json",
        })
        try:
            req = urllib.request.Request(
                f"{WIKIDATA_API}?{params}", headers={"User-Agent": UA}
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                entities = json.loads(resp.read()).get("entities", {})
            for qid, ent in entities.items():
                counts[qid] = len(ent.get("sitelinks") or {})
        except Exception as exc:  # noqa: BLE001
            print(f"  batch {i//50}: failed ({exc}) — scored as 0",
                  file=sys.stderr, flush=True)
        if (i // 50) % 10 == 0:
            print(f"  …{min(i + 50, len(ids))}/{len(ids)}", flush=True)
        time.sleep(0.3)
    return counts


def _dump(path, pois):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(pois, fh, ensure_ascii=False, indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", nargs="*", choices=sorted(REGIONS),
                    help="regions to fetch (default: all)")
    ap.add_argument("--group", nargs="*",
                    choices=[g["name"] for g in GROUPS],
                    help="only these category groups")
    ap.add_argument("--skip-wikidata", action="store_true",
                    help="skip notability lookup (everything scores on its "
                         "category baseline alone)")
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()
    check_tag_coverage()

    regions = args.region or list(REGIONS)
    pois = []
    for region in regions:
        print(f"\n=== {region} ===", flush=True)
        pois.extend(fetch_region(region, REGIONS[region], args.group))
        # Write after each region so a later failure never loses earlier work.
        _dump(args.out, pois)

    if not pois:
        print("No POIs fetched — nothing written.", file=sys.stderr)
        return 1

    counts = {} if args.skip_wikidata else add_sitelinks(pois)
    for p in pois:
        sitelinks = counts.get(p.get("wikidata") or "", 0)
        p["sitelinks"] = sitelinks
        # Three independent parts: what kind of thing it is, how widely it is
        # written about, and how it is formally designated. The third is what
        # ranks the ~30% of records Wikidata has never heard of.
        p["bonus"] = tag_bonus(p.get("tags"))
        p["score"] = CATEGORY_BASE.get(p["category"], 5) + sitelinks + p["bonus"]
    pois.sort(key=lambda p: (-p["score"], p["name"]))

    _dump(args.out, pois)
    print(f"\nWrote {len(pois)} POIs -> {args.out}")
    by_region, by_cat = {}, {}
    for p in pois:
        by_region[p["region"]] = by_region.get(p["region"], 0) + 1
        by_cat[p["category"]] = by_cat.get(p["category"], 0) + 1
    print("\nBy region:")
    for k, v in sorted(by_region.items(), key=lambda kv: -kv[1]):
        print(f"  {k:<18}{v:>6}")
    print("\nBy category:")
    for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1]):
        print(f"  {k:<18}{v:>6}")
    print("\nTop 15 by score:")
    for p in pois[:15]:
        print(f"  {p['score']:>4}  {p['category']:<14}{p['name']}")

    if HOLES:
        print("\n!! INCOMPLETE — these tiles never succeeded, so the dataset "
              "has gaps in those areas:", file=sys.stderr)
        for h in HOLES:
            print(f"   {h}", file=sys.stderr)
        print("   Re-run with --region/--group to fill them before merging.",
              file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
