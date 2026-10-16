# SVG proposals: markers, clusters, controls, countries

These are design assets only. Nothing here is wired into the app. Open `index.html` to see the preview sheet. It is fully self-contained, with every file inlined, so it also works over `file://`.

## Files

| Path | What | Render size | Leaflet `iconSize` / `iconAnchor` |
|---|---|---|---|
| `markers/course.svg` | plain course: green pin, white flag | 22×33 | `[22,33]` / `[11,32]` |
| `markers/course-ranked.svg` | ranked course: gold star badge, right shoulder | 30×45 | `[30,45]` / `[15,44]` |
| `markers/course-shortlist.svg` | unscheduled shortlist: white 2px ring round the flag | 30×45 | `[30,45]` / `[15,44]` |
| `markers/course-played.svg`, `course-want.svg` | tick or heart badge, left shoulder | 22×33 (or 30 if ranked) | as above |
| `markers/course-ranked-played.svg` | shows both badge slots together | 30×45 | `[30,45]` / `[15,44]` |
| `markers/day-pin-template.svg` | in trip and scheduled: day colour + white day number (Day 1 shown) | 30×45 | `[30,45]` / `[15,44]` |
| `markers/stay.svg`, `see.svg` | hotel stop (bed) and things-to-see stop (camera). Slate when unscheduled, day colour when scheduled | 22×33 | `[22,33]` / `[11,32]` |
| `markers/searched-place.svg` | searched place: navy pin with a white dot | 22×33 | `[22,33]` / `[11,32]` |
| `markers/trip-start.svg`, `trip-end.svg` | ink disc with a play glyph / a chequered flag | 24×24 | `[24,24]` / `[12,12]` |
| `markers/poi-{heritage,nature,coast,culture,drink}.svg` | filled disc, white rim, white glyph (castle, pine, waves, temple, tumbler) | 20×20 | `[20,20]` / `[10,10]` |
| `clusters/cluster-{30,36,44}.svg` (+ `-trip`) | green disc, soft halo, white count. The `-trip` variant adds a gold dot | 30 / 36 / 44 | `[s,s]` / `[s/2,s/2]` |
| `controls/fit-to-trip.svg`, `locate.svg` | 20px grid, 1.75 stroke, ink | 20×20 in a 44px button | — |
| `countries/{great-britain,ireland,south-africa}.svg` | single-path outlines, `currentColor` stroke | fit to the card | — |
| `templates.js` | global functions `gtCoursePinSVG`, `gtDayPinSVG`, `gtClusterSVG`, plus `gtStopPinSVG`, `gtEndpointSVG`, `gtPoiSVG` | — | — |

- **Pin geometry.** Every teardrop uses one 40×60 viewBox and one path, with the same 2:3 proportions as `pinShapeSVG()`. The tip sits at y≈59/60, so the anchor is `[w/2, h-1]`. Set `popupAnchor` and `tooltipAnchor` to `[0, -h+2]`, as now. The static files were emitted from `templates.js`, so the two match exactly.
- **Hit area.** The visuals stay small. Devs should pad the hit area to 44px, for example with a transparent `::before` on the divIcon.
- **Drop shadow.** Keep the current CSS `filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.38))` on pins. Every pin also has a thin white under-rim, which is what keeps it readable on satellite imagery.
- **Badge slots.** All badges share one chassis: an ink `#1B2733` disc with a white rim, which reads on any pin fill. The **right** shoulder is the ranked star, drawn in gold (#E6B400 on ink is 7.9:1). The **left** shoulder holds either the played tick or the want heart (#FB7185, 5.6:1). Those two mean opposite things, so if both are ever set, played wins.
- **`pinStateTint()` yellow circle.** The old yellow inner circle is gone. Shortlist now uses the ring, and scheduled courses use the day pin.

## Colours

Day palette: white numeral on fill, WCAG ratio.

| Day | Hex | White on fill |
|---|---|---|
| 1 rust | #C2410C | 5.18 |
| 2 violet | #7C3AED | 5.70 |
| 3 teal | #0E7490 | 5.36 |
| 4 magenta | #BE185D | 6.04 |
| 5 ochre | #A16207 | 4.92 |
| 6 indigo | #4338CA | 7.90 |
| 7 olive | **#4D7C0F** (was #15803D) | 4.99 |
| 8 crimson | #9F1239 | 8.02 |

I changed one colour. Day 7 went from **#15803D to #4D7C0F**. The original green was almost the same hue as the course pin (#1F7A4D), so a Day 7 pin read as "just a course". The olive shifts it toward yellow and keeps white at 4.99:1. Pin outlines are each fill darkened by 28% (`gtShade`).

POI fills against white: heritage 5.87, nature 5.04, coast 4.53, culture 6.08, drink **3.64**. Drink still clears the 3:1 WCAG threshold for graphics. If drink also needs to meet the 4.5:1 text ratio, use `#9A6512` (4.95).

Clusters: white text on #1F7A4D is 5.32:1.

## Countries

- **Northern Ireland sits under Ireland.** Its clubs (Portrush, County Down, Castlerock) live in `data/courses-ireland.js` with `topIreland:1`, and `courseNation()` maps that flag to `'ie'`. So the Ireland outline is the whole island, and the GB outline is England, Scotland and Wales only.
- **Islands.** GB includes Skye, the Outer Hebrides, Mull, Islay, Anglesey, the Isle of Wight and the Orkney mainland. Shetland is left out because it would stretch the viewBox north. South Africa shows Lesotho as an evenodd hole and has the Eswatini notch.
- **File sizes.** GB is about 2.2KB. Ireland and South Africa are about 0.9KB each.
- **Two styles.** For a filled silhouette, set `fill` on the path and drop the stroke. The files use `vector-effect="non-scaling-stroke"`, so a 1.5px line stays 1.5px at any size.
- **Card counts (shown on the map, 2026-10-16).** Great Britain 370, Ireland 83, South Africa 107, which totals 560.

## Flags

- The static files use `<text>` in Space Grotesk for numbers. If the webfont hasn't loaded, the numbers fall back to system-ui, which is fine.
- **Start and end markers.** I kept them as discs rather than teardrops, so GOLF-243's intent holds: where the trip starts is not a destination. Only the chassis now matches the pin family.
- **Visual weight.** At the same card height, Great Britain looks lighter than South Africa because it is tall and narrow. If that bothers anyone, give the GB card's shape about 10% more height.
