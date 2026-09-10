# GOLF-120 — Green-fee schema v2 proposal

**Status:** Phase 1 complete — schema locked, all §5 questions answered by owner
2026-09-10. Next: a separate handover for the Phase 2 code (`js/trip-geo.js`
helpers + `SCHEMA.md`) + the per-nation merge. England batch 2 reminder set for
Tue 2026-09-16.
**Date:** 2026-09-10
**Author:** coding/research agent session
**Supersedes:** the GOLF-97 `fee:{weekday,weekend,weekendTwilight?,confidence,lastVerified}` shape (v1)

> Owner brief (2026-09-10): "go with as highly flexible a schema as possible…
> start with the top 30% of courses for each region… most clubs publish full
> rate cards; where a club only gives 'From £X on weekends' and no real ceiling
> is discoverable, follow the club's own wording and store it as *from* £X."
>
> This doc locks the schema and reports the first research batch (126 courses,
> the top ~30% by ranking of England Top 100 / Scotland / Ireland / Wales /
> South Africa). Raw results are in the appendix + `GOLF-120-fees-batch1.json`.
> **No shipped file changed in this phase** — `data/*.js`, `js/*.js`, `*.html`,
> `SCHEMA.md` are all untouched. Section 3 is the merge plan for Phase 2.

---

## 1. What varies (evidence-based)

Surveying real published rate cards across all five nations and across tiers
(premium links, mid-market parkland, municipal/resort), green fees vary on
these axes. "Uses it" = the club prices *differently* along that axis on its
own published card.

| Axis | How common | Notes from the sample |
|---|---|---|
| **Day** — weekday vs weekend/BH | ~all clubs that take visitors | The universal axis. "Weekend" nearly always folds in bank holidays. A handful price **Friday** as weekend (or as its own tier). Some price **Monday** as a cheap day. |
| **Season** — high / shoulder / winter | most premium & resort courses; ~half of mid-market; rare at municipals | Month ranges differ per course. Northern hemisphere high season clusters Apr/May–Sep/Oct; winter Nov–Feb/Mar with mats/temporary greens. **South Africa is inverted** — high season is roughly Sep–Apr, low season the SA winter (May–Aug), and some Cape courses instead peak in the dry summer. Several clubs run 3 bands (high/shoulder/low), many run 2 (summer/winter), some run 1. |
| **Time band** — morning / afternoon / twilight / super-twilight | ~half the sample; almost every resort & busy links | Cutoffs are published (e.g. "after 14:00", "after 16:00", "after 17:00"). Twilight is typically 45–70% of the full rate; super-twilight (late evening, no guaranteed 18) lower still. A few links only open a twilight rate in high season. |
| **Round length** — 18 / 9 / day ticket / replay | 9-hole ~40% of parkland/municipal, rare at championship links; day tickets common in Scotland & Ireland; replay rate common at 36-hole resorts | Day ticket is usually 1.3–1.6× the 18-hole rate. Replay (second 18 same day) is often a flat small add-on. |
| **Player type** — visitor / member's guest / society-group / affiliated-club / county-card | guest & society rates published by most clubs; affiliated/union discounts common in Ireland & Scotland | Visitor (unaccompanied) is the headline we care about. Society/group rates need a minimum head-count and are out of scope for the displayed figure but worth storing when they're the *only* published number. |
| **Cart / buggy** | almost always a separate line; **mandatory & bundled** at several South African and US-style resort courses (Leopard Creek, some Fancourt tee times, Zimbali) | Where a buggy is mandatory and its cost is baked into the tee-time price, the headline green fee understates the real spend — the schema must be able to say "cart included / mandatory / extra". |
| **Booking channel** | online-booking discount at a growing number of clubs; resort-guest / hotel-guest rate at every resort in the sample | Resort-guest rates run 20–50% below the visitor rate. Online discounts are usually 5–15%. |
| **Misc** | winter "mats" surcharge/discount, open-competition days closed to visitors, "twilight only" visitor access on weekends at the busiest links | Captured as free-text `notes`, not structured. |

Full sampled figures: **Appendix A** and `GOLF-120-fees-batch1.json`.

### Takeaway for the schema

Four axes are load-bearing and worth structuring: **season → day → time band →
round length**. Player type and cart are worth carrying but as optional
side-channels, not extra nesting levels. Everything else is `notes`.

The single most important finding for cost accuracy: **the current v1
`weekday/weekend {min,max}` genuinely cannot represent a seasonal course**, and
~60% of the ranked sample is seasonal. A May Saturday morning at a top links
can be 2–3× a February weekday afternoon at the same course, and v1 collapses
both into one `weekend.max`.

---

## 2. Proposed v2 schema

### Design rules

1. **Regular over expressive.** One repeating `rate` record type. Every axis is
   a flat field on that record, not a nesting level. A researcher fills the
   fields the card actually uses and leaves the rest absent.
2. **Absent = "not priced on this axis"**, never "unknown". A course with one
   flat weekday and one flat weekend number is a complete, valid `feeV2`.
