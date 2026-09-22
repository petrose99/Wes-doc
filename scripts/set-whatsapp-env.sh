#!/usr/bin/env bash
# Push the WHATSAPP_* values collected by scripts/wizards/whatsapp-provision.sh into the
# production .env, without any secret appearing on a command line, in shell history, or in a
# terminal. Same shape as scripts/set-storage-env.sh — see its comments for why stdin, not args.
#
#   ./scripts/set-whatsapp-env.sh [local-env-file]      # default: .env.whatsapp
#
# Reads the five keys from the local file the wizard wrote, sends them over SSH stdin, upserts
# them into ~/docubite/.env.production on the host (backup kept), and prints them masked.
# Then redeploy on the host so the containers pick them up:
#   ./scripts/vps-ssh.sh 'cd ~/docubite && git pull && ./scripts/deploy.sh'
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="${1:-.env.whatsapp}"
[[ -f "$SRC" ]] || { echo "No $SRC — run scripts/wizards/whatsapp-provision.sh first (ENV_FILE=$SRC)." >&2; exit 1; }

KEYS=(WHATSAPP_APP_SECRET WHATSAPP_VERIFY_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_ACCESS_TOKEN WHATSAPP_BUSINESS_NUMBER)

get() { grep -E "^$1=" "$SRC" | tail -n1 | cut -d= -f2-; }

VALUES=()
for key in "${KEYS[@]}"; do
  value=$(get "$key")
  [[ -n "$value" ]] || { echo "$key is empty in $SRC." >&2; exit 1; }
  VALUES+=("$value")
done

echo "Writing ${#KEYS[@]} WHATSAPP_* values to ~/docubite/.env.production on the production host."

REMOTE_SCRIPT=$(cat <<'REMOTE'
set -euo pipefail
FILE="$HOME/docubite/.env.production"
[[ -f "$FILE" ]] || { echo "No $FILE on the host." >&2; exit 1; }

BACKUP="$FILE.bak.$(date +%Y%m%d-%H%M%S)"
cp -p "$FILE" "$BACKUP"

set_kv() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$FILE"; then
    VALUE="$value" awk -v key="$key" '
      index($0, key "=") == 1 { print key "=" ENVIRON["VALUE"]; next }
      { print }
    ' "$FILE" > "$FILE.tmp"
    mv "$FILE.tmp" "$FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$FILE"
  fi
}

for key in WHATSAPP_APP_SECRET WHATSAPP_VERIFY_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_ACCESS_TOKEN WHATSAPP_BUSINESS_NUMBER; do
  IFS= read -r value
  set_kv "$key" "$value"
done

chmod 600 "$FILE"

echo "Saved. Previous file kept at $(basename "$BACKUP")."
echo
echo "Now set (secrets masked):"
grep -E '^WHATSAPP_' "$FILE" | sed -E 's/^(WHATSAPP_(APP_SECRET|VERIFY_TOKEN|ACCESS_TOKEN))=(.{0,4}).*/\1=\3…/'
REMOTE
)

printf '%s\n' "${VALUES[@]}" | bash scripts/vps-ssh.sh "$REMOTE_SCRIPT"

echo
echo "Done. Next, on the host, pull the WhatsApp code and redeploy:"
echo "  ./scripts/vps-ssh.sh 'cd ~/docubite && git pull && ./scripts/deploy.sh'"
echo "Then check: curl 'https://docubite.app/api/inbound-whatsapp?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=ok'  → should print: ok"
