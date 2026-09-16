#!/usr/bin/env bash
# Wayfinder autopilot: one fresh `claude -p "/wayfinder <map> <ticket>"` session
# per frontier ticket, in order, until the frontier is empty or --max is hit.
#
#   scripts/wayfinder-autopilot/run.sh <map-number> [--max N] [--ticket N] [--dry-run]
#
# Each session runs under scripts/wayfinder-autopilot/brief.md, which tells the
# agent to answer its own grilling questions with the ➡️ recommendation and to
# write docs/wayfinder-reports/<map>/<ticket>.md. Logs land in
# docs/wayfinder-reports/<map>/logs/.
#
# Permissions: sessions run in acceptEdits mode with the allowlist below (gh,
# git, package scripts, the detector). Anything outside it is denied and the
# agent is told so; widen ALLOWED_TOOLS if a ticket legitimately needs more.
set -euo pipefail

# Portable: this folder can live anywhere (a repo's scripts/, or ~/.claude/wayfinder-autopilot).
# The project is whatever git repo you run it from; the tracker repo comes from gh.
AP="$(cd "$(dirname "$0")" && pwd)"                       # driver, brief, generic lessons
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"  # the project being worked
REPO="${WAYFINDER_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
BRIEF="$AP/brief.md"
GENERIC_LESSONS="$AP/lessons.md"                           # travels with the tool
PROJECT_LESSONS="$ROOT/.claude/wayfinder-autopilot/lessons.md"   # stays with the repo
mkdir -p "$(dirname "$PROJECT_LESSONS")"
[ -f "$PROJECT_LESSONS" ] || printf '# Project lessons — %s\n\nWhat first passes missed *in this codebase* (its shell, tokens, components, seed data, dev-server recipe). Generic, product-agnostic lessons go to the tool'"'"'s own lessons.md instead.\n\n' "$REPO" > "$PROJECT_LESSONS"
export WAYFINDER_GENERIC_LESSONS="$GENERIC_LESSONS" WAYFINDER_PROJECT_LESSONS="$PROJECT_LESSONS"
ALLOWED_TOOLS=(
  "Bash(gh:*)" "Bash(git:*)" "Bash(npm:*)" "Bash(npx:*)" "Bash(pnpm:*)"
  "Bash(node:*)" "Bash(impeccable:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(grep:*)"
  "Bash(rg:*)" "Bash(find:*)" "Bash(sed:*)" "Bash(head:*)" "Bash(tail:*)"
  "Bash(wc:*)" "Bash(mkdir:*)" "Bash(curl:*)" "Bash(date:*)" "Bash(docker:*)"
  "Bash(cd:*)" "Bash(cp:*)" "Bash(mv:*)" "Bash(rm:*)" "Bash(echo:*)" "Bash(printf:*)"
  "Bash(python3:*)" "Bash(chmod:*)" "Bash(sleep:*)" "Bash(kill:*)" "Bash(pgrep:*)"
  "Bash(free:*)" "Bash(ps:*)" "Bash(lsof:*)" "Bash(ss:*)" "Bash(test:*)"
  "Read" "Edit" "Write" "Glob" "Grep" "Skill" "Agent" "WebFetch" "WebSearch"
)

MAP="${1:?usage: run.sh <map-number> [--max N] [--ticket N] [--dry-run] [--detach] [--after-pid PID]}"; shift
MAX=50; ONLY=""; DRY=0; DETACH=0; AFTER_PID=""
ARGS=("$@")
while [ $# -gt 0 ]; do
  case "$1" in
    --max) MAX="$2"; shift 2 ;;
    --ticket) ONLY="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --detach) DETACH=1; shift ;;
    --after-pid) AFTER_PID="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

OUT="$ROOT/docs/wayfinder-reports/$MAP"; LOGS="$OUT/logs"; mkdir -p "$LOGS"
RUNLOG="$OUT/run-log.md"
[ -f "$RUNLOG" ] || printf '# Autopilot run log — map #%s\n\n| When (UTC) | Ticket | Outcome | Duration | Log |\n|---|---|---|---|---|\n' "$MAP" > "$RUNLOG"
ME="$(gh api user --jq .login)"

