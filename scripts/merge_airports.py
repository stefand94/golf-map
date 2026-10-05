#!/usr/bin/env python3
"""GOLF-153: scripts/output/airports.json -> data/airports.js.

The second half of the fetch-once pattern: fetch_airports.py gets the
data, this writes the file the app loads. Unlike data/courses-*.js this
file has no identity problem to protect — nothing references an airport
by position, only by its IATA code — so it is written whole each time
rather than patched in place.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'output', 'airports.json')
OUT = os.path.join(ROOT, 'data', 'airports.js')

HEAD = '''/* ============================================================
   data/airports.js — the airports a trip can start from (GOLF-153).

   Used by detailed mode's flight entry: picking one gives the arrival
   its coordinates, which is what earns the flight a drive leg to the
   first course like any other located stop.

   Scheduled passenger airports (large + medium, with an IATA code) in
   the three countries the app covers. Source: OurAirports
   (https://ourairports.com/data/), public domain, fetched {date}.
   Rebuilt by scripts/fetch_airports.py + scripts/merge_airports.py —
   do not hand-edit. See docs/data-provenance.md.

   AIRPORTS[] = {{iata, name, town, nation:'gb'|'ie'|'za', lat, lng, big}}
   ============================================================ */

const AIRPORTS=[
'''


def main():
    rows = json.load(open(SRC, encoding='utf-8'))
    date = __import__('datetime').date.today().isoformat()
    lines = []
    for a in rows:
        lines.append(json.dumps({
            'iata': a['iata'], 'name': a['name'], 'town': a['town'],
            'nation': a['nation'], 'lat': a['lat'], 'lng': a['lng'],
            'big': a['big'],
        }, ensure_ascii=False, separators=(',', ':')))
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(HEAD.format(date=date))
        f.write(',\n'.join(lines))
        f.write('\n];\n')
    print(f'{len(rows)} airports -> {OUT}')


if __name__ == '__main__':
    main()
