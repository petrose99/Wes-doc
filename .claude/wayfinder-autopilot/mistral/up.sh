#!/usr/bin/env bash
# Start (or restart) the Mistral→Anthropic-API proxy on :4000.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
docker rm -f wayfinder-litellm >/dev/null 2>&1 || true
docker run -d --name wayfinder-litellm --restart unless-stopped -p 127.0.0.1:4000:4000 \
  --env-file "$HERE/.env" -v "$HERE/litellm.yaml:/app/config.yaml:ro" \
  ghcr.io/berriai/litellm:main-latest --config /app/config.yaml --port 4000 >/dev/null
for i in $(seq 1 60); do curl -sf http://127.0.0.1:4000/health/liveliness >/dev/null && { echo "litellm up on http://127.0.0.1:4000"; exit 0; }; sleep 1; done
echo "litellm did not come up; docker logs wayfinder-litellm" >&2; exit 1