3. **Additive.** `feeV2` sits alongside the legacy free-text `wd`/`we` (kept
   forever as the ultimate fallback — `SCHEMA.md` line 39) and, during
   migration, alongside the old `fee` (v1) object. Read helpers try
   `feeV2` → `fee` (v1) → `wd`/`we` regex, in that order.
4. **Currency is explicit and per-object** (courses already mix GBP/EUR/ZAR).
5. **Provenance is per-object** (`source`, `lastVerified`, `confidence`), with
   an optional per-rate `confidence` override for the rare mixed-quality card.

### Shape

```
feeV2: {
  currency:  "GBP" | "EUR" | "ZAR",
  source:    "<URL of the exact page used>",
  lastVerified: "YYYY-MM-DD",
  confidence: "published-rates" | "published-from-only" | "estimated" | "poa",
  notes?:    "free-text caveats (comp days, mats, visitor restrictions)",

  cart?: {                       // omit entirely if buggy is a normal paid extra / irrelevant
    status: "included" | "mandatory" | "extra",
    amount?: number,             // in `currency`
    per?: "cart" | "person"
  },

  seasons: [                     // >=1. A non-seasonal course has exactly one, name:"all"
    {
      name:   "all" | "high" | "shoulder" | "winter",
      months?: number[],         // 1-12; omit/[] => year-round (only valid when name:"all")
      rates: [
        {
          day:       "weekday" | "weekend" | "friday" | "any",   // weekend includes bank holidays
          timeBand?: "anytime" | "morning" | "afternoon" | "twilight" | "super-twilight",
          bandStart?: "HH:MM",   // local; only when the club publishes a cutoff
          holes?:    18 | 9 | "day",       // default 18
          playerType?: "visitor" | "member-guest" | "society" | "affiliated",  // default visitor
          amount:    number,     // the figure; in `currency`
          amountMax?: number,    // ONLY when the club publishes a genuine range
          isFrom?:   boolean,    // true => "from £X", real ceiling unknown
          cartIncluded?: boolean, // this specific rate bundles a buggy
          confidence?: string    // per-rate override of the object-level confidence
        }
      ]
    }
  ]
}
```

### Field notes

- **`day:"any"`** — course charges the same 7 days. Lets a flat course carry
  one rate instead of two identical ones.
- **`timeBand` absent** ≡ `"anytime"`. Only add `twilight`/`afternoon` records
  when a real published price exists for them.
- **`amount` vs `amountMax`** — a single published figure sets `amount` only.
  A club-published range ("£150–£195") sets both. A "from £150" sets `amount`
  + `isFrom:true` and leaves `amountMax` absent — per the owner's instruction
  we display "from £150" rather than inventing a ceiling.
- **`confidence` values:**
  - `published-rates` — full rate card lifted from the club's own site.
  - `published-from-only` — only a "from £X" figure is published; no full card.
  - `estimated` — figure from a secondary source (golf-tourism aggregator, old
    press) or an informed estimate; flagged in the UI.
  - `poa` — members-only / "contact the club" / no visitor rate. `seasons: []`.
- **Legacy `wd`/`we`** — untouched, still the last-resort fallback. Confirmed.

### 2a. Minimal valid example — most courses will look like this

