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
export TZ="${TZ:-Africa/Johannesburg}"   # the sessions stamp hand-offs and reports in local time
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

MAP="${1:?usage: run.sh <map-number> [--max N] [--ticket N] [--dry-run] [--detach] [--after-pid PID] [--model M]}"; shift
MAX=50; ONLY=""; DRY=0; DETACH=0; AFTER_PID=""
ARGS=("$@")
while [ $# -gt 0 ]; do
  case "$1" in
    --max) MAX="$2"; shift 2 ;;
    --ticket) ONLY="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --detach) DETACH=1; shift ;;
    --after-pid) AFTER_PID="$2"; shift 2 ;;
    --model) export WAYFINDER_MODEL="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

OUT="$ROOT/docs/wayfinder-reports/$MAP"; LOGS="$OUT/logs"; mkdir -p "$LOGS"
# What was untracked before this run is the owner's, not a session's: WIP
# commits (wip-add.sh, also used by stop.sh) never sweep it in.
PRE_UNTRACKED="$LOGS/pre-untracked.txt"
( cd "$ROOT" && git ls-files --others --exclude-standard --directory ) > "$PRE_UNTRACKED"
RUNLOG="$OUT/run-log.md"
[ -f "$RUNLOG" ] || printf '# Autopilot run log — map #%s\n\n| When (SAST) | Ticket | Outcome | Duration | Log |\n|---|---|---|---|---|\n' "$MAP" > "$RUNLOG"
ME="$(gh api user --jq .login)"

# --detach: re-exec this script under nohup/setsid so it survives the caller's
# shell (and any harness timeout); progress goes to docs/wayfinder-reports/<map>/detached.out.
if [ "$DETACH" = 1 ]; then
  DET=(); for a in "${ARGS[@]}"; do [ "$a" = "--detach" ] || DET+=("$a"); done
  DOUT="$OUT/detached-$(date -u +%Y%m%dT%H%M%SZ).out"
  nohup setsid "$0" "$MAP" "${DET[@]}" > "$DOUT" 2>&1 < /dev/null &
  ln -sfn "$(basename "$DOUT")" "$OUT/detached.out"
  echo "detached as pid $! — tail -f $DOUT"; exit 0
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
MAX_ATTEMPTS=3   # consecutive sessions on one ticket with no progress before it is parked; progress resets it
frontier() {
  gh api "repos/$REPO/issues/$MAP/sub_issues" --paginate \
    --jq '.[] | select(.state=="open" and .assignee==null) | .number' |
  while read -r n; do
    [ -n "${SKIP[$n]:-}" ] && continue
    # Tickets only the owner can close (sign-offs on removals) are never taken:
    # a session would spend its start-up just to post "blocked". Left for the human.
    if [[ "$(title "$n")" =~ ^(Owner sign-off|Sign off|Sign-off) ]]; then SKIP[$n]=1; continue; fi
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
    kill -TERM -- "-$pgid" 2>/dev/null || true; sleep 5; kill -KILL -- "-$pgid" 2>/dev/null || true
  fi
  local p
  for p in $(pgrep -u "$(id -u)" -f 'next dev|next-server|chrome|chromium|playwright|impeccable (live|serve)|detect\.js' 2>/dev/null); do
    [ "$p" = "$$" ] && continue
    # ps etimes = seconds since start; only kill things younger than the session
    case "$(readlink "/proc/$p/cwd" 2>/dev/null)/" in "$ROOT/"*) ;; *) continue ;; esac   # not ours (owner's viewing server in a worktree)
    if [ "$(ps -o etimes= -p "$p" 2>/dev/null | tr -d ' ')" -le "$(( $(date +%s) - since ))" ] 2>/dev/null; then kill -TERM "$p" 2>/dev/null || true; fi
  done
  sleep 3
  for p in $(pgrep -u "$(id -u)" -f 'next dev|next-server|chrome|chromium|playwright|impeccable (live|serve)|detect\.js' 2>/dev/null); do
    case "$(readlink "/proc/$p/cwd" 2>/dev/null)/" in "$ROOT/"*) ;; *) continue ;; esac
    if [ "$(ps -o etimes= -p "$p" 2>/dev/null | tr -d ' ')" -le "$(( $(date +%s) - since ))" ] 2>/dev/null; then kill -KILL "$p" 2>/dev/null || true; fi
  done
  sync; echo "    cleaned up session pid $pid (pgid ${pgid:-?}); free: $(free -m | awk '/Mem:/{print $7" MB"}')"
}

