/**
 * GOLF-35 Phase A1 — shared-password gate for non-production deployments.
 * Cloudflare Pages Functions picks up functions/_middleware.js
 * automatically (no build step, no bundler — same zero-config model as
 * the rest of this repo) and runs it in front of every request.
 *
 * env.DEV_PASSWORD is a Pages environment variable scoped to the
 * "Preview" environment only (set in the dashboard, never committed
 * here). That scoping is what makes this gate self-selecting:
 *   - Production (main branch deploy): DEV_PASSWORD is unset -> next()
 *     immediately, no auth prompt, matches the "no password on prod"
 *     acceptance criterion.
 *   - Preview (any other branch): DEV_PASSWORD is set -> every request,
 *     including static assets, must present HTTP Basic Auth as
 *     dev / <DEV_PASSWORD> before anything is served.
 */
/*
 * GOLF-35 Phase B — golftripper.uk is the live site. The bare
 * golf-map.pages.dev (the old production address) and www.golftripper.uk
 * both 301 to the same path + query on golftripper.uk. Branch previews
 * (<branch>.golf-map.pages.dev) are a different host, so they fall
 * through untouched.
 *
 * Done here rather than as a dashboard Bulk Redirect so it lives in git
 * and can be tested on a preview. A #share= hash never reaches the
 * server; browsers carry it across a redirect whose Location has no hash
 * of its own, so old share links still open the same trip.
 */
/*
 * GOLF-214 — the app moved from /london-golf-map-v5_1 to /. The old path,
 * with or without .html, 301s to / on the same host, so previews behave the
 * same way as production. The hash is kept for the reason given above, so
 * old #trip and #share= links still open the same trip. An old link on an
 * old host takes one hop, not two.
 */
const CANONICAL_ORIGIN = 'https://golftripper.uk';
const REDIRECT_HOSTS = new Set(['golf-map.pages.dev', 'www.golftripper.uk']);
const LEGACY_APP_PATH = /^\/london-golf-map-v5_1(\.html)?$/;

export async function onRequest(context) {
  const { request, env, next } = context;

  const url = new URL(request.url);
  const legacy = LEGACY_APP_PATH.test(url.pathname);
  const path = legacy ? '/' : url.pathname;
  if (REDIRECT_HOSTS.has(url.hostname)) {
    return Response.redirect(CANONICAL_ORIGIN + path + url.search, 301);
  }
  if (legacy) return Response.redirect(url.origin + path + url.search, 301);

  if (!env.DEV_PASSWORD) return next();

  const auth = request.headers.get('Authorization') || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme === 'Basic' && encoded) {
    let decoded = '';
    try {
      decoded = atob(encoded);
    } catch (e) {
      decoded = '';
    }
    const sep = decoded.indexOf(':');
    const user = sep === -1 ? decoded : decoded.slice(0, sep);
    const pass = sep === -1 ? '' : decoded.slice(sep + 1);
    // A plain === on the decoded password is acceptable here (GOLF-35
    // A1) — this gates a low-value shared secret protecting
    // work-in-progress UI, not user data or a real account.
    if (user === 'dev' && pass === env.DEV_PASSWORD) return next();
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Golf Map dev"' },
  });
}
