#!/bin/bash
# Stop an autopilot run cleanly so it can be resumed later with run.sh:
#   1. the runner first (or it launches the next ticket)
#   2. the running session's scope (dev server, browser, subagents go with it)
#   3. commit the ticket's tree as WIP, post the continue hand-off, release the claim
#   4. sweep anything left listening
# Resume: scripts/wayfinder-autopilot/run.sh <map> --detach — the ticket is
# back on the frontier and continues from its hand-off file (a phased build
# resumes at the phase the file names).
#   scripts/wayfinder-autopilot/stop.sh <map>
set -uo pipefail
MAP="${1:?usage: stop.sh <map>}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; cd "$ROOT"
REPO="${WAYFINDER_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
ME="$(gh api user --jq .login)"
OUT="$ROOT/docs/wayfinder-reports/$MAP"

# 1. runners (by pid, never by pattern-kill: a -f pattern matches the caller too)
for p in $(pgrep -f "wayfinder-autopilot/run.sh $MAP" 2>/dev/null); do
  [ "$p" = "$$" ] || [ "$p" = "$PPID" ] || { kill -TERM "$p" 2>/dev/null && echo "stopped runner pid $p"; }
done

# 2. sessions: one scope per running ticket, named wayfinder-<map>-<ticket>-<epoch>
TICKETS=""
for u in $(systemctl --user list-units "wayfinder-$MAP-*" --no-legend --plain 2>/dev/null | awk '{print $1}'); do
  t="$(echo "$u" | sed -E "s/^wayfinder-$MAP-([0-9]+)-.*/\1/")"; TICKETS="$TICKETS $t"
  systemctl --user stop "$u" 2>/dev/null && echo "stopped session scope $u (ticket #$t)"
done
# no systemd: the session's own process group
for p in $(pgrep -f "claude -p /wayfinder $MAP " 2>/dev/null); do
  t="$(ps -o args= -p "$p" | sed -E "s/.*\/wayfinder $MAP ([0-9]+).*/\1/")"; TICKETS="$TICKETS $t"
  pg="$(ps -o pgid= -p "$p" | tr -d ' ')"; [ -n "$pg" ] && kill -TERM -- "-$pg" 2>/dev/null && echo "stopped session pid $p (ticket #$t)"
done
sleep 3

# 3. keep the work, hand off, release
for t in $(echo "$TICKETS" | tr ' ' '\n' | sort -u); do
  [ -z "$t" ] && continue
  if [ -n "$(git status --porcelain -- . ':!.scratch' ':!.impeccable/live' ":!docs/wayfinder-reports/$MAP/logs" 2>/dev/null)" ]; then
    git add -A -- . ':!.scratch' ':!.impeccable/live' ":!docs/wayfinder-reports/$MAP/logs" && git commit -q -m "wip(autopilot): #$t stopped by the owner; continued on the next run" && echo "committed WIP for #$t"
  fi
  gh issue comment "$t" --repo "$REPO" --body "Autopilot: continue — stopped by the owner. Work so far is committed as WIP on the branch. Next session: read \`docs/wayfinder-reports/$MAP/$t.handoff.md\` and the last commits, continue from the milestone it names." >/dev/null 2>&1 && echo "posted hand-off on #$t"
  gh issue edit "$t" --repo "$REPO" --remove-assignee "$ME" >/dev/null 2>&1 && echo "released claim on #$t"
  printf '| %s | [#%s](https://github.com/%s/issues/%s) | stopped by the owner — continues on the next run | – | – |\n' "$(TZ=Africa/Johannesburg date +%Y-%m-%dT%H:%M:%S%z)" "$t" "$REPO" "$t" >> "$OUT/run-log.md"
done

# 4. sweep
for p in $(pgrep -u "$(id -u)" -f 'next dev|next-server|chrome|chromium|playwright|impeccable.*live-server' 2>/dev/null); do kill -TERM "$p" 2>/dev/null || true; done
echo "stopped. resume with: scripts/wayfinder-autopilot/run.sh $MAP --detach"
