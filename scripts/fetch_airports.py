#!/usr/bin/env python3
"""GOLF-153: the airports a visitor can fly into, for detailed mode.

Fetch-once, like every other data job here (see scripts/README.md): this
writes a JSON intermediate to scripts/output/, and merge_airports.py turns
that into data/airports.js. It is not run by the app and not run on a
schedule — airports do not move.

Source: OurAirports (https://ourairports.com/data/), released into the
PUBLIC DOMAIN by its authors. Recorded in docs/data-provenance.md.

Scope: the three countries the app covers (GB, IE, ZA), scheduled
passenger airports only — large_airport and medium_airport carrying an
IATA code. That is the set someone can actually book a flight into, and
it keeps the shipped file small enough to precache.
"""
import csv, io, json, os, sys, urllib.request

SRC = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
COUNTRIES = {'GB': 'gb', 'IE': 'ie', 'ZA': 'za'}
KINDS = {'large_airport', 'medium_airport'}
OUT = os.path.join(os.path.dirname(__file__), 'output', 'airports.json')


def main():
    raw = (open(sys.argv[1], encoding='utf-8').read() if len(sys.argv) > 1
           else urllib.request.urlopen(SRC, timeout=120).read().decode('utf-8'))
    rows = []
    for r in csv.DictReader(io.StringIO(raw)):
        if r['iso_country'] not in COUNTRIES or r['type'] not in KINDS:
            continue
        iata = (r.get('iata_code') or '').strip().upper()
        if len(iata) != 3:
            continue
        try:
            lat, lng = round(float(r['latitude_deg']), 4), round(float(r['longitude_deg']), 4)
        except (TypeError, ValueError):
            continue
        rows.append({
            'iata': iata,
            'name': (r.get('name') or '').strip(),
            'town': (r.get('municipality') or '').strip(),
            'nation': COUNTRIES[r['iso_country']],
            'lat': lat, 'lng': lng,
            'big': r['type'] == 'large_airport',
        })
    rows.sort(key=lambda a: (a['nation'], not a['big'], a['iata']))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(rows, f, indent=1, ensure_ascii=False)
    by = {}
    for a in rows:
        by[a['nation']] = by.get(a['nation'], 0) + 1
    print(f'{len(rows)} airports -> {OUT}')
    print('  ' + ', '.join(f'{k}: {v}' for k, v in sorted(by.items())))


if __name__ == '__main__':
    main()