# Model per ticket. The tool's default is one model for everything (whatever
# your Claude settings say). A project may route research and polish tickets
# — bounded work on already-named findings — to a cheaper model by setting
# MODEL_CHEAP in its .claude/wayfinder-autopilot/config.sh; that file is
# per-project, never part of the tool. WAYFINDER_MODEL=<model> overrides a run.
MODEL_STRONG="${WAYFINDER_MODEL_STRONG:-}"          # empty = the user's default model
MODEL_CHEAP="${WAYFINDER_MODEL_CHEAP:-}"
CONFIG="${WAYFINDER_CONFIG:-$ROOT/.claude/wayfinder-autopilot/config.sh}"   # WAYFINDER_CONFIG=<file> swaps the provider/model ladder
[ -f "$CONFIG" ] && . "$CONFIG"
MODEL_CHEAP="${MODEL_CHEAP:-$MODEL_STRONG}"
MODEL_MEASURE="${WAYFINDER_MODEL_MEASURE:-${MODEL_MEASURE:-}}"   # optional: the measure phase's first session (plumbing only)
# EFFORT (optional, per-project or WAYFINDER_EFFORT): pinned per session with
# --effort so the autopilot never inherits whatever the user's own /model
# choice wrote into ~/.claude/settings.json. Empty = inherit.
EFFORT="${WAYFINDER_EFFORT:-${EFFORT:-}}"
# Continuation. A ticket is never dropped because one session could not
# finish it: when a session hits a cap, or exits with the ticket open and no
# hand-off (a plain exit while "waiting" on a subagent, a decline), the tree
# is committed as WIP and a hand-off comment is posted, and the ticket comes
# straight back onto the frontier for the next session to continue from the
# hand-off file (docs/wayfinder-reports/<map>/<ticket>.handoff.md — the
# wayfinder skill keeps it current at every milestone). MAX_ATTEMPTS bounds
# only *consecutive sessions that made no progress* (no new commit, no
# hand-off change); a session that moved the work resets the count.
wip_handoff() {   # $1 ticket, $2 reason
  ( cd "$ROOT" && "$AP/wip-add.sh" "$PRE_UNTRACKED" && git commit -q -m "wip(autopilot): #$1 $2; continued in the next session" ) || echo "    (WIP commit for #$1 did not happen — see above)"
  gh issue comment "$1" --repo "$REPO" --body "Autopilot: continue — $2. Work so far is committed as WIP on the branch. Next session: read \`docs/wayfinder-reports/$MAP/$1.handoff.md\` and the last commits, continue from the milestone it names, do the build in this session (no background build agent — a session that ends its turn waiting on one exits and takes it down), keep the hand-off file current, and close at the bar. If the previous session left a question for the owner, answer it under the standing delegation and continue. Do not narrow the ticket to fit a session: the whole scope ships, over as many sessions as it takes." >/dev/null 2>&1 || true
}
progress_mark() {   # a fingerprint of "did this session move the work": HEAD + hand-off file
  ( cd "$ROOT" && git rev-parse HEAD 2>/dev/null; git hash-object "$OUT/$1.handoff.md" 2>/dev/null ) | tr '\n' ' '
}
# MODEL_EXEC_FIRST (optional, per-project): execution tickets start on this
# model; a ticket left "Autopilot: partial —" is retried on MODEL_STRONG.
# Phased builds. A rendered-surface build ("Build …" task ticket) runs as
# three sessions, each a fresh context that starts from the hand-off file:
#   spec    → intent + impeccable pre-build, pre-flight A–E, spec critic; no dev server
#   build   → the surface from the tables, contract checks, WIP commit; no capture
#   measure → servers, one capture round, the three readers, scores on the hand-off; no fixes
#   close   → fix batch, confirm round, tests, build, primer, report, close
# (#257's close phase did not fit one budget: five sessions, the readers never
# re-run after the fixes. Measuring and closing are now separate sessions.)
# The cost of a session is quadratic in its length (every turn re-reads the
# context), so three short sessions cost a fraction of one long one — #252
# ran 747 turns/221M tokens in one session; its continuation from a hand-off
# took 262/38M. The phase is read off the hand-off file's `milestone:` lines,
# so the runner keeps no state and a re-run resumes where the file says.
PHASED_TITLE_RE="${PHASED_TITLE_RE:-^Build }"
# A phase never moves backwards. The hand-off file is rewritten by every
# session and one build session dropped the `milestone: spec-done` line, so
# the driver read "spec" again and re-ran a finished phase (#259, 11:55). The
# driver therefore keeps its own high-water mark in <ticket>.phase and takes
# the later of the two.
phase_rank() { case "$1" in spec) echo 1;; build) echo 2;; measure) echo 3;; close) echo 4;; *) echo 0;; esac; }
phase_of() {   # $1 ticket → "" (single session) | spec | build | close
  local labels; labels="$(gh api "repos/$REPO/issues/$1" --jq '[.labels[].name]|join(",")')"
  [[ "$labels" == *wayfinder:task* ]] && [[ "$(title "$1")" =~ $PHASED_TITLE_RE ]] || { echo ""; return; }
  local h="$OUT/$1.handoff.md" m=spec f=spec
  if [ -f "$h" ] && grep -q '^milestone: measured' "$h"; then m=close
  elif [ -f "$h" ] && grep -q '^milestone: build-done' "$h"; then m=measure
  elif [ -f "$h" ] && grep -q '^milestone: spec-done' "$h"; then m=build; fi
  [ -f "$OUT/$1.phase" ] && f="$(cat "$OUT/$1.phase")"
  if [ "$(phase_rank "$m")" -ge "$(phase_rank "$f")" ]; then echo "$m"; else echo "$f"; fi
}
declare -A PHASE_RUNS=()   # "ticket:phase" → sessions already spent on that phase
# CLOSE_RESUME=1 (config, default off): a close session that handed off at
# the context line is *resumed* (`--resume`) by the next close session on the
# same ticket instead of started fresh, with the soft cap raised to
# CLOSE_RESUME_MAX_TOKENS (default 400K). Only on a [1m]-window model, and
# only within one driver run. The fix→gate loop keeps its memory; the price
# is that every later turn re-reads the whole longer context — quadratic —
# which is why it is off by default and the close phase keeps its state in
# <scratch>/close.md instead (phases/close.md).
CLOSE_RESUME="${WAYFINDER_CLOSE_RESUME:-${CLOSE_RESUME:-0}}"
CLOSE_RESUME_MAX_TOKENS="${WAYFINDER_CLOSE_RESUME_MAX_TOKENS:-${CLOSE_RESUME_MAX_TOKENS:-400000}}"
declare -A CLOSE_SID=()    # ticket → session id of its last close session that handed off at the line
last_no_progress() {   # $1 ticket → the ticket's last run-log row was a no-progress session
  [ -f "$RUNLOG" ] || return 1
  grep -F "[#$1](" "$RUNLOG" | tail -1 | grep -q "no progress"
}
load_tokens() {   # $1 log → tokens the first main assistant turn paid before any work (read + created + input)
  python3 - "$1" 2>/dev/null <<'PY'
import json,sys
for line in open(sys.argv[1]):
    if '"usage"' not in line: continue
    try: d=json.loads(line)
    except: continue
    if d.get('type')=='assistant' and not d.get('parent_tool_use_id'):
        u=d['message']['usage']; print(u.get('input_tokens',0)+u.get('cache_read_input_tokens',0)+u.get('cache_creation_input_tokens',0)); break
else: print(0)
PY
}
# Hard phases. A phase that has already burned HARD_AFTER sessions without
# completing is hard: every further session on it runs on MODEL_HARD at
# EFFORT_HARD — no cheap first pass, no waiting for a "partial" to escalate.
# The moment the phase completes (its "phase … done →" row lands in the run
# log) or the ticket resolves, the count restarts and routing reverts to the
# normal ladder (the exec model's first pass, the strong model on the second
# session). Counted from run-log rows, so the count survives a driver restart.
# Only rows that made no progress count: the build phase runs one plan step
# per session by design, so a long build is normal and a stuck one is what
# "hard" is for.
HARD_AFTER="${WAYFINDER_HARD_AFTER:-${HARD_AFTER:-2}}"
MODEL_HARD="${WAYFINDER_MODEL_HARD:-${MODEL_HARD:-$MODEL_STRONG}}"
EFFORT_HARD="${WAYFINDER_EFFORT_HARD:-${EFFORT_HARD:-$EFFORT}}"
sessions_on() {   # $1 ticket → no-progress run-log rows since the phase last advanced
  [ -f "$RUNLOG" ] || { echo 0; return; }
  awk -v t="[#$1](" 'index($0,t){ if (index($0,"no progress")) n++; if ($0 ~ /\| phase [a-z]+ done → [a-z]+ next/) n=0 } END{ print n+0 }' "$RUNLOG"
}
hard_ticket() { [ -n "$MODEL_HARD" ] && [ "${HARD_AFTER:-0}" -gt 0 ] && [ "$(sessions_on "$1")" -ge "$HARD_AFTER" ]; }
model_for() {   # $1 ticket, $2 attempt number (1-based), $3 phase
  [ -n "${WAYFINDER_MODEL:-}" ] && { echo "$WAYFINDER_MODEL"; return; }
  hard_ticket "$1" && { echo "$MODEL_HARD"; return; }
  local labels title attempt="${2:-1}" phase="${3:-}"
  labels="$(gh api "repos/$REPO/issues/$1" --jq '[.labels[].name]|join(",")')"
  title="$(title "$1")"
  if [ -n "$phase" ]; then
    # spec is judgement → strong. build and close are execution from the
    # tables → the exec model, and it *stays* the exec model while the
    # sessions progress (a build runs one step per session by design; a
    # close that commits a fix batch is moving). Escalation is on evidence:
    # the last session on this ticket made no progress → strong; HARD_AFTER
    # of them → MODEL_HARD. Switching models between sessions also throws
    # away the cached base prompt (~20K per switch, per the run-log load
    # column), so a switch has to buy something.
    # measure is plumbing (servers, the round script, the reader agents,
    # raw scores onto the hand-off; the triage is the close session's) →
    # MODEL_MEASURE when set, for its first session only.
    if [ "$phase" = measure ] && [ -n "${MODEL_MEASURE:-}" ] && [ "${PHASE_RUNS[$1:$phase]:-0}" -eq 0 ]; then echo "$MODEL_MEASURE"; return; fi
    if [ "$phase" = spec ] || [ -z "${MODEL_EXEC_FIRST:-}" ] || last_no_progress "$1"; then echo "$MODEL_STRONG"; else echo "$MODEL_EXEC_FIRST"; fi
    return
  fi
  # A continuation (a hand-off file exists from an earlier session) always runs
  # on the strong model: the cheap first pass has had its turn.
  [ -f "$OUT/$1.handoff.md" ] && { echo "$MODEL_STRONG"; return; }
  if [[ "$labels" == *wayfinder:research* ]] || [[ "$title" =~ [Pp]olish|[Bb]ring\ .*\ to\ the\ (autopilot\ )?bar ]]; then
    echo "$MODEL_CHEAP"
  elif [[ "$labels" == *wayfinder:task* ]] && [ -n "${MODEL_EXEC_FIRST:-}" ] && [ "$attempt" = 1 ]; then
    echo "$MODEL_EXEC_FIRST"
  else
    echo "$MODEL_STRONG"
  fi
}

