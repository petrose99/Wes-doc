# Per-project autopilot settings for docubite (map #226 run, Sep 2026).
# Not part of the tool — remove or change freely.
MODEL_STRONG="opus[1m]"   # grilling and execution tickets
MODEL_CHEAP="sonnet"      # research tickets and polish passes
MODEL_EXEC_FIRST="sonnet"  # execution tickets: first attempt on Sonnet; a "partial" retry escalates to MODEL_STRONG
EFFORT="low"               # every autopilot session, whichever model; independent of ~/.claude/settings.json
# Hard tickets: after HARD_AFTER sessions on one ticket (run-log rows), every
# further session runs on MODEL_HARD at EFFORT_HARD regardless of phase or
# attempt — the cheap Sonnet first pass is skipped. Owner's call, 2026-09-16.
HARD_AFTER=3
MODEL_HARD="opus"          # Opus 5, standard window; sessions hand off at 150K so the [1m] window is unused
EFFORT_HARD="low"
