#!/bin/bash
# Retrospective: one bounded session that reads the scoreboard and the last N
# reports and proposes process edits (lessons, pre-flight, brief) as a PR.
# No dev server, no browser, no logs. Run every four or five builds.
#   scripts/wayfinder-autopilot/retro.sh <map> [--last N] [--model M]
set -euo pipefail
MAP="${1:?usage: retro.sh <map> [--last N] [--model M]}"; shift
N=5; MODEL="${WAYFINDER_MODEL_CHEAP:-}"
while [ $# -gt 0 ]; do case "$1" in --last) N="$2"; shift 2;; --model) MODEL="$2"; shift 2;; *) echo "unknown arg: $1" >&2; exit 2;; esac; done
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
[ -f .claude/wayfinder-autopilot/config.sh ] && . .claude/wayfinder-autopilot/config.sh
MODEL="${MODEL:-${MODEL_CHEAP:-}}"
OUT="docs/wayfinder-reports/$MAP"; DATE="$(date -u +%Y%m%d)"
python3 "$(dirname "$0")/scoreboard.py" "$MAP" "$ROOT"
# the last N build reports: those with a scores: line, newest first
REPORTS="$(grep -l '^scores:' "$OUT"/[0-9]*.md 2>/dev/null | xargs -r ls -t | head -n "$N" | tr '\n' ' ')"
[ -z "$REPORTS" ] && { echo "no reports with a scores: line under $OUT yet"; exit 1; }
LOG="$OUT/logs/$(date -u +%Y%m%dT%H%M%SZ)-retro.jsonl"
echo "retro on map #$MAP over: $REPORTS"
claude -p "Retrospective for map #$MAP, date $DATE. Reports to read: $REPORTS" \
  --append-system-prompt-file "$(dirname "$0")/retro-brief.md" \
  ${MODEL:+--model "$MODEL"} ${EFFORT:+--effort "$EFFORT"} \
  --permission-mode acceptEdits \
  --allowedTools "Bash(git:*)" "Bash(gh:*)" "Bash(python3:*)" "Bash(ls:*)" "Bash(wc:*)" "Bash(grep:*)" "Bash(sed:*)" "Bash(head:*)" "Bash(tail:*)" Read Edit Write Grep Glob \
  --disallowedTools AskUserQuestion Agent WebFetch WebSearch \
  --no-session-persistence --output-format stream-json --verbose > "$LOG" 2>"$LOG.stderr"
echo "retro done — log $LOG; PR: $(gh pr list --head "autopilot/retro-$MAP-$DATE" --json url -q '.[0].url' 2>/dev/null || echo 'none opened')"
