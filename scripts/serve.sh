#!/usr/bin/env bash
# Local dev server for the Golf Map static site.
#
#   ./scripts/serve.sh [port]
#
# Serves the repo root, resolves the extensionless "/london-golf-map-v5_1"
# redirect that index.html uses (GitHub/Cloudflare Pages do this for you;
# a plain static server does not), and opens the map in your browser.
#
# Note: the ORS proxy Worker is remote, so driving times / place search /
# hotels all work from localhost unchanged (the Worker's CORS is currently
# open). No API keys are involved on the client side.

set -euo pipefail

PORT="${1:-8000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="http://localhost:${PORT}/london-golf-map-v5_1.html"

cd "$ROOT"

PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  echo "Need python3 (or python) on PATH." >&2
  exit 1
fi

echo "Serving $ROOT on http://localhost:${PORT}"
echo "Opening $URL"
echo "Ctrl+C to stop."

# Open the browser shortly after the server comes up (macOS: open, Linux: xdg-open).
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi
) &

# A tiny handler so the extensionless redirect target resolves to the .html file.
exec "$PY" - "$PORT" <<'PYEOF'
import sys, http.server, socketserver, os

port = int(sys.argv[1])

class Handler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) and not path.endswith('/'):
            if os.path.exists(path + '.html'):
                self.path += '.html'
        return super().send_head()

    def log_message(self, fmt, *args):
        pass  # quiet

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", port), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
PYEOF
