# Per-project autopilot settings for docubite — sourced by run.sh and chart.sh.
# Not part of the tool — remove or change freely.
#
# Model policy (owner, 2026-09-19): Sonnet by default, everywhere. Opus is
# paid for only where it buys something — a push into a stalled session
# (cascade with hand-back: Opus does the one step the weaker model would not,
# Sonnet resumes on top of it), a hard phase, and the spec critic on money /
# approval / schema / auth tickets (phases/spec.md Part D).
MODEL_STRONG="sonnet"       # grilling, spec, decisions; also the escalation after a no-progress session
MODEL_CHEAP="sonnet"        # research tickets and polish passes
MODEL_EXEC_FIRST="sonnet"   # build/close phases while sessions progress
MODEL_MEASURE="haiku"       # measure phase, first session: plumbing only, raw scores, no triage
MODEL_UNBLOCK="opus"        # the push model: one step in a stalled session, then hand back
UNBLOCK_MAX=2               # pushes per session
SESSION_NUDGES=1            # same-model "continue with a tool call" before a push
EFFORT="low"                # every autopilot session, whichever model; independent of ~/.claude/settings.json
# Hard phases: after HARD_AFTER no-progress sessions on one phase, every
# further session on that phase runs on MODEL_HARD at EFFORT_HARD until the
# phase completes.
HARD_AFTER=2
MODEL_HARD="opus"
EFFORT_HARD="low"
# Tokens. Cost per session is turns × context, so shorter sessions with a
# current hand-off are cheaper than long ones: hand-off line at 110K (hard
# stop 30K above it), hand-off file nagged past 80 lines.
SESSION_MAX_TOKENS=110000
export WAYFINDER_HANDOFF_MAX_LINES=80
