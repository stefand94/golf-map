# GOLF-230 — Monetisation options (discovery, 2026-10-01)

Status: **DISCOVERY**. These are options, not decisions. Nothing here is built until the owner picks a direction and a DEC is recorded.

## Starting position
- A free, public planner for golf trips in GB, Ireland and South Africa. No accounts, no backend, trips kept in the browser.
- Traffic is unknown: analytics started on 2026-10-01 (GOLF-222). **Every option's value depends on traffic**, so the first month of data matters.
- What we have that's valuable: a structured itinerary (courses, days, hotels, drives, per-person costs). That's essentially a ready-made sales brief for anyone who sells golf trips.

## Options

| # | Option | How money comes in | Effort | Fit | Main catch |
| --- | --- | --- | --- | --- | --- |
| 1 | **Affiliate links**: hotels, car hire, ferries, flights, tee times | Commission on bookings made through our links | Low | High: we already show hotels and drives | Pays little at low traffic; some programmes need traffic before they'll approve you |
| 2 | **"Get a quote for this trip"**: send the itinerary to golf tour operators | Paid per lead, or a share of the booking | Medium | Very high: the itinerary is the brief | Means collecting personal details (privacy, GDPR); needs operators to sign up |
| 3 | **Golf tourism bodies** (VisitScotland, Fáilte Ireland, Visit Wales, SA Tourism, regional golf groups) | Sponsorship, licensing or grant funding | Medium (selling) | High: their job is to promote golf tourism | Slow, public-sector timelines |
| 4 | **Club and course partnerships**: featured listings, special offers | Clubs pay for visibility | Medium | Medium | Paid placement can undermine trust if it isn't clearly labelled |
| 5 | **Paid features for travellers**: trip PDF, cross-device sync, group cost-splitting, detailed mode | One-off "trip pass" (say £5–10) or a subscription | High: needs accounts and payments (GOLF-104) | Medium | Hard to charge when free planners exist; best layered on later |
| 6 | **White label for tour operators**: their branding, their packages, our planner | Setup fee plus a monthly licence | High (product and sales) | High value per deal | Needs multi-tenant config and their pricing data; a long sales cycle |
| 7 | **Content and newsletter** (course guides, "best links under £100", trip ideas) | Sponsorship, plus traffic that feeds options 1 and 2 | Medium, ongoing | Supporting role | Writing time; it's a traffic engine, not revenue on its own |
| 8 | **Display ads** | Ad networks | Low | Low | Pays very little at our traffic, and makes the product worse. **Not recommended.** |
| 9 | **Sell the product** to an operator or a golf media company | One-off sale | — | — | Only realistic once traffic or a partner proves value |
| ✗ | **Taking bookings ourselves** (packages, deposits) | Margin | Very high | — | Package Travel Regulations and ATOL. **Avoid.** |

## BA recommendation: sequence, don't pick one
1. **Now:** let analytics run for 4–6 weeks. With no traffic numbers, every option is guesswork.
2. **First experiments (cheap, reversible):** affiliate hotel links (1) and a "get a quote" button (2) with one or two friendly operators. The quote button is also the cheapest way to test operator demand, which de-risks white label.
3. **In parallel, conversations only:** tourism bodies (3) and a couple of operators about white label (6). Learn what they'd pay for before building anything.
4. **Later:** paid features (5) only after accounts make sense; white label only with a signed first customer.

## The moment we earn anything, these switch on (all already known)
- **Top 100 rankings:** DEC-022 must be re-opened (R-11, GOLF-160). Either get permission or drop the numbers.
- **Esri map tiles:** commercial use needs an Esri account and API key (DEC-036). There is a free tier.
- **OpenRouteService:** the free plan's commercial terms aren't explicit, and a paid plan is aimed at production use. Confirm with HeiGIT before launch.
- **Privacy note:** update it for affiliate tracking and any lead form (option 2 collects personal data).

## Questions for the owner
1. **Ambition:** side income that covers costs, or building a business you'd put real time into?
2. **Selling:** would you personally take calls with operators and tourism bodies? Options 3, 6 and 9 depend on it.
3. **Brand:** are you comfortable with commission links and labelled sponsored listings?