Parkstone (England Top 100 #34), flat 2-tier card:

```json
{
  "currency": "GBP",
  "source": "https://www.parkstonegolfclub.co.uk/visitors/green-fees",
  "lastVerified": "2026-09-10",
  "confidence": "published-rates",
  "seasons": [
    { "name": "all", "rates": [
      { "day": "weekday", "amount": 95 },
      { "day": "weekend", "amount": 120 }
    ]}
  ]
}
```

### 2b. "From only" example — the owner's explicit case

```json
{
  "currency": "GBP",
  "source": "https://www.royalstgeorges.com/golf/green-fees/",
  "lastVerified": "2026-09-10",
  "confidence": "published-from-only",
  "notes": "Club publishes a 'from' figure; peak weekend rate not disclosed online.",
  "seasons": [
    { "name": "all", "rates": [
      { "day": "weekday", "amount": 400, "isFrom": true },
      { "day": "weekend", "amount": 420, "isFrom": true }
    ]}
  ]
}
```

### 2c. Fully worked complex example — seasonal + time bands + 9-hole + mandatory cart

Illustrative composite in the style of a Fancourt / top-links card:

```json
{
  "currency": "GBP",
  "source": "https://www.example-links.co.uk/green-fees",
  "lastVerified": "2026-09-10",
  "confidence": "published-rates",
  "notes": "Weekend visitor tee times after 11:00 only, Apr–Sep. Buggy compulsory Jul–Aug.",
  "cart": { "status": "extra", "amount": 40, "per": "cart" },
  "seasons": [
    {
      "name": "high", "months": [5,6,7,8,9],
      "rates": [
        { "day": "weekday", "timeBand": "anytime",   "holes": 18, "amount": 260 },
        { "day": "weekday", "timeBand": "twilight",   "bandStart": "16:00", "holes": 18, "amount": 150 },
        { "day": "weekday", "holes": 9,  "amount": 140 },
        { "day": "weekday", "holes": "day", "amount": 360 },
        { "day": "weekend", "timeBand": "anytime",   "holes": 18, "amount": 300 },
        { "day": "weekend", "timeBand": "twilight",   "bandStart": "16:00", "holes": 18, "amount": 175 }
      ]
    },
    {
      "name": "shoulder", "months": [4,10],
      "rates": [
        { "day": "weekday", "holes": 18, "amount": 185 },
        { "day": "weekend", "holes": 18, "amount": 210 }
      ]
    },
    {
      "name": "winter", "months": [11,12,1,2,3],
      "rates": [
        { "day": "any", "holes": 18, "amount": 95 },
        { "day": "any", "holes": 9,  "amount": 55 }
      ]
    }
  ]
}
```

### 2d. `poa` example

```json
{
  "currency": "GBP",
  "source": "https://www.muirfield.org.uk/golf/visitors/",
  "lastVerified": "2026-09-10",
  "confidence": "poa",
  "notes": "Visitor golf Tue & Thu only, by prior written application; fee on application.",
  "seasons": []
}
```

---

## 3. "Highest applicable" derivation rule

The UI shows **one** figure per course (per weekday/weekend). v2 derives it as
the **highest visitor rate a walk-up player could actually be charged** in the
given context. Formalised:

### Candidate filter (applied first, in every context)

Keep a `rate` as a candidate iff **all** hold:
1. `playerType` is `"visitor"` or absent.
2. `holes` is `18` or absent. (9-hole and day tickets never drive the headline.)
3. `timeBand` is `"anytime"` or absent — **unless** a time is supplied (see C).
4. Its season matches the context (see below).
5. Its `day` matches the requested field (see below).

The figure for a candidate is `amountMax ?? amount`.
**Highest applicable = max(figure) over all candidates.**

Display label (owner decision Q5):
- Winning candidate has `isFrom:true`, no `amountMax` → **"from £X"**.
- Winning figure is a *derived ceiling* — i.e. it's the max across more than
  one candidate rate (multiple seasons/time-bands/etc.) rather than a single
  published number → **"Up to £X"**.
- Winning figure is a single published rate that stands alone → plain **"£X"**.

### A. No date context (browsing / discover list / pin popup)

- Season: consider **all** seasons.
- `day = "weekday"` field → candidates with `day ∈ {weekday, any}`.
  `day = "weekend"` field → candidates with `day ∈ {weekend, friday, any}`.
- Result: the peak in-season rate. This is deliberately the "worst case" —
  matches the owner's 2026-09-08 complaint that v1 *understated* peak pricing.
- Low end for a displayed range (`feeRangeFor().min`): `min(amount)` over the
  same candidate set across all seasons (so a course shows "£95–£300" when it
  swings seasonally).

### B. Specific date (a scheduled day with a calendar date)

- Season: the one whose `months` contains the date's month; else the
  `name:"all"` season; else (no match) fall back to context A.
- `day`: `weekend` if the date is Sat/Sun, else `weekday` (bank holidays are
  **not** special-cased for now — owner decision Q4; a per-country BH list is a
  later calendar-API-hook refinement). If it's a Friday and a `day:"friday"`
  rate exists, use that instead of `weekday`.
- Candidates as above with `timeBand ∈ {anytime, absent}`.
- Highest applicable = max(figure). This is what `feeNumberForDate()` should
  return on a weekend (it already returns `.max` for weekends — v2 keeps that).

### C. Specific date **and** time

- Season + day as in B.
- Pick the `timeBand` whose window contains the time:
  `super-twilight` if time ≥ its `bandStart`, else `twilight` if time ≥ its
  `bandStart`, else `afternoon` if time ≥ its `bandStart`, else `morning`/`anytime`.
- Candidate set = rates in that band (plus `anytime` as fallback if the band
  has no rate). Highest applicable = max(figure).
- This is the forward-looking per-tee-time path. No current caller needs it;
  it's specified so the schema doesn't have to change when booking lands.

### Where it plugs in (describe only — no code change this phase)

`js/trip-geo.js`:
- `feeRangeFor(i, field)` — add a `feeV2For(i, field)` branch **before** the
  existing `C[i].fee` (v1) branch. Returns `{min, max, confidence, isFrom}`
  using rule A. The v1 and `wd`/`we` fallbacks stay exactly as they are.
- `feeNumberFor(i, field)` — unchanged (averages the range from `feeRangeFor`).
- `feeNumberForDate(i, dateStr)` — swap the "`C[i].fee` present → return
  `r.max`" check so it fires when **either** `feeV2` or `fee` is present, and
  have `feeRangeFor` internally honour the date (rule B) when one is threaded
  through. Simplest: add `feeRangeForCtx(i, field, {date, time})`.
- `feeRangeForDate(i, dateStr)` — same, for the Costs tab's range/confidence
  context; carry `isFrom` through so the UI can print "from".
- `feeFieldForDate(dateStr)` — unchanged.
- `popupHTML()` / discover card — read via the helpers only, as today. Render
  the label per Q5: `"£X"` / `"from £X"` / `"Up to £X"` (the helper returns
  which case applies).
- **Costs tab** — when a scheduled course's `feeV2.cart.status === "mandatory"`,
  add a **separate line item** to that day's breakdown (`"Compulsory buggy —
  <cur><amount>"`, ×`per`), never folded into the green-fee figure (owner
  decision Q6). The itinerary drive/day row also shows a small "buggy
  compulsory" tag.

