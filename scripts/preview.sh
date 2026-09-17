#!/usr/bin/env bash
# One-shot public preview of the local dev server through a Cloudflare quick tunnel.
#   scripts/preview.sh up     # dev DB + next dev + tunnel; prints the https://…trycloudflare.com URL
#   scripts/preview.sh down   # stops the tunnel and the dev server
#   scripts/preview.sh url    # prints the current URL again
# No Cloudflare account needed; the URL changes every `up`. DEV_AUTH_BYPASS is on in .env,
# so anyone with the URL is inside the dev workspace — run `down` when you are done.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
RUN="$ROOT/.preview"; mkdir -p "$RUN"
PORT="${PORT:-3000}"

up() {
  if ! command -v cloudflared >/dev/null; then
    echo "installing cloudflared (one time)…"
    curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
    sudo install /tmp/cloudflared /usr/local/bin/cloudflared
  fi
  docker start docubite-devdb >/dev/null 2>&1 || true
  if curl -sf -o /dev/null "http://localhost:$PORT" 2>/dev/null; then
    echo "dev server already on :$PORT — reusing it (not starting a second one; predev would wipe its build)"
  else
    echo "starting next dev on :$PORT…"
    nohup npm run dev > "$RUN/dev.log" 2>&1 < /dev/null &
    echo $! > "$RUN/dev.pid"
    for _ in $(seq 1 90); do grep -q "Ready" "$RUN/dev.log" 2>/dev/null && break; sleep 1; done
    grep -q "Ready" "$RUN/dev.log" || { echo "dev server did not come up — see $RUN/dev.log"; exit 1; }
  fi
  echo "starting tunnel…"
  nohup cloudflared tunnel --url "http://localhost:$PORT" > "$RUN/tunnel.log" 2>&1 < /dev/null &
  echo $! > "$RUN/tunnel.pid"
  for _ in $(seq 1 30); do grep -qo 'https://[a-z0-9-]*\.trycloudflare\.com' "$RUN/tunnel.log" && break; sleep 1; done
  url
}

url() {
  local u; u="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$RUN/tunnel.log" 2>/dev/null | head -1 || true)"
  [ -n "$u" ] && echo "preview: $u" || { echo "no tunnel URL yet — see $RUN/tunnel.log"; exit 1; }
}

down() {
  for name in tunnel dev; do
    f="$RUN/$name.pid"
    if [ -f "$f" ]; then
      pid="$(cat "$f")"
      if kill -0 "$pid" 2>/dev/null; then
        # the dev server forks (npm → next → workers): take the whole process group
        pg="$(ps -o pgid= -p "$pid" | tr -d ' ')"
        kill -TERM -- "-${pg:-$pid}" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
        echo "stopped $name (pid $pid)"
      fi
      rm -f "$f"
    fi
  done
  sleep 2
  # a dev server still on the port that we did not start (an older one) is left alone
  curl -sf -o /dev/null "http://localhost:$PORT" 2>/dev/null && echo "note: something is still serving :$PORT (not started by this script)" || echo "port :$PORT free"
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  url) url ;;
  *) echo "usage: scripts/preview.sh up|down|url" >&2; exit 2 ;;
esac
