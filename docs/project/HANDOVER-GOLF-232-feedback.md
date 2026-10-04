# GOLF-232: Feedback button (dev brief, Geoff)

Owner request, 2026-10-04: *a "Feedback" button that people can click, fill in a short free-text box, and that sends to my email with the title "Golftripper feedback".*

Read the **Standing rules** in `HANDOVER-GOLF-221-225.md` first. They all still apply.

## What to build
1. **Button.** Put a "Feedback" button next to the existing Privacy links: the map credits (`js/map.js` `PRIVACY_LINK`) and the Beta panel foot (`js/trip-ui.js` ~1227). It must be easy to find and tap on a phone.
2. **Dialog.** Copy the GOLF-227 privacy `<dialog>` pattern. It has:
   - a heading;
   - one `<textarea>` (max 2,000 characters, with a live counter);
   - a hidden honeypot field;
   - Send and Cancel buttons.

   Show "Thanks, sent" when it works and a plain error when it doesn't. Keep the text if sending fails. Don't add an email field: the owner asked for free text only. Put a small line under the box: "Don't include personal details. Add your email if you'd like a reply."
3. **Worker route.** Add `POST /feedback` to `ors-proxy.js`.
   - Validate the body: text only, trimmed, 1 to 2,000 characters. Treat the honeypot as filled and drop the message silently.
   - Send the email through Cloudflare Email Routing's **`send_email` binding**, declared in `wrangler.jsonc`.
     - Subject: exactly **`Golftripper feedback`**.
     - Body: the plain text, plus the build, the page mode (plan, build or shared) and the UTC time.
     - Leave out the IP and any trip data.
   - Rate limit: 5 sends per visitor per UTC day, and 100 site-wide. Reuse the GOLF-223 `LookupQuota` Durable Object pattern, or extend that DO.
   - CORS must match the existing modes.
4. **Recipient address.** **Don't put Stefan's email in the repo or the browser.** Read it from a Worker secret (for example `FEEDBACK_TO`) that Stefan sets himself in the dashboard, then build the message from it. Don't hardcode the address in `wrangler.jsonc`.
5. **Privacy note.** Add one line to the GOLF-227 dialog: "Feedback you send is emailed to the site owner. It's not stored anywhere else."

## Stefan's dashboard steps (write them out for him exactly)
- Cloudflare → golftripper.uk → **Email → Email Routing → enable**. Add the DNS records it asks for.
- **Destination addresses → add and verify** his Gmail. `send_email` only delivers to verified addresses.
- Worker → Settings → Variables and Secrets → add the secret **`FEEDBACK_TO`**.
- The sender address must be on golftripper.uk, for example `feedback@golftripper.uk`. Email Routing doesn't need a real mailbox for it. Check whether a sender must be set up in the dashboard.

## AC
- [ ] The button can be found and tapped at 375 wide and on desktop, and in plan, build and shared modes.
- [ ] A real send arrives in Stefan's inbox with the subject "Golftripper feedback" and the text exactly as typed. **Only Stefan can confirm this.**
- [ ] Empty, over-long and honeypot sends are refused, with no email sent. The 6th send in a day gets a clear "limit reached" message.
- [ ] HTML or script typed in the box arrives as plain text, and nothing in the dialog renders it.
- [ ] The text survives a failed send, for example with the Worker unreachable. No console errors and no "undefined" anywhere.
- [ ] Neither `git grep` nor the shipped JS contains Stefan's address.
- [ ] The live `X-Worker-Build` and Pages `X-Build` headers both match your commits.

## Notes
- Don't add a CAPTCHA unless spam actually shows up. If it does, Cloudflare Turnstile is the fallback; ask the BA first.
- Run `node scripts/test_state_persist.js` too. It's now on the checklist in `CLAUDE.md`.
- At the end, tell Stefan what test data you left behind. Don't clear it without his word.
