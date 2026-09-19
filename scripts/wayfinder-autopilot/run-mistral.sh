#!/usr/bin/env bash
# run.sh, but every session on the Mistral key (config.mistral.sh, through the
# LiteLLM proxy — which config.mistral.sh starts if needed). Same arguments as run.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
WAYFINDER_CONFIG="$ROOT/.claude/wayfinder-autopilot/config.mistral.sh" exec "$HERE/run.sh" "$@"