# --detach: re-exec this script under nohup/setsid so it survives the caller's
# shell (and any harness timeout); progress goes to docs/wayfinder-reports/<map>/detached.out.
if [ "$DETACH" = 1 ]; then
  DET=(); for a in "${ARGS[@]}"; do [ "$a" = "--detach" ] || DET+=("$a"); done
  nohup setsid "$0" "$MAP" "${DET[@]}" > "$OUT/detached.out" 2>&1 < /dev/null &
  echo "detached as pid $! — tail -f $OUT/detached.out"; exit 0
fi

# --after-pid: wait for an earlier session (pid) to exit before starting, and
# release any ticket it left claimed but open so this run can retake it.
if [ -n "$AFTER_PID" ]; then
  while kill -0 "$AFTER_PID" 2>/dev/null; do sleep 15; done
  gh api "repos/$REPO/issues/$MAP/sub_issues" --paginate \
    --jq ".[] | select(.state==\"open\" and .assignee.login==\"$ME\") | .number" |
  while read -r n; do
    gh issue edit "$n" --repo "$REPO" --remove-assignee "$ME" >/dev/null 2>&1 && echo "released #$n (left claimed by pid $AFTER_PID)"
  done
fi

# Frontier = open, unassigned child tickets whose blockers are all closed, in
# sub-issue order. Tickets that failed earlier this run are skipped.
declare -A SKIP=() ATTEMPTS=()
MAX_ATTEMPTS=3   # a ticket left open as "Autopilot: partial —" is retried this many times
frontier() {
  gh api "repos/$REPO/issues/$MAP/sub_issues" --paginate \
    --jq '.[] | select(.state=="open" and .assignee==null) | .number' |
  while read -r n; do
    [ -n "${SKIP[$n]:-}" ] && continue
    open_blockers="$(gh api graphql -f query="{ repository(owner:\"${REPO%/*}\",name:\"${REPO#*/}\") { issue(number:$n) { blockedBy(first:50){ nodes{ state } } } } }" \
      --jq '[.data.repository.issue.blockedBy.nodes[] | select(.state=="OPEN")] | length')"
    [ "$open_blockers" = "0" ] && echo "$n"
  done
}

# Tear down whatever a finished session left running so memory is returned
# before the next ticket: first its whole process group, then any dev server /
# headless browser / detector runner that started after the session began
# (children that re-parented themselves out of the group).
cleanup_session() {
  local pid="$1" since="$2" pgid
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
  if [ -n "$pgid" ] && [ "$pgid" != "$$" ]; then
    kill -TERM -- "-$pgid" 2>/dev/null; sleep 5; kill -KILL -- "-$pgid" 2>/dev/null
  fi
  local p
  for p in $(pgrep -f 'next dev|next-server|chrome|chromium|playwright|impeccable (live|serve)|detect\.js' 2>/dev/null); do
    [ "$p" = "$$" ] && continue
    # ps etimes = seconds since start; only kill things younger than the session
    [ "$(ps -o etimes= -p "$p" 2>/dev/null | tr -d ' ')" -le "$(( $(date +%s) - since ))" ] 2>/dev/null && kill -TERM "$p" 2>/dev/null
  done
  sleep 3
  for p in $(pgrep -f 'next dev|next-server|chrome|chromium|playwright|impeccable (live|serve)|detect\.js' 2>/dev/null); do
    [ "$(ps -o etimes= -p "$p" 2>/dev/null | tr -d ' ')" -le "$(( $(date +%s) - since ))" ] 2>/dev/null && kill -KILL "$p" 2>/dev/null
  done
  sync; echo "    cleaned up session pid $pid (pgid ${pgid:-?}); free: $(free -m | awk '/Mem:/{print $7" MB"}')"
}

state()  { gh api "repos/$REPO/issues/$1" --jq .state; }
title()  { gh api "repos/$REPO/issues/$1" --jq .title; }

n=0
while [ "$n" -lt "$MAX" ]; do
  if [ -n "$ONLY" ]; then
    [ "$n" -gt 0 ] && break
    T="$ONLY"
  else
    T="$(frontier | head -n1 || true)"
    [ -z "$T" ] && { echo "Frontier empty — map #$MAP has nothing takeable. Done."; break; }
  fi
  n=$((n+1))
  TT="$(title "$T")"
  echo "=== [$n/$MAX] #$T — $TT"
  if [ "$DRY" = 1 ]; then SKIP[$T]=1; continue; fi

  # Start each session on a clean box: if a dev server or headless browser is
  # still running from before this run (or a previous run), stop it first.
  # The VPS's memwatch alerts under 20% available RAM, and a stale next-server
  # alone can hold 4 GB.
  for p in $(pgrep -f 'next dev|next-server|chrome|chromium|playwright' 2>/dev/null); do
    [ "$p" = "$$" ] || kill -TERM "$p" 2>/dev/null
  done
  sleep 2
  START=$(date -u +%Y-%m-%dT%H:%M:%SZ); S0=$(date +%s)
  LOG="$LOGS/$(date -u +%Y%m%dT%H%M%SZ)-$T.jsonl"
  set +e
  # Each session gets its own process group (setsid) so everything it spawns —
  # dev server, headless Chromium, node workers, subagents — can be torn down
  # together when the ticket is done, and the next session starts clean.
  # The brief is generic; the session learns the two lessons paths from this line.
  ( cd "$ROOT" && setsid claude -p "/wayfinder $MAP $T" \
      --append-system-prompt-file "$BRIEF" \
      --append-system-prompt "Lessons files for this run — generic (every project): $GENERIC_LESSONS · project-specific (this repo): $PROJECT_LESSONS. Reports go to $OUT/<ticket>.md." \
      --permission-mode acceptEdits \
      --allowedTools "${ALLOWED_TOOLS[@]}" \
      --disallowedTools AskUserQuestion \
      --no-session-persistence \
      --output-format stream-json --verbose \
      > "$LOG" 2>"$LOG.stderr" ) &
  SESSION_PID=$!
  wait "$SESSION_PID"; RC=$?
  cleanup_session "$SESSION_PID" "$S0"
  set -e
  DUR=$(( $(date +%s) - S0 ))

  ATTEMPTS[$T]=$(( ${ATTEMPTS[$T]:-0} + 1 ))
  if [ "$(state "$T")" = "closed" ]; then
    OUTCOME=resolved
  else
    last="$(gh api "repos/$REPO/issues/$T/comments" --jq 'last.body // ""' | head -c 40)"
    if [[ "$last" == "Autopilot: partial"* ]] && [ "${ATTEMPTS[$T]}" -lt "$MAX_ATTEMPTS" ]; then
      OUTCOME="partial, attempt ${ATTEMPTS[$T]}/$MAX_ATTEMPTS — will retry"
    else
      OUTCOME="not closed (rc=$RC)"; SKIP[$T]=1
    fi
    # release the claim so the retry (or a human) can take it
    gh issue edit "$T" --repo "$REPO" --remove-assignee "$ME" >/dev/null 2>&1 || true
  fi
  [ -f "$OUT/$T.md" ] || OUTCOME="$OUTCOME, no report"
  printf '| %s | [#%s](https://github.com/%s/issues/%s) %s | %s | %dm%02ds | [log](logs/%s) |\n' \
    "$START" "$T" "$REPO" "$T" "$TT" "$OUTCOME" $((DUR/60)) $((DUR%60)) "$(basename "$LOG")" >> "$RUNLOG"
  echo "--- #$T: $OUTCOME in ${DUR}s"
done
echo "Run log: $RUNLOG"