state()  { gh api "repos/$REPO/issues/$1" --jq .state; }
title()  { gh api "repos/$REPO/issues/$1" --jq .title; }

n=0; NEXT_T=""; declare -A DUDS
while [ "$n" -lt "$MAX" ]; do
  if [ -n "$NEXT_T" ]; then
    T="$NEXT_T"; NEXT_T=""
  elif [ -n "$ONLY" ]; then
    [ "$n" -gt 0 ] && break
    T="$ONLY"
  else
    T="$(frontier | head -n1 || true)"
    [ -z "$T" ] && { echo "Frontier empty — map #$MAP has nothing takeable. Done."; break; }
  fi
  n=$((n+1))
  TT="$(title "$T")"
  PHASE="$(phase_of "$T")"
  MODEL="$(model_for "$T" $(( ${ATTEMPTS[$T]:-0} + 1 )) "$PHASE")"
  # Per-phase effort (config: EFFORT_SPEC / EFFORT_BUILD / EFFORT_MEASURE /
  # EFFORT_CLOSE / EFFORT_SINGLE), falling back to EFFORT. Output tokens are
  # under 1% of a session's bill (map #226: 0–5K output against 4–19M in),
  # so thinking is cheap where it saves turns — the judgement phases — and
  # pointless where the work is plumbing.
  SESSION_EFFORT="$EFFORT"; HARD=""
  case "${PHASE:-single}" in
    spec)    SESSION_EFFORT="${EFFORT_SPEC:-$EFFORT}" ;;
    build)   SESSION_EFFORT="${EFFORT_BUILD:-$EFFORT}" ;;
    measure) SESSION_EFFORT="${EFFORT_MEASURE:-$EFFORT}" ;;
    close)   SESSION_EFFORT="${EFFORT_CLOSE:-$EFFORT}" ;;
    *)       SESSION_EFFORT="${EFFORT_SINGLE:-$EFFORT}" ;;
  esac
  if hard_ticket "$T"; then SESSION_EFFORT="$EFFORT_HARD"; HARD=" · hard ($(sessions_on "$T") sessions on this phase)"; fi
  echo "=== [$n/$MAX] #$T — $TT  [${MODEL:-default model}${SESSION_EFFORT:+ · $SESSION_EFFORT}${PHASE:+ · phase: $PHASE}$HARD]"
  if [ "$DRY" = 1 ]; then SKIP[$T]=1; continue; fi

  # Start each session on a clean box: if a dev server or headless browser is
  # still running from before this run (or a previous run), stop it first.
  # The VPS's memwatch alerts under 20% available RAM, and a stale next-server
  # alone can hold 4 GB.
  # Only processes working inside this checkout: the owner's viewing server
  # (a worktree copy on another port, behind a tunnel) is not ours to kill.
  for p in $(pgrep -u "$(id -u)" -f 'next dev|next-server|chrome|chromium|playwright' 2>/dev/null); do
    [ "$p" = "$$" ] && continue
    case "$(readlink "/proc/$p/cwd" 2>/dev/null)/" in "$ROOT/"*) kill -TERM "$p" 2>/dev/null || true ;; esac
  done
  sleep 2
  START=$(TZ=Africa/Johannesburg date +%Y-%m-%dT%H:%M:%S%z); S0=$(date +%s)
  LOG="$LOGS/$(date -u +%Y%m%dT%H%M%SZ)-$T.jsonl"
  set +e
  # Each session gets its own process group (setsid) so everything it spawns —
  # dev server, headless Chromium, node workers, subagents — can be torn down
  # together when the ticket is done, and the next session starts clean.
  # The brief is generic; the run-specific paths (lessons files, report) are
  # appended to a per-run copy, since the CLI takes only one system-prompt file.
  RUN_BRIEF="$LOGS/brief-$T.md"
  MARK0="$(progress_mark "$T")"
  CONT=""; [ -f "$OUT/$T.handoff.md" ] && CONT="**This is a continuation session.** A previous session worked this ticket and did not close it. Read the hand-off file first and continue from the milestone it names; do not restart, re-spec or re-measure what it records as done."
  [ -n "$PHASE" ] && CONT="$CONT

