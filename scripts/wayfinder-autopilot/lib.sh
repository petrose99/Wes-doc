#!/bin/bash
# Decision functions of the Wayfinder driver, sourced by run.sh and by lib.test.ts.
# They read the driver's globals (REPO, MAP, OUT, RUNLOG, ROOT, LANE_*, MODEL_*, SKIP,
# PHASE_RUNS …) at call time; run.sh sets those before it calls any of them.

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
    [ "$open_blockers" = "0" ] || continue
    blockers_landed "$n" || { echo "    #$n held: a blocker's PR is not merged yet (LANE_MERGE=review)" >&2; continue; }
    echo "$n"
  done
}
lane_dir()    { echo "$LANES_DIR/$MAP-$1"; }
lane_branch() { echo "wf/$MAP-$1"; }
lane_root() {   # $1 ticket → where this ticket's tree lives (its lane if it has one, else this checkout)
  if [ "$LANE_MODE" = worktree ] && [ -e "$(lane_dir "$1")/.git" ]; then lane_dir "$1"; else echo "$ROOT"; fi
}
handoff_of() { echo "$(lane_root "$1")/docs/wayfinder-reports/$MAP/$1.handoff.md"; }
report_of()  { echo "$(lane_root "$1")/docs/wayfinder-reports/$MAP/$1.md"; }

blockers_landed() {   # $1 ticket → (review mode) no closed blocker still has an open lane PR
  [ "$LANE_MODE" = worktree ] && [ "$LANE_MERGE" = review ] || return 0
  local b
  for b in $(gh api graphql -f query="{ repository(owner:\"${REPO%/*}\",name:\"${REPO#*/}\") { issue(number:$1) { blockedBy(first:50){ nodes{ number } } } } }" --jq '.data.repository.issue.blockedBy.nodes[].number' 2>/dev/null); do
    [ -n "$(gh pr list --repo "$REPO" --head "$(lane_branch "$b")" --state open --json number --jq '.[0].number' 2>/dev/null)" ] && return 1
  done
  return 0
}

# A phase never moves backwards. The hand-off file is rewritten by every
# session and one build session dropped the `milestone: spec-done` line, so
# the driver read "spec" again and re-ran a finished phase (#259, 11:55). The
# driver therefore keeps its own high-water mark in <ticket>.phase and takes
# the later of the two.
phase_rank() { case "$1" in spec) echo 1;; build) echo 2;; measure) echo 3;; close) echo 4;; *) echo 0;; esac; }

phase_of() {   # $1 ticket → "" (single session) | spec | build | close
  local labels; labels="$(gh api "repos/$REPO/issues/$1" --jq '[.labels[].name]|join(",")')"
  [[ "$labels" == *wayfinder:task* ]] && [[ "$(title "$1")" =~ $PHASED_TITLE_RE ]] || { echo ""; return; }
  local h m=spec f=spec; h="$(handoff_of "$1")"
  if [ -f "$h" ] && grep -q '^milestone: measured' "$h"; then m=close
  elif [ -f "$h" ] && grep -q '^milestone: build-done' "$h"; then m=measure
  elif [ -f "$h" ] && grep -q '^milestone: spec-done' "$h"; then m=build; fi
  [ -f "$OUT/$1.phase" ] && f="$(cat "$OUT/$1.phase")"
  if [ "$(phase_rank "$m")" -ge "$(phase_rank "$f")" ]; then echo "$m"; else echo "$f"; fi
}

last_no_progress() {   # $1 ticket → the ticket's last run-log row was a no-progress session
  [ -f "$RUNLOG" ] || return 1
  grep -F "[#$1](" "$RUNLOG" | tail -1 | grep -q "no progress"
}

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
  [ -f "$(handoff_of "$1")" ] && { echo "$MODEL_STRONG"; return; }
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
