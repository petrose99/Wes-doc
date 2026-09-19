#!/usr/bin/env bash
# chart.sh on the Mistral key (config.mistral.sh through the LiteLLM proxy). Same arguments.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
WAYFINDER_CONFIG="$ROOT/.claude/wayfinder-autopilot/config.mistral.sh" exec "$HERE/chart.sh" "$@"
