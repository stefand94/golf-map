# BA handover: session 10 (2026-10-04 to 2026-10-15)

## Role (owner rules)
- The BA/PM never writes code. Brief the devs, check the outcome live, and keep `docs/project/` current.
- Keep replies to Stefan very short. Devs report in a few lines; Stefan hears through the BA.
- **Commercial work is on hold** (GOLF-230). No pitch, no emails, no operator sign-ups.

## Devs (message them with `send_message`; messages queue while a dev is busy)
| Dev | Session | Now |
| --- | --- | --- |
| Gavin | local_3fca3136-2b4f-471f-b478-dcfd6237af76 | free |
| Geoff | local_dba50868-33bc-4648-8f08-41ee64dae220 | free (owns the Worker and map) |
| Barry | local_3c95b823-1f47-4259-9cc3-6d118e96600e | free (data, UI polish) |

## Shipped this session (all BA-checked live)
- **GOLF-153 detailed mode:** a calendar day view.
  - Flight, train, drive-from and activity blocks.
  - Drag to move or resize; colours per block type.
  - Tee time as the anchor, with an "Arrive by" block before it.
- **GOLF-247:** edit the price of anything (golf override "✎", per person or per group, any currency), plus day and trip costs.
- **GOLF-242:** hotel links via Stay22 (aid `golftripper`).
- **GOLF-234 part 1:** Esri key. **GOLF-244:** vector street map.
- **GOLF-238, 239:** data hygiene.
  - Coordinates re-sourced.
  - 90 fees became "Ask club"; course stats removed.
- **GOLF-246, 248, 249:** spacing and polish. **GOLF-241:** usage stats count production only.

## Open
- **GOLF-243:** DONE 2026-10-15 (the end-station buffer is shown as text and is not editable; accepted).
- **GOLF-234:**
  - (2) The BA checks OpenRouteService's commercial terms. Not started.
  - (3) The owner moves UptimeRobot to Better Stack, using the same `/health` URL.
- **Parked or held:** GOLF-245 (Esri place search; terms checked, see the row), GOLF-230, 104, 195, 157.

## Owner to-dos
- Delete the Pages previews `golf-153-calendar` and `golf-153-detailed-mode`.
- iPhone checks:
  - vector map: smoothness, and the blank when switching back from satellite;
  - edit a fee and add a day cost;
  - Stay22 link;
  - spacing.
- **Esri key expires about 2027-10-05** (R-8): renew it in September 2027. Worker secret `ESRI_MAP`.

## How-tos and traps
- **Live checks:**
  - `curl -s -D - -o /dev/null https://golftripper.uk/ | grep -i x-build`. It must be a GET; `-I` shows nothing.
  - Worker: `X-Worker-Build`.
  - Esri key: `curl -s -H 'Origin: https://golftripper.uk' https://api.golftripper.uk/esri-key | grep -c '"key":"'` (1 means OK; never print the key).
- **BA push:**
  - `git pull --rebase --autostash`, then `git log origin/main..HEAD` must show only BA commits, then push.
  - Never commit `.claude/launch.json`. An autostash once conflicted on it; restore the stash's copy and don't drop it before checking.
- **Secrets:** never ask for or see a key. Stefan sets Worker secrets himself.
- **Never build test trips on golftripper.uk.**
