#!/usr/bin/env bash
# Builds and (re)starts the DocuBite stack. Idempotent — this is also the update path.
#
#   ./scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production — copy .env.production.example and fill it in." >&2
  exit 1
fi

# Fail loudly on placeholders rather than booting a half-configured stack that 500s later.
if grep -qE '=(REPLACE_ME|REPLACE_[a-z_]+)?$|REPLACE_' .env.production; then
  echo "WARNING: .env.production still contains REPLACE_/empty placeholders:" >&2
  grep -nE 'REPLACE_' .env.production >&2 || true
  read -rp "Continue anyway? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || exit 1
fi

echo "==> Building and starting"
$COMPOSE up -d --build

echo "==> Waiting for services to settle"
sleep 10
$COMPOSE ps

echo
echo "==> Web logs (last 30 lines) — migrations run here on boot"
$COMPOSE logs --tail=30 web
