#!/usr/bin/env bash
# Write the document-storage settings into the production .env, without the secret ever appearing
# on a command line, in a shell history, or in a terminal.
#
#   ./scripts/set-storage-env.sh
#
# Run it in a real terminal — it prompts, so it cannot be piped or run from a tool that has no
# stdin. The secret is read with the echo off, sent over the SSH connection on stdin rather than
# as an argument (an argument is visible to anyone running `ps` on the box while it runs), and
# never printed back. The existing file is copied aside first, and the result is shown masked.
set -euo pipefail

cd "$(dirname "$0")/.."

DEFAULT_BUCKET="docubite"
DEFAULT_ENDPOINT="https://a3ee3fbe226cdc68bad5942575bab3a5.r2.cloudflarestorage.com"
DEFAULT_REGION="auto"

read -rp "Bucket [$DEFAULT_BUCKET]: " BUCKET
BUCKET="${BUCKET:-$DEFAULT_BUCKET}"

read -rp "Endpoint [$DEFAULT_ENDPOINT]: " ENDPOINT
ENDPOINT="${ENDPOINT:-$DEFAULT_ENDPOINT}"

read -rp "Region [$DEFAULT_REGION]: " REGION
REGION="${REGION:-$DEFAULT_REGION}"

read -rp "Access key ID: " ACCESS_KEY_ID
[[ -n "$ACCESS_KEY_ID" ]] || { echo "Access key ID is required." >&2; exit 1; }

read -rsp "Secret access key (input hidden): " SECRET_ACCESS_KEY
echo
[[ -n "$SECRET_ACCESS_KEY" ]] || { echo "Secret access key is required." >&2; exit 1; }

echo
echo "Writing to ~/docubite/.env.production on the production host."

# The remote script travels as the SSH command argument, leaving stdin free for the five values.
# It has to be that way round: stdin can carry only one of the two, and the script holds no secret
# while the values do — an argument is visible in `ps` on the host, stdin is not.
REMOTE_SCRIPT=$(cat <<'REMOTE'
set -euo pipefail
IFS= read -r BUCKET
IFS= read -r ENDPOINT
IFS= read -r REGION
IFS= read -r ACCESS_KEY_ID
IFS= read -r SECRET_ACCESS_KEY

FILE="$HOME/docubite/.env.production"
[[ -f "$FILE" ]] || { echo "No $FILE on the host." >&2; exit 1; }

BACKUP="$FILE.bak.$(date +%Y%m%d-%H%M%S)"
cp -p "$FILE" "$BACKUP"

# Replace the key in place if it is already there, append it if not — so re-running this updates
# rather than accumulating duplicate lines, and the file keeps its existing order and comments.
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

set_kv STORAGE_BUCKET "$BUCKET"
set_kv STORAGE_ENDPOINT "$ENDPOINT"
set_kv STORAGE_REGION "$REGION"
set_kv STORAGE_ACCESS_KEY_ID "$ACCESS_KEY_ID"
set_kv STORAGE_SECRET_ACCESS_KEY "$SECRET_ACCESS_KEY"

chmod 600 "$FILE"

echo "Saved. Previous file kept at $(basename "$BACKUP")."
echo
echo "Now set (secrets masked):"
grep -E '^STORAGE_' "$FILE" | sed -E 's/^(STORAGE_(SECRET_ACCESS_KEY|ACCESS_KEY_ID))=(.{0,4}).*/\1=\3…/'
REMOTE
)

# Five values, one per line, into the remote shell's stdin. `printf` is a shell builtin, so the
# secret is never handed to a separate process on this machine either.
printf '%s\n%s\n%s\n%s\n%s\n' \
  "$BUCKET" "$ENDPOINT" "$REGION" "$ACCESS_KEY_ID" "$SECRET_ACCESS_KEY" |
  bash scripts/vps-ssh.sh "$REMOTE_SCRIPT"

echo
echo "Done. Nothing above shows the secret."
echo "Next: redeploy so the containers pick it up."
