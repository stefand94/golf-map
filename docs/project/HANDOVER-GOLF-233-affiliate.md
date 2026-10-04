# GOLF-233 (Gavin) + GOLF-160 build (Barry): affiliate links, rank numbers hidden

Decision: **DEC-038**. Read it, plus the **Standing rules** in `HANDOVER-GOLF-221-225.md`. They all still apply, and there are four check scripts now, including `test_state_persist.js`.

**Release order (important):** Barry's GOLF-160 must be **live before** Gavin's links go live. Once the links earn money, the site is commercial, and the rank numbers can't be on it. Gavin can build in parallel but **doesn't push to main until the BA confirms GOLF-160 is live.**

| Dev | Ticket | Touches |
| --- | --- | --- |
| **Barry** | GOLF-160 fallback: remove the Top 100 rank numbers | `data/courses-*.js` (`t100.*`), `js/map.js` `bestRankBadge()`/`rankChips()`, `js/util.js` `rankNum()`, `js/explore.js` sort |
| **Gavin** | GOLF-233: affiliate links, stage 1 | itinerary hotel items, trip-level car hire, privacy dialog line |

---

## Barry: GOLF-160, remove the rank numbers

The spec is in the GOLF-160 backlog row ("Fallback… fully specced"). Read it in full. In short:
1. Replace every numeric `t100.*` position with a boolean (`notable:1`, following the `zaRanked` precedent). **Delete the numbers from the data files entirely**; keeping them unrendered still counts as reproduction. **Patch records in place**: never rebuild an array, and never touch `data/course-ids.js`.
2. Before deleting, save the ordered lists to gitignored `scripts/output/`, so a later permission grant is a merge, not new research. Confirm the file is untracked.
3. Remove `England #7` / `Britain & Ireland #24` / `South Africa #12` from pin badges, popup chips, tooltips, share view and search. Check every render path for leftover "#" and "undefined".
4. **Sort:** "by ranking" and the nation-pill default (`js/explore.js:44`, `state.sort='rank'`) lose their order. Pick a sensible replacement default, such as notable first and then by name, and **tell the BA what you chose**. The owner will see it.
5. Leave `zaRanked` (the SA map ringfence) working: 107 SA courses still shown, 560 total on the map. `test_data.js` must still pass, so update its expectations only where the ranks themselves were counted.

**AC:**
- [ ] `git grep` finds no numeric `t100` positions in `data/`.
- [ ] No rank number appears anywhere in the UI, at desktop or 375 width.
- [ ] The map count is unchanged.
- [ ] The default sort is sensible and reported.
- [ ] Old share links still render the same trip.
- [ ] The lists are in `scripts/output/`, untracked.
- [ ] Live `X-Build` matches.

---

## Gavin: GOLF-233, affiliate links, stage 1

### Link format (Travelpayouts)
`https://tp.media/r?campaign_id=<C>&marker=778843&p=<P>&trs=575131&u=<encodeURIComponent(target URL)>`

| Programme | campaign_id | p | Use |
| --- | --- | --- | --- |
| EconomyBookings | 10 | 2018 | car hire |
| Klook | 137 | 4110 | hotels (try first), later tours |
| KKday | 633 | 9074 | hotels (fallback), later tours |

- The marker and trs are public partner IDs, safe in code. Put all of them in one small config object, not scattered.
- Add a `sub_id` parameter naming where the click came from (for example `hotel`, `carhire`), so the dashboard shows which placement earns. Check Travelpayouts' docs for the exact parameter name.
- Every link uses `target="_blank" rel="sponsored noopener"`.

### What to build
1. **Hotels:** a "Check prices" link on each hotel/stay item in the Itinerary. Aim for a search pre-filled with the hotel name or town, check-in and check-out (from the day dates and `nights`), and the guest count, if the target site's URLs support it. **First test coverage:** search Klook (then KKday) for hotels in St Andrews, Gullane, Brora, Dornoch, Machrihanish, Portrush, Lahinch, Ballybunion, Kingsbarns and George (SA). Report how many return real results. If both are thin, **don't ship hotel links; tell the BA.** Booking.com may come later.
2. **Car hire:** one "Hire a car" link per trip, in the Itinerary or Costs (your call; say where). Pre-fill pickup location (the first day's place, or the nearest airport if their URL supports it) and dates (first to last day) where possible. If EconomyBookings won't take parameters, link its homepage. That still tracks.
3. **Disclosure:** a small, plain note by the links, such as "We may earn a commission at no cost to you". Also add a line to the GOLF-227 privacy dialog: booking links go via Travelpayouts, which may set cookies on the partner site.
4. **No links in the shared view** for now. Plan and build modes only.
5. No Worker changes. No new network calls from the app; these are plain links.

### Checks
- [ ] Open one link per programme live and confirm it lands on the right partner page, pre-filled where claimed.
- [ ] Links work at 375 and on desktop. No "undefined" in the URLs, including for hotels without a date or with 0 nights.
- [ ] Hotel coverage results reported (the 10 towns above).
- [ ] Pushed only after the BA confirms GOLF-160 is live. Live `X-Build` matches.
- [ ] Clicks showing in Travelpayouts **only Stefan can confirm** (they can take up to a day to appear).
