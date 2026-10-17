# GOLF-277: short share links

**Owner ask (2026-10-17):** the share link is far too long. It should look short in WhatsApp and similar apps.
**Decided:** DEC-041. **Dev:** Geoff. **Priority:** P1.

## Objective
"Share" gives a link like `golftripper.uk/s/k7m2qx` instead of the whole trip packed into the URL.

## Requirements
1. When the visitor shares, the trip as it is at that moment is saved on Cloudflare and they get a short link. The link is a snapshot: editing the trip afterwards does not change it, and sharing again gives a new link.
2. Opening the short link shows exactly the read-only shared view a long link shows today. The CTA from GOLF-268, the `open` counter and the affiliate rules all behave the same.
3. Link previews (WhatsApp, iMessage, Slack, X) show the trip name as the title and a one-line description, e.g. "5 days · St Andrews, Kingsbarns, Carnoustie". The trip name no longer needs to ride in `?t=`.
4. Links last forever. No expiry.
5. Old links (`#share=` JSON, `#share=z1.`, `?t=`) keep working exactly as now.
6. If saving fails (offline, Cloudflare error or limit), Share still works and falls back to today's long link, with no error the visitor has to act on.
7. Sharing the same trip twice without changes should not create a second stored copy. One way is an id derived from the content. The dev chooses how.

## Acceptance criteria
- [ ] Share on desktop and phone gives a link of at most ~35 characters, on golftripper.uk.
- [ ] Pasting it into WhatsApp shows the trip name and the one-line summary, not the generic site title.
- [ ] Opening it in a fresh browser shows the same trip, days, items, notes and costs as the long link for the same trip.
- [ ] After editing the trip, the earlier short link still shows the old version.
- [ ] An unknown or mangled id shows a friendly "This trip link isn't valid" state with the normal CTA. No blank page and no JS error.
- [ ] With the save forced to fail, Share returns a working long link.
- [ ] Old `#share=` and `#share=z1.` links still open correctly.
- [ ] Abuse limits: a size cap on what is stored (well above a 14-day trip with notes), only payloads that decode as a valid trip are stored, and a per-IP rate limit on saves.
- [ ] The privacy note (GOLF-227) says that a shared trip is stored so its link works. It includes any notes, and no name or account.
- [ ] Five check scripts pass. On preview hosts, short links work or fall back to long ones, and are never indexed.

## Out of scope
Links that update live, deleting a shared link, sharing analytics beyond the existing `open` counter, custom slugs, and a preview image (later, maybe).

## Constraints
- The Worker deploys from git. The KV/binding config lives in wrangler config, not the dashboard. Verify with `X-Worker-Build`.
- Never print or commit a secret. If a new secret is needed, Stefan adds it.
- Free tier: about 1,000 KV writes a day. That's fine for now, and fallback covers it if it's exceeded.

The dev should inspect the existing codebase and follow established project patterns before introducing new architecture.