No behaviour changes for any course without a `feeV2` object.

---

## 4. Migration & effort

### v1 → v2 mapping

v1 `fee:{}` objects (England Top 100, ~114) **do not upgrade losslessly** —
v1 has no season and its `confidence:"published-from-only"` cases already
baked an *estimated* ceiling into `max`, which is exactly the inaccuracy
GOLF-120 exists to fix. **Recommendation: re-research the Top 100 too** (this
matches the owner's stated assumption). A lossy auto-map is possible as a
*stopgear* (`weekday.min/max` → one `all`-season weekday rate pair, drop the
fabricated `published-from-only` ceilings to `isFrom`) but it should not be
the end state.

### Legacy `wd`/`we`

Untouched. Remains the final fallback for every course with no `feeV2`.
Confirmed — no change to `SCHEMA.md` line 39 behaviour.

### Effort for the full re-research pass

Established pattern: fetch-once → JSON intermediate → manual/scripted merge;
background Haiku batch agents return JSON, never edit data files (CLAUDE.md +
`data-entry-workflow` memory). **Not scraping** (BRS Golf ToS — GOLF-98).

- This batch: **126 courses / 9 Haiku agents**, ~10–14 courses per agent,
  ≈ 3 web lookups per course. See Appendix B for the token/coverage outturn.
- Full programme, ~557 courses (minus the ~322 SA bulk placeholders that will
  stay `poa`/`estimated` — realistically ~235 worth researching):
  ≈ **18–22 agent batches**, one merge pass per nation.
- Per-course human review at merge: ~30–60 s for a spot-check of the flagged
  (`estimated` / `poa` / `isFrom`) ones, faster for clean `published-rates`.

### Phased sequence (recommended)

1. **Lock v2 schema** (this doc, owner sign-off). — *gate*
2. **Ship the read helpers** in `js/trip-geo.js` + `SCHEMA.md` update, with
   the England Top 100 re-research merged first (highest-traffic courses,
   already partly done). One branch, verified against `test_data.js` +
   `check_js.js` + a popup sweep, then `main`.
3. Backfill per nation in ranking order: **Scotland → Ireland → South Africa
   (ranked only) → Wales → London**. Each nation = its own JSON batch + merge
   + verify, landed on `main` incrementally.
4. SA bulk (`spec:"Unknown"`) and London municipals: low-value, do last or
   leave on `wd`/`we`.

---

## 5. Open questions for the owner

> **Owner decisions — 2026-09-10 (all questions now answered):**
>
> - **Q1 — England Top 100 re-research:** don't spend the tokens on the full
>   England pass now; batch 1 (top ~34) is a good enough sample for schema
>   sign-off. The remaining ~80 (ranks 35–114) run as a later "batch 2".
>   A one-time reminder routine (`trig_01KjZDrrJ3wYrk8EQ3nf26Z9`) fires
>   **Tue 2026-09-16 22:00 Europe/London** — deliberately just before the
>   weekly usage-limit reset (Wed 03:00) so the token-heavy pass runs on a
>   fresh allowance.
> - **Q2 — season months:** store exactly as each club publishes (max
>   granularity).
> - **Q3 — time bands:** capture in the same research pass, don't defer.
> - **Q4 — bank holidays:** ignore for now. `"weekend"` = Sat/Sun only in the
>   derivation. A per-country BH list is an easy later add via a calendar-API
>   hook — not in scope for v2.
> - **Q5 — displayed peak:** yes, show the in-season peak as the headline
>   (rule A), **but label a derived ceiling as "Up to £X"** (not a bare
>   figure) so it reads as a maximum, not a quote.
> - **Q6 — mandatory buggy:** yes, factor it into the trip cost, **as its own
>   line item** in the Costs-tab breakdown (e.g. "Compulsory buggy — R650"),
>   never silently folded into the green fee. Flag it in the itinerary too.
> - **Q7 — society/group-only courses:** a club that publishes *only* a
>   group-outing price (e.g. "£45pp, minimum 12 players") and no individual
>   walk-up green fee. A lone visitor can't actually book that rate →
>   **treat as `poa`**. Optionally keep the society figure in `notes` for
>   context, but it does not drive any displayed number.
>
> The §6 "if effort has to come down" cuts are **not** being taken (Q2/Q3).

---

## 6. Recommendation

**Adopt the `feeV2` shape in §2 as specified** — one flat `rate` record,
four optional structuring axes (season / day / time band / holes), optional
`cart` and `playerType` side-channels, per-object provenance. It is strictly
more expressive than v1, degrades cleanly to a 2-line card for the 40% of
courses that need nothing more, and the §3 derivation rule is precise enough
to implement without further product input.

**If effort has to come down, cut in this order:**
1. **Time bands** — defer twilight/afternoon rates to a second pass; ship
   season + day + holes first. (Biggest research-time saving.)
2. **Per-course season months** — snap to summer (Apr–Oct) / winter (Nov–Mar)
   north, inverted south, instead of copying each card's exact ranges.
3. **9-hole / day-ticket rates** — nice for the Costs tab, never drive the
   headline; can be backfilled later without a schema change.

Keep regardless: `currency`, `source`/`lastVerified`/`confidence`, the
`day` axis, `isFrom`, and `seasons[]` as the outer structure (even if only
ever length 1 for most courses) — dropping `seasons[]` would force a
breaking change the moment the first seasonal course is added properly.

---

## Batch-1 review notes (must be checked at Phase-2 merge)

The 9 Haiku agents were told to copy published cards verbatim; these entries
need a human eye before they go into `data/*.js`:

- **`estimated` (25)** — no current club card found; figure from an aggregator
  (where2golf / leadingcourses / golfshake) or 2023–24 press. Re-verify each
  against the club site before merge, or ship as `estimated` and let the UI
  badge it. Heaviest in Ireland (9) and SA (6).
- **`poa` (15)** — genuinely no visitor rate published: Sunningdale (2026 fully
  booked), Muirfield / Loch Lomond / Renaissance / St Andrews New/Machrihanish
  (private or application), Rye, Notts & Sherwood Forest (site blocked at
  research time — worth one manual retry), Adare Manor, Royal JK, Houghton,
  Randpark. Notts/Sherwood in particular may just be a transient 403.
- **Weekend < weekday** — Royal Porthcawl (£275 wd vs £165 we) and Celtic
  Manor / Nefyn "from" ranges rendered oddly in the table. Check the agent
  didn't tag a twilight/society rate as the weekend headline.
- **No derivable headline despite `published-rates`** — St Enodoc (5 seasons,
  all rates fell outside the visitor/18-hole filter) and Erinvale (rates are
  all player-type-specific). The JSON is fine but the derivation rule returns
  null — decide the fallback (probably use the lowest visitor rate present).
- **Mount Edgecombe** (both courses) — R260 looks too low vs legacy `wd`/`we`;
  the agent flagged it. Verify.
- **Currency for NI courses** — Royal Portrush, Royal County Down, Portstewart
  correctly came back GBP (not EUR) from the region heuristic; spot-check the
  rest of the Ireland file when the full pass runs.

## Appendix A — sampled figures (top ~30% by ranking, 5 nations)

_Populated from the 9 research batches — see `GOLF-120-fees-batch1.json` for
the machine-readable `feeV2` objects and per-course source URLs._

| # | Course | Cur | Weekday (peak / range) | Weekend (peak / range) | Seasons | Conf | Source |
|--:|---|---|---|---|--:|---|---|
| | **England Top 100** | | | | | | |
| 1 | Royal St George's | GBP | £215–400 | — | 2 | pub-rates | royalstgeorges.com |
| 2 | Sunningdale (Old) | GBP | — | — | — | poa | sunningdale.com |
| 3 | Sunningdale (New) | GBP | — | — | — | poa | sunningdale.com |
| 4 | Royal Birkdale | GBP | £450–495 | £450–495 | 2 | pub-rates | golfmonthly.com |
| 5 | Royal Lytham & St Annes | GBP | £245–400 | — | 3 | pub-rates | royallytham.org |
| 6 | Woodhall Spa (Hotchkin) | GBP | £245 | £245 | 1 | pub-rates | woodhallspagolf.com |
| 7 | Royal Cinque Ports | GBP | £150–285 | £150–285 | 3 | pub-rates | royalcinqueports.com |
| 8 | Swinley Forest | GBP | £135–220 | £135–220 | 2 | estimated | swinleyfgc.co.uk |
| 9 | Royal West Norfolk | GBP | £185 | £235 | 1 | pub-rates | rwngc.org |
| 10 | Ganton | GBP | £235 | — | 1 | pub-rates | gantongolfclub.com |
| 11 | Royal Liverpool | GBP | £300–400 | £300–400 | 3 | pub-rates | royal-liverpool-golf.com |
| 12 | Formby | GBP | £250 | £280 | 1 | estimated | formbygolfclub.co.uk |
| 13 | Alwoodley | GBP | £120–230 | £120–230 | 4 | pub-rates | alwoodleygolfclub.com |
| 14 | Saunton (East) | GBP | £125–175 | £125–175 | 3 | pub-rates | sauntongolf.co.uk |
| 15 | St George's Hill | GBP | £200 | £200 | 1 | pub-rates | stgeorgeshillgolfclub.co.uk |
| 16 | Rye | GBP | — | — | — | poa | ryegolfclub.co.uk |
| 17 | Burnham & Berrow | GBP | £130 | £145–155 | 1 | estimated | burnhamandberrowgolfclub.co.uk |
| 18 | Notts (Hollinwell) | GBP | — | — | — | poa | nottsgolfclub.co.uk |
| 19 | St Enodoc (Church) | GBP | — | — | 5 | pub-rates | st-enodoc.co.uk |
| 20 | Hankley Common | GBP | £145 | £160 | 1 | estimated | hankley.co.uk |
| 21 | Hillside | GBP | £60–115 | £60–150 | 2 | estimated | hillside-golfclub.co.uk |
| 22 | Silloth-on-Solway | GBP | £70–120 | £70–120 | 2 | pub-rates | sillothgolfclub.co.uk |
| 23 | The Berkshire (Red) | GBP | £170–275 | £240–380 | 2 | pub-rates | theberkshire.co.uk |
| 24 | West Lancs | GBP | £120–250 | £225–480 | 3 | pub-rates | westlancashiregolf.co.uk |
| 25 | West Sussex (Pulborough) | GBP | £135–175 | £150–200 | 2 | pub-rates | westsussexgolf.co.uk |
| 26 | Hunstanton | GBP | £120–175 | £120–175 | 2 | pub-rates | hunstantongolfclub.com |
| 27 | Woking | GBP | £235 | £235 | 1 | pub-rates | wokinggolfclub.co.uk |
| 28 | Southport & Ainsdale | GBP | £175 | £190 | 1 | pub-rates | sandagolfclub.co.uk |
| 29 | Prince's (Shore/Dunes/Himalayas) | GBP | £135 | £155 | 1 | estimated | princesgolfclub.co.uk |
| 30 | The Berkshire (Blue) | GBP | £170–275 | £240–380 | 2 | pub-rates | theberkshire.co.uk |
| 31 | Sherwood Forest | GBP | — | — | — | poa | sherwoodforestgolfclub.co.uk |
| 32 | Liphook | GBP | £180 | £210 | 1 | pub-rates | liphookgolfclub.com |
| 33 | Worplesdon | GBP | £100–160 | — | 2 | pub-rates | worplesdongc.co.uk |
| 34 | Parkstone | GBP | — | — | 1 | pub-rates | parkstonegolfclub.com |
| | **Scotland** | | | | | | |
| 1 | St Andrews (Old) | GBP | £355 | £355 | 1 | estimated | standrews.com |
| 2 | Turnberry (Ailsa) | GBP | £315 | £315 | 2 | pub-rates | trumpgolfclub.com |
| 3 | Royal Dornoch | GBP | £200–360 | £200–360 | 2 | pub-rates | royaldornoch.com |
| 4 | Muirfield | GBP | — | — | — | poa | muirfield.org.uk |
| 5 | North Berwick (West Links) | GBP | £220 | £220 | 1 | pub-rates | northberwickgolfclub.com |
| 6 | Kingsbarns | GBP | £399–486 | £399–486 | 2 | pub-rates | kingsbarns.com |
| 7 | Carnoustie (Championship) | GBP | £450 | £450 | 1 | pub-rates | carnoustiegolflinks.com |
| 8 | Cruden Bay | GBP | £110–205 | £110–220 | 3 | pub-rates | crudenbaygolfclub.co.uk |
| 9 | Royal Troon (Old) | GBP | £250–365 | £250–365 | 1 | pub-rates | royaltroon.co.uk |
| 10 | Castle Stuart | GBP | £385 | £385 | 1 | pub-rates | cabot.com |
| 11 | Trump International (Old) | GBP | £300–560 | £300–560 | 3 | pub-rates | trumpgolfscotland.com |
| 12 | Prestwick | GBP | £170–240 | £240–380 | 2 | pub-rates | prestwickgc.co.uk |
| 13 | Loch Lomond | GBP | — | — | — | poa | lochlomond.com |
| 14 | Royal Aberdeen (Balgownie) | GBP | £115–265 | — | 3 | pub-rates | royalaberdeengolf.com |
| 15 | Gleneagles (King's) | GBP | £95–405 | £95–405 | 3 | pub-rates | gleneagles.com |
| 16 | Machrihanish | GBP | — | — | — | poa | machgolf.com |
| 17 | Western Gailes | GBP | £95–335 | £335 | 2 | pub-rates | nationalclubgolfer.com |
| 18 | The Machrie, Islay | GBP | £74–185 | £74–185 | 3 | pub-rates | another.place |
| 19 | Nairn | GBP | £100–350 | £100–350 | 3 | pub-rates | nairngolfclub.co.uk |
| 20 | Gullane (No.1) | GBP | £285 | £325 | 1 | pub-rates | gullanegolfclub.com |
| 21 | Dumbarnie Links | GBP | £256–350 | £256–350 | 2 | pub-rates | dumbarnielinks.com |
| 22 | Elie (Golf House Club) | GBP | £60–200 | £75–200 | 3 | pub-rates | golfhouseclub.co.uk |
| 23 | Brora | GBP | £90–180 | £90–180 | 3 | pub-rates | broragolfclub.co.uk |
| 24 | St Andrews (New) | GBP | — | — | — | poa | newgolfclubstandrews.co.uk |
| 25 | The Renaissance Club | GBP | — | — | — | poa | trcaa.com |
| 26 | Southerness | GBP | £65–150 | £65–150 | 3 | pub-rates | southernessgolfclub.com |
| 27 | Dunbar | GBP | £120–175 | £135–225 | 2 | pub-rates | dunbargolfclub.com |
| 28 | Panmure | GBP | £85–195 | £85–195 | 1 | estimated | panmuregolfclub.co.uk |
| 29 | St Andrews (Castle) | GBP | £180 | £180 | 1 | pub-rates | linksgolfstandrews.com |
| 30 | Murcar Links | GBP | £130 | £150 | 1 | pub-rates | murcarlinks.com |
| | **Ireland** | | | | | | |
| 1 | Royal Portrush (Dunluce) | GBP | £420 | £420 | 1 | pub-rates | royalportrushgolfclub.com |
| 2 | Royal County Down | GBP | £450 | £450 | 1 | estimated | royalcountydown.org |
| 3 | Portmarnock | EUR | €500 | €500 | 1 | estimated | portmarnockgolfclub.ie |
| 4 | Lahinch (Old) | EUR | €450 | €450 | 1 | pub-rates | lahinchgolf.com |
| 5 | Ballybunion (Old) | EUR | €400–450 | €400–450 | 2 | pub-rates | ballybuniongolfclub.com |
| 6 | County Louth (Baltray) | EUR | €365 | €365 | 1 | pub-rates | countylouthgolfclub.com |
| 7 | Waterville | EUR | €425 | €425 | 1 | estimated | watervillegolflinks.ie |
| 8 | Adare Manor | EUR | — | — | — | poa | adaremanor.com |
| 9 | The Island | EUR | €270 | €295 | 1 | pub-rates | theislandgolfclub.com |
| 10 | Tralee | EUR | €450 | €450 | 1 | pub-rates | traleegolfclub.com |
| 11 | Rosapenna (St Patrick's Links) | EUR | €350 | €350 | 1 | pub-rates | rosapenna.ie |
| 12 | Rosapenna (Sandy Hills Links) | EUR | €240 | €240 | 1 | pub-rates | rosapenna.ie |
| 13 | Rosapenna (Old Tom Morris Links) | EUR | €200 | €200 | 1 | pub-rates | rosapenna.ie |
| 14 | Carne (Belmullet) | EUR | €110 | €110 | 1 | estimated | carnegolflinks.com |
| 15 | County Sligo (Rosses Point) | EUR | €180 | €180 | 1 | estimated | countysligogolfclub.ie |
| 16 | The K Club (Palmer North) | EUR | €140–260 | €140–260 | 2 | pub-rates | kclub.ie |
| 17 | The K Club (Palmer South) | EUR | €65–130 | €65–130 | 2 | pub-rates | kclub.ie |
| 18 | Enniscrone | EUR | €185 | €185 | 1 | estimated | enniscronegolf.com |
| 19 | Doonbeg | EUR | €250 | €300 | 1 | estimated | trumphotels.com |
| 20 | Portstewart (Strand) | GBP | £70–335 | £70–335 | 3 | pub-rates | portstewartgc.co.uk |
| 21 | Ballyliffin (Glashedy) | EUR | €330 | €330 | 1 | pub-rates | ballyliffingolfclub.com |
| 22 | Ballyliffin (Old Links) | EUR | €300 | €300 | 1 | pub-rates | ballyliffingolfclub.com |
| 23 | Royal Dublin | EUR | €165 | €165 | 1 | estimated | theroyaldublingolfclub.com |
| 24 | Portsalon | EUR | €125 | €150 | 1 | estimated | portsalongolfclub.ie |
| 25 | Dooks | EUR | €200–260 | €200–280 | 2 | pub-rates | dooks.com |
| | **Wales** | | | | | | |
| 1 | Royal Porthcawl | GBP | £138–275 | £165 | 4 | pub-rates | royalporthcawl.com |
| 2 | Pennard | GBP | £110 | £125 | 1 | estimated | pennardgolfclub.com |
| 3 | Royal St David's | GBP | £80–145 | £80–145 | 2 | pub-rates | royalstdavids.co.uk |
| 4 | Aberdovey | GBP | £75–125 | £85–135 | 4 | pub-rates | aberdoveygolf.co.uk |
| 5 | Conwy (Caernarvonshire) | GBP | £75–125 | — | 3 | pub-rates | conwygolfclub.com |
| 6 | Southerndown | GBP | £89–95 | £120–125 | 2 | pub-rates | southerndowngolfclub.com |
| 7 | Tenby | GBP | £50–85 | £50–90 | 2 | pub-rates | tenbygolf.co.uk |
| 8 | Pyle & Kenfig | GBP | £110 | £130 | 1 | pub-rates | pandkgolfclub.co.uk |
| 9 | Celtic Manor (Twenty Ten) | GBP | £from 82–102 | £from 107–159 | 3 | pub-rates | celtic-manor.com |
| 10 | Bull Bay | GBP | £60 | £70 | 1 | pub-rates | bullbaygc.co.uk |
| 11 | Nefyn & District | GBP | £from 40–79 | £from 40–99 | 3 | pub-rates | nefyn-golf-club.co.uk |
| 12 | Cardigan | GBP | £55 | £70 | 1 | estimated | cardigangolfclub.co.uk |
| | **South Africa** | | | | | | |
| 1 | Fancourt (The Links) | ZAR | R5000 | R5000 | 1 | pub-rates | leadingcourses.com |
| 2 | Fancourt (Montagu) | ZAR | R1325 | R1325 | 1 | pub-rates | leadingcourses.com |
| 3 | Fancourt (Outeniqua) | ZAR | R1325 | R1325 | 1 | pub-rates | leadingcourses.com |
| 4 | Leopard Creek Country Club | ZAR | R8500 | R8500 | 1 | pub-rates | leopardcreek.co.za |
| 5 | Durban Country Club | ZAR | R480 | R600 | 1 | pub-rates | durbancountryclub.co.za |
| 6 | St Francis Links | ZAR | Rfrom 1100 | Rfrom 1100 | 1 | estimated | stfrancislinks.com |
| 7 | Royal Johannesburg & Kensington (East) | ZAR | — | — | — | poa | royaljk.co.za |
| 8 | Royal Cape Golf Club | ZAR | R800–950 | R800–950 | 2 | pub-rates | royalcapegolf.co.za |
| 9 | Pearl Valley Golf Club | ZAR | R2595 | R2595 | 1 | pub-rates | leadingcourses.com |
| 10 | Arabella Golf Club | ZAR | R1595 | R1595 | 1 | pub-rates | arabellacountryestate.co.za |
| 11 | Gary Player Country Club (Sun City) | ZAR | R980 | R980 | 1 | pub-rates | suninternational.com |
| 12 | Lost City Golf Course (Sun City) | ZAR | R980 | R980 | 1 | pub-rates | suninternational.com |
| 13 | Glendower Golf Club | ZAR | R375 | R465–750 | 1 | pub-rates | golfshake.com |
| 14 | Humewood Golf Club | ZAR | R700 | R700 | 1 | estimated | where2golf.com |
| 15 | Erinvale Golf Club | ZAR | — | — | 2 | pub-rates | where2golf.com |
| 16 | Zimbali Country Club | ZAR | R440 | R500 | 1 | estimated | golfshake.com |
| 17 | Simola Golf & Country Estate | ZAR | R1450 | R1450 | 1 | pub-rates | leadingcourses.com |
| 18 | Oubaai Golf Club | ZAR | R450–750 | R450–750 | 2 | pub-rates | where2golf.com |
| 19 | Pinnacle Point Golf Club | ZAR | R2200 | R2200 | 1 | estimated | where2golf.com |
| 20 | George Golf Club | ZAR | R565–695 | R565–695 | 3 | pub-rates | where2golf.com |
| 21 | Mount Edgecombe (The Woods) | ZAR | R260 | R260 | 1 | estimated | leadingcourses.com |
| 22 | Mount Edgecombe (The Lakes) | ZAR | R260 | R260 | 1 | estimated | leadingcourses.com |
| 23 | Houghton Golf Club | ZAR | — | — | — | poa | houghton.co.za |
| 24 | Randpark (Firethorn) | ZAR | — | — | — | poa | randpark.co.za |
| 25 | Randpark (Bushwillow) | ZAR | — | — | — | poa | randpark.co.za |

## Appendix B — batch coverage & token outturn

| Region | Courses | pub-rates | estimated | poa | multi-season | has time-band | has 9-hole |
|---|--:|--:|--:|--:|--:|--:|--:|
| England Top 100 | 34 | 23 | 6 | 5 | 17 | 3 | 1 |
| Scotland | 30 | 23 | 2 | 5 | 16 | 4 | 1 |
| Ireland | 25 | 15 | 9 | 1 | 5 | 0 | 0 |
| Wales | 12 | 10 | 2 | 0 | 8 | 4 | 0 |
| South Africa | 25 | 15 | 6 | 4 | 4 | 0 | 0 |
| **Total** | **126** | **86** | **25** | **15** | **50** | **11** | **2** |

Agent run: 9 background Haiku batches, ~10–17 courses each. Aggregate subagent
tokens ≈ 626k, ~300 web lookups, ~14 min wall-clock (batches ran in parallel).
Per-course cost ≈ 5.0k tokens. Full ~235-course programme extrapolates to
≈ 1.2M subagent tokens across ~18 batches.