**Hand-off file rule:** when you rewrite the hand-off, keep every \`milestone:\` line already in it and add yours below. The driver reads the phase off those lines; a dropped line re-runs a finished phase."
  case "$PHASE" in
    spec)    CONT="$CONT

**This session's phase: SPEC** (1 of 4) — the phase brief above is the instruction set. Exit line: \`milestone: spec-done\`, commit \`wip(autopilot): #$T spec\`, stop." ;;
    build)   CONT="$CONT

**This session's phase: BUILD** (2 of 4) — one plan step, per the phase brief above. Exit: mark the step \`done\`, commit \`wip(autopilot): #$T build step N\`, stop; after the build gate, \`milestone: build-done\`." ;;
    measure) CONT="$CONT

**This session's phase: MEASURE** (3 of 4) — per the phase brief above. No fixes. Exit line: \`milestone: measured\`, commit \`wip(autopilot): #$T measured\`, stop." ;;
    close)   CONT="$CONT

**This session's phase: CLOSE** (4 of 4) — per the phase brief above. Fix batch → confirm round → checks once → lessons → primer → report → close at the bar, or \`Autopilot: continue —\` with the hand-off updated." ;;
  esac
  PHASE_BRIEF="$AP/phases/${PHASE:-single}.md"
  # PROMPT_MODE=system (config): the /wayfinder skill body goes into the
  # system prompt and the user turn is a plain instruction. A model that is
  # not Claude answers the slash-injected skill with a canned "I don't have
  # the tools" (0/6 engaged on #302, 2026-09-18) but works the same protocol
  # from the system prompt (3/3). Anthropic runs keep the slash form.
  { if [ "${PROMPT_MODE:-slash}" = system ]; then printf '# Wayfinder protocol (the /wayfinder skill, loaded by the driver)\n\n'; awk 'f{print} /^---$/{c++; if(c==2)f=1}' "$ROOT/.claude/skills/wayfinder/SKILL.md"; printf '\n\nARGUMENTS: %s %s\n\n---\n\n' "$MAP" "$T"; fi
    cat "$BRIEF"; [ -f "$PHASE_BRIEF" ] && { printf '\n\n'; cat "$PHASE_BRIEF"; }; printf '\n\n## Paths for this run\n\n- Generic lessons (every project): `%s`\n- Project lessons (this repo): `%s`\n- Report: `%s/%s.md`\n- Hand-off file (keep it current at every milestone): `%s/%s.handoff.md`\n- Scratch folder for captures and the filled preflight: `%s/scratch-%s/`\n\n%s\n' "$GENERIC_LESSONS" "$PROJECT_LESSONS" "$OUT" "$T" "$OUT" "$T" "$LOGS" "$T" "$CONT"; } > "$RUN_BRIEF"
  # Memory: the whole session (claude + dev server + headless browser + node
  # workers) runs inside one cgroup scope with a hard ceiling, so the kernel
  # reclaims/kills inside the scope instead of the box-wide earlyoom shooting
  # the browser mid-capture. Turbopack's memory is native (Rust), so a V8 heap
  # cap alone does not bound next dev — the cgroup does. Falls back to no scope
  # where systemd --user is unavailable.
  MEM_MAX="${WAYFINDER_SESSION_MEM_MAX:-5500M}"; MEM_HIGH="${WAYFINDER_SESSION_MEM_HIGH:-4500M}"
  SCOPE=(); UNIT=""
  if systemd-run --user --scope -q true 2>/dev/null; then
    UNIT="wayfinder-$MAP-$T-$(date +%s).scope"
    SCOPE=(systemd-run --user --scope -q --unit "$UNIT" -p "MemoryMax=$MEM_MAX" -p "MemoryHigh=$MEM_HIGH" -p "MemorySwapMax=2G")
  fi
  # The context guard: the driver writes the session's context size to
  # $CTXF every 30s; at the soft cap it touches $CTXF.signal and the
  # PostToolUse hook (scripts/wayfinder-autopilot/hooks/context-guard.sh,
  # wired in .claude/settings.json) tells the session to hand off. The hard
  # stop is the soft cap plus the hand-off allowance.
  CTXF="$LOGS/ctx-$T"; echo "0 0" > "$CTXF"; rm -f "$CTXF.signal"
  if [ "${PROMPT_MODE:-slash}" = system ]; then
    SESSION_PROMPT="Work Wayfinder map #$MAP, ticket #$T, per the Wayfinder protocol and autopilot brief in your system prompt. Begin by claiming the ticket: run gh issue edit $T --add-assignee @me"
    SESSION_TOOLS="${SESSION_TOOL_SET:-Task,Bash,Edit,Glob,Grep,Read,Skill,WebFetch,WebSearch,Write}"
  else
    SESSION_PROMPT="/wayfinder $MAP $T"; SESSION_TOOLS=""
  fi
  # A session is a chain of legs on one transcript (`--resume`), and the
  # model can change between legs — the transcript carries the plan, not
  # the model. Three kinds of leg after the first:
  #   nudge   — same model, "continue with a tool call": a weaker model ends
  #             a turn narrating its next step instead of making the call,
  #             and a -p session ends on a text-only turn (SESSION_NUDGES,
  #             default 1).
  #   push    — MODEL_UNBLOCK (the strong model) for ONE step: when a leg
  #             ends with the ticket open, no hand-off and no tool call
  #             made, the strong model is resumed into the same session to
  #             do the step that stalled and stop; its reasoning and tool
  #             results stay in the transcript.
  #   return  — the session's own model resumes on top of the push and
  #             carries on. Cascade with hand-back: the strong model is paid
  #             for the hard step only (UNBLOCK_MAX pushes per session,
  #             default 2).
  # The caps below run over the whole chain; every leg is on disk.
  NUDGE_N=0; UNBLOCK_N=0; PUSHING=""; TOOLS_BEFORE=0; RESUME_SID=""; SESSION_PROMPT_CUR="$SESSION_PROMPT"
  BASE_MODEL="$MODEL"; MODEL_CUR="$MODEL"
  PERSIST=""
  CLOSE_RESUMED=""
  if [ "$PHASE" = close ] && [ "$CLOSE_RESUME" = 1 ] && [[ "$MODEL" == *"[1m]"* ]]; then
    PERSIST=""   # keep the close session on disk so the next close session can resume it
    if [ -n "${CLOSE_SID[$T]:-}" ]; then
      RESUME_SID="${CLOSE_SID[$T]}"; CLOSE_RESUMED=1
      SESSION_PROMPT_CUR="Continue the close phase of ticket #$T in this same session: you handed off at the context line; the hand-off file and <scratch>/close.md are current. Pick up at the next step they name — do not re-triage or re-measure."
      echo "    #$T resuming close session $RESUME_SID (CLOSE_RESUME; soft cap ${CLOSE_RESUME_MAX_TOKENS})"
    fi
  fi
  while :; do
  ( cd "$ROOT" && NODE_OPTIONS="${WAYFINDER_NODE_OPTIONS:---max-old-space-size=3072}" \
    WAYFINDER_CTX_FILE="$CTXF" WAYFINDER_HANDOFF_FILE="$OUT/$T.handoff.md" WAYFINDER_TICKET="$T" WAYFINDER_MAP="$MAP" WAYFINDER_PHASE="${PHASE:-single}" \
    WAYFINDER_READ_MAX_LINES="${WAYFINDER_READ_MAX_LINES:-${READ_MAX_LINES:-220}}" WAYFINDER_READ_PNG_MAX="${WAYFINDER_READ_PNG_MAX:-${READ_PNG_MAX:-10}}" \
    PONYTAIL_DEFAULT_MODE="${PONYTAIL_MODE:-full}" PONYTAIL_SUBAGENT_MATCHER="${PONYTAIL_SUBAGENT_MATCHER:-^\$}" \
    WAYFINDER_HANDOFF_ALLOWANCE_K="$(( ${WAYFINDER_HANDOFF_ALLOWANCE:-30000} / 1000 ))" \
    setsid "${SCOPE[@]}" claude -p "$SESSION_PROMPT_CUR" \
      --append-system-prompt-file "$RUN_BRIEF" \
      ${RESUME_SID:+--resume "$RESUME_SID"} \
      ${SESSION_TOOLS:+--tools "$SESSION_TOOLS"} \
      ${MODEL_CUR:+--model "$MODEL_CUR"} \
      ${SESSION_EFFORT:+--effort "$SESSION_EFFORT"} \
      --permission-mode acceptEdits \
      --allowedTools "${ALLOWED_TOOLS[@]}" \
      --disallowedTools AskUserQuestion \
      $PERSIST \
      --strict-mcp-config \
      --setting-sources project,local \
      --output-format stream-json --verbose \
      >> "$LOG" 2>>"$LOG.stderr" ) &
  SESSION_PID=$!
  # Two hard caps per session, enforced here because the model cannot see its
  # own budget in -p mode: wall time (default 3h30) and context size (default
  # 150K tokens, read from the usage block of the latest assistant turn in the
  # stream-json log). On either: commit the tree as WIP so nothing is lost,
  # post a partial hand-off so the driver retries with a fresh context, tear
  # the session down.
  MAX_S="${WAYFINDER_SESSION_MAX_SECONDS:-12600}"
  # Soft cap: the hand-off line (default 150K). Crossing it asks the session
  # to hand off, through the hook. Hard cap: soft + the hand-off allowance
  # (default 30K) — the tokens spent writing the hand-off, committing and
  # posting do not count against the line; only a session that ignores the
  # request is torn down.
  SOFT_CTX="${WAYFINDER_SESSION_MAX_TOKENS:-${SESSION_MAX_TOKENS:-150000}}"
  # Per-phase line (config: SESSION_MAX_TOKENS_SPEC / _BUILD / _MEASURE /
  # _CLOSE / _SINGLE). The spec phase carries ~60K of mandatory loads (the
  # map, four skills, both lessons files, primer, craft floor, pre-flight
  # template) on top of the base load, and a hand-off in the middle of it
  # re-pays most of that: #287's first spec session hit the hard stop at
  # 145K after 27 calls and the second re-read the map, primer, lessons and
  # craft floor before it could continue.
  case "${PHASE:-single}" in
    spec)    SOFT_CTX="${SESSION_MAX_TOKENS_SPEC:-$SOFT_CTX}" ;;
    build)   SOFT_CTX="${SESSION_MAX_TOKENS_BUILD:-$SOFT_CTX}" ;;
    measure) SOFT_CTX="${SESSION_MAX_TOKENS_MEASURE:-$SOFT_CTX}" ;;
    close)   SOFT_CTX="${SESSION_MAX_TOKENS_CLOSE:-$SOFT_CTX}" ;;
    *)       SOFT_CTX="${SESSION_MAX_TOKENS_SINGLE:-$SOFT_CTX}" ;;
  esac
  [ -n "$CLOSE_RESUMED" ] && SOFT_CTX="$CLOSE_RESUME_MAX_TOKENS"
  MAX_CTX=$(( SOFT_CTX + ${WAYFINDER_HANDOFF_ALLOWANCE:-30000} ))
  CAPPED=""; SIGNALLED=""
  context_tokens() {
    python3 - "$1" 2>/dev/null <<'PY'
import json,sys
last=0
for line in open(sys.argv[1]):
    if '"usage"' not in line: continue
    try: d=json.loads(line)
    except: continue
    u=d.get('message',{}).get('usage') if d.get('type')=='assistant' and not d.get('parent_tool_use_id') else None
    if u: last=u.get('input_tokens',0)+u.get('cache_read_input_tokens',0)+u.get('cache_creation_input_tokens',0)
print(last)
PY
  }
  # Polled every 10s, not 30: a skill load or a whole-file read moves the
  # context 8–15K in one call, and #287 went from under the line to past the
  # hard stop inside one 30s poll, with no chance to hand off.
  while kill -0 "$SESSION_PID" 2>/dev/null; do
    sleep "${WAYFINDER_POLL_SECONDS:-10}"
    ELAPSED=$(( $(date +%s) - S0 )); CTX="$(context_tokens "$LOG")"; CTX="${CTX:-0}"
    echo "$CTX $SOFT_CTX" > "$CTXF"
    if [ -z "$SIGNALLED" ] && [ "$CTX" -ge "$SOFT_CTX" ]; then
      SIGNALLED=1; touch "$CTXF.signal"; echo "    #$T crossed the hand-off line (${CTX} tokens ≥ ${SOFT_CTX}) — asked to hand off; hard stop at ${MAX_CTX}"
    fi
    if [ "$ELAPSED" -ge "$MAX_S" ]; then CAPPED="time cap (${MAX_S}s)"; fi
    if [ "$CTX" -ge "$MAX_CTX" ]; then CAPPED="context cap (${CTX} tokens ≥ ${MAX_CTX})"; fi
    if [ -n "$CAPPED" ]; then
      echo "    #$T hit the $CAPPED — saving WIP and handing off"
      wip_handoff "$T" "the session hit its $CAPPED"
      # Stop the session, not ourselves: $SESSION_PID is the launching
      # subshell, which shares this script's process group (a detached run
      # is its own session leader, so -pgid was the runner itself — seen
      # 2026-09-16, #253). The claude process is setsid'd into its own group
      # and, where systemd is available, into its own scope: stop the scope,
      # else the claude process's group.
      if [ -n "$UNIT" ] && systemctl --user is-active -q "$UNIT" 2>/dev/null; then
        systemctl --user stop "$UNIT" 2>/dev/null || true
      else
        cpid="$(pgrep -f "claude -p (/wayfinder $MAP $T |Work Wayfinder map #$MAP, ticket #$T,)" | head -1)"; pgid="$(ps -o pgid= -p "${cpid:-0}" 2>/dev/null | tr -d ' ')"
        if [ -n "$pgid" ] && [ "$pgid" != "$(ps -o pgid= -p $$ | tr -d ' ')" ]; then kill -TERM -- "-$pgid" 2>/dev/null || true; sleep 8; kill -KILL -- "-$pgid" 2>/dev/null || true; fi
      fi
      break
    fi
  done
  wait "$SESSION_PID" 2>/dev/null; RC=$?
  [ -n "$CAPPED" ] && RC=124
  [ "$RC" = 124 ] && break
  [ "$(state "$T")" = "closed" ] && break
  lastc="$(gh api "repos/$REPO/issues/$T/comments" --jq 'last.body // ""' | head -c 40)"
  [[ "$lastc" == "Autopilot: partial"* || "$lastc" == "Autopilot: continue"* || "$lastc" == "Autopilot: blocked"* ]] && break
  # The leg ended on its own with the ticket open and no hand-off.
  RESUME_SID="$(grep -o '"session_id":"[^"]*"' "$LOG" | tail -1 | cut -d'"' -f4)"
  [ -z "$RESUME_SID" ] && break
  TOOLS_NOW="$(grep -c '"type":"tool_use"' "$LOG" 2>/dev/null || echo 0)"; LEG_TOOLS=$(( TOOLS_NOW - ${TOOLS_BEFORE:-0} )); TOOLS_BEFORE="$TOOLS_NOW"
  if [ -n "$PUSHING" ]; then
    # return leg: the strong model did its step; hand the session back
    PUSHING=""; MODEL_CUR="$BASE_MODEL"
    echo "    #$T push done ($LEG_TOOLS tool calls) — returning to ${BASE_MODEL:-default model}"
    SESSION_PROMPT_CUR="A stronger model stepped into this session for the step that stalled; its work and results are in the transcript above (it ended with UNBLOCKED:). Continue ticket #$T from there on your own — every turn a tool call — until the ticket is closed with its resolution comment or handed off with an 'Autopilot: continue —' comment and the hand-off file."
    continue
  fi
  if [ "$LEG_TOOLS" -gt 0 ] && [ "$NUDGE_N" -lt "${SESSION_NUDGES:-1}" ]; then
    NUDGE_N=$((NUDGE_N+1))
    echo "    #$T ended on a text-only turn with the ticket open — nudge $NUDGE_N/${SESSION_NUDGES:-1} (resume $RESUME_SID)"
    SESSION_PROMPT_CUR="You stopped after describing your next step instead of doing it. Continue working ticket #$T now — every turn must contain a tool call until the ticket is closed with its resolution comment, or handed off with an 'Autopilot: continue —' comment and the hand-off file. Do the step you just described."
    continue
  fi
  if [ -n "${MODEL_UNBLOCK:-}" ] && [ "$UNBLOCK_N" -lt "${UNBLOCK_MAX:-2}" ] && [ "$BASE_MODEL" != "$MODEL_UNBLOCK" ]; then
    UNBLOCK_N=$((UNBLOCK_N+1)); PUSHING=1; MODEL_CUR="$MODEL_UNBLOCK"
    echo "    #$T stalled ($LEG_TOOLS tool calls this leg) — push $UNBLOCK_N/${UNBLOCK_MAX:-2} on $MODEL_UNBLOCK (resume $RESUME_SID)"
    SESSION_PROMPT_CUR="You are a stronger model stepping into this session because the previous model stalled on ticket #$T (it ended its turn without a tool call, or declined). Read the last turns of the transcript. Do the ONE step that stalled — the tool-driven action the session needed next, done fully (a read, an edit, a command, a skill call) — and no more. Then end your turn with one line: 'UNBLOCKED: <the next step, in one sentence>'. Do not continue past that step, do not close or hand off the ticket; the session's own model resumes after you."
    continue
  fi
  break
  done
  LOAD="$(load_tokens "$LOG")"; LOAD="${LOAD:-0}"
  echo "    #$T context at exit: $(context_tokens "$LOG") tokens, $(( ( $(date +%s) - S0 ) / 60 )) min; loaded ${LOAD} before the first action"
  if [ "$PHASE" = close ] && [ "$CLOSE_RESUME" = 1 ]; then
    CLOSE_SID[$T]="$(grep -o '"session_id":"[^"]*"' "$LOG" | tail -1 | cut -d'"' -f4)"
  fi
  cleanup_session "$SESSION_PID" "$S0"
  set -e
  DUR=$(( $(date +%s) - S0 ))
  # A dud: the session ended without a single tool call (a weaker model
  # through the proxy answers the first turn with a canned "I don't have the
  # tools" a coin-flip of the time — seen on map #302, 2026-09-18). Four
  # seconds of nothing is not a no-progress session: relaunch the same ticket
  # at once, bounded by WAYFINDER_DUD_RETRIES, without counting it.
  if [ "$RC" != 124 ] && ! grep -q '"type":"tool_use"' "$LOG" 2>/dev/null; then
    DUDS[$T]=$(( ${DUDS[$T]:-0} + 1 ))
    if [ "${DUDS[$T]}" -le "${WAYFINDER_DUD_RETRIES:-6}" ]; then
      echo "--- #$T: dud (no tool call in ${DUR}s) — relaunching, ${DUDS[$T]}/${WAYFINDER_DUD_RETRIES:-6}"
      printf '| %s | [#%s](https://github.com/%s/issues/%s) %s | dud — no tool call, relaunched %s/%s (%s) | %dm%02ds | [log](logs/%s) |\n' \
        "$START" "$T" "$REPO" "$T" "$TT" "${DUDS[$T]}" "${WAYFINDER_DUD_RETRIES:-6}" "${MODEL:-default}" $((DUR/60)) $((DUR%60)) "$(basename "$LOG")" >> "$RUNLOG"
      NEXT_T="$T"; n=$((n-1)); continue
    fi
    echo "    #$T: ${DUDS[$T]} duds in a row — counting this one as a session"
  fi

  ATTEMPTS[$T]=$(( ${ATTEMPTS[$T]:-0} + 1 ))
  [ -n "$PHASE" ] && PHASE_RUNS[$T:$PHASE]=$(( ${PHASE_RUNS[$T:$PHASE]:-0} + 1 ))
  if [ "$(state "$T")" = "closed" ]; then
    OUTCOME=resolved
  elif [ -n "$PHASE" ] && [ "$(phase_of "$T")" != "$PHASE" ]; then
    # The phase's exit milestone is on the hand-off: same ticket, next phase,
    # fresh context. Keep the claim; commit anything the session left.
    ( cd "$ROOT" && "$AP/wip-add.sh" "$PRE_UNTRACKED" && git commit -q -m "wip(autopilot): #$T $PHASE phase done" ) || true
    ATTEMPTS[$T]=0; NEXT_T="$T"
    echo "$(phase_of "$T")" > "$OUT/$T.phase"
    OUTCOME="phase $PHASE done → $(phase_of "$T") next"
  else
    [ -n "$PHASE" ] && NEXT_T="$T"   # a phased ticket is continued next, not re-queued behind the frontier
    # A session that moved the work (new commit or hand-off change) does not
    # count against MAX_ATTEMPTS: the ticket is continued for as long as it
    # keeps progressing. Only consecutive no-progress sessions exhaust it.
    if [ "$(progress_mark "$T")" != "$MARK0" ]; then ATTEMPTS[$T]=1; PROG="progressed"; else PROG="no progress"; fi
    last="$(gh api "repos/$REPO/issues/$T/comments" --jq 'last.body // ""' | head -c 40)"
    if [[ "$last" != "Autopilot: partial"* && "$last" != "Autopilot: continue"* ]] && [ "${ATTEMPTS[$T]}" -lt "$MAX_ATTEMPTS" ]; then
      # Ended on its own with the ticket open and no hand-off: keep the work,
      # post the hand-off ourselves, continue next session.
      echo "    #$T exited (rc=$RC) without closing or handing off — saving WIP, will continue"
      wip_handoff "$T" "the session exited (rc=$RC) without closing or handing off"
      last="Autopilot: continue"
    fi
    if [[ "$last" == "Autopilot: partial"* || "$last" == "Autopilot: continue"* ]] && [ "${ATTEMPTS[$T]}" -lt "$MAX_ATTEMPTS" ]; then
      OUTCOME="continued ($PROG), session ${ATTEMPTS[$T]}/$MAX_ATTEMPTS without progress allowed"
    else
      OUTCOME="not closed (rc=$RC, $PROG) — $MAX_ATTEMPTS sessions without progress, parked"; SKIP[$T]=1; NEXT_T=""
    fi
    # release the claim so the retry (or a human) can take it
    gh issue edit "$T" --repo "$REPO" --remove-assignee "$ME" >/dev/null 2>&1 || true
  fi
  [ -f "$OUT/$T.md" ] || OUTCOME="$OUTCOME, no report"
  if [ "$(state "$T")" != "closed" ] && { [ ! -f "$OUT/$T.handoff.md" ] || [ "$(stat -c %Y "$OUT/$T.handoff.md")" -lt "$S0" ]; }; then OUTCOME="$OUTCOME, hand-off not updated"; fi
  HL=$(wc -l < "$OUT/$T.handoff.md" 2>/dev/null || echo 0); [ "${HL:-0}" -gt "${WAYFINDER_HANDOFF_MAX_LINES:-120}" ] && OUTCOME="$OUTCOME, hand-off $HL lines (limit ${WAYFINDER_HANDOFF_MAX_LINES:-120})"
  # Duration cell also carries the load: tokens on the first turn before any
  # work (brief + skill + CLAUDE.md + hand-off). Compare it across sessions
  # to see what a brief or hand-off change bought.
  printf '| %s | [#%s](https://github.com/%s/issues/%s) %s | %s (%s) | %dm%02ds · load %dK | [log](logs/%s) |\n' \
    "$START" "$T" "$REPO" "$T" "$TT" "$OUTCOME" "${MODEL:-default}" $((DUR/60)) $((DUR%60)) $((LOAD/1000)) "$(basename "$LOG")" >> "$RUNLOG"
  # Cost beside the score, every session: turns × context is the bill.
  python3 "$(dirname "$0")/scoreboard.py" "$MAP" "$ROOT" 2>/dev/null | sed 's/^/    /' || true
  echo "--- #$T: $OUTCOME in ${DUR}s"
done
echo "Run log: $RUNLOG"
