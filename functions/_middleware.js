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
export async function onRequest(context) {
  const { request, env, next } = context;

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
