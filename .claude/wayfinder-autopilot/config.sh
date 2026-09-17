# Per-project autopilot settings for docubite (map #226 run, Sep 2026).
# Not part of the tool — remove or change freely.
MODEL_STRONG="opus[1m]"   # grilling and execution tickets
MODEL_CHEAP="sonnet"      # research tickets and polish passes
MODEL_EXEC_FIRST="sonnet"  # execution tickets: first attempt on Sonnet; a "partial" retry escalates to MODEL_STRONG
MODEL_MEASURE="haiku"      # measure phase, first session: servers, round script, reader agents, raw scores — no triage (owner, 2026-09-17); a second measure session runs on MODEL_STRONG
EFFORT="low"               # every autopilot session, whichever model; independent of ~/.claude/settings.json
# Hard phases: after HARD_AFTER sessions on one phase without it completing,
# every further session on that phase runs on MODEL_HARD at EFFORT_HARD (the
# Sonnet first pass is skipped). Once the phase completes, routing reverts to
# the normal ladder — Sonnet first on the next phase. Owner's call, 2026-09-16.
HARD_AFTER=2
MODEL_HARD="opus"          # Opus 5, standard window; sessions hand off at 150K so the [1m] window is unused
EFFORT_HARD="low"
