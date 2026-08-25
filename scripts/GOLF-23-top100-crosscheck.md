# GOLF-23 — cross-check the Top 100 list against a second published source

**Trigger:** stakeholder review couldn't immediately find Royal Birkdale,
Royal Liverpool, and St Enodoc (turned out to be GOLF-22's discoverability
bug, not a data problem — but it raised a fair follow-up question: is the
list itself actually complete and correct?).

## What was checked

Pulled the full England Top 100 list from **National Club Golfer**
(`top100.nationalclubgolfer.com/rankinglists/england`) — ranks 1–100, names
only — and diffed it against all 100 `t100.eng` entries in
`data/courses-top100.js` programmatically (exact rank-by-rank match, not
eyeballed).

## Result: exact match, all 100 ranks

Every rank 1–100 matches NCG's list exactly — same course, same position,
for all 100 entries. The only differences are cosmetic subtitle formatting
NCG itself is inconsistent about (e.g. their "Ferndown (Old)" vs our
"Ferndown", their "Notts Golf Club (Hollinwell)" vs our "Notts
(Hollinwell)", their "Aldeburgh (Championship)" vs our "Aldeburgh") — not
identity or rank errors. **No courses missing, none misranked, no
transcription errors found.** This strongly confirms last session's
photographed price list *was* NCG's Top 100s: England ranking, transcribed
correctly.

## A second source, `top100golfcourses.com`, has a different list — not a bug

Also checked `top100golfcourses.com`'s own England ranking. It's a
**different publisher's independent list**, not a stricter superset of
NCG's — it includes courses NCG doesn't rank in their England Top 100 at
all: **Wentworth (East)**, **Wisley (Church & Garden)**, **Woburn
(Marquess/Dukes)**, **St Mellion (Nicklaus)**, and **Appleby** (per a search
snippet describing it as a "new entry" — for their list, not NCG's). Two
well-regarded golf-ranking publishers disagreeing on their top 100 is
normal and expected, not an error on either side.

**Not adding these** without your say-so: this map's "Top 100" is
specifically NCG's Top 100s: England list, matched exactly. Folding in
courses from a different publisher's differently-curated list would mean
the 100 entries no longer correspond to any single named ranking — it'd
need a rationale (e.g. "union of both lists," clearly labelled) rather than
silently blending sources. Flagging as an option, not doing it.

## Recommendation

**No data changes needed.** The existing 100 entries are verified accurate.
If you want broader national coverage beyond NCG's specific list (e.g.
adding Wentworth, Wisley, Woburn, St Mellion), that's a deliberate scope
decision — say the word and I'll scope it as its own ticket rather than
quietly merging a second publisher's list into "the Top 100."
