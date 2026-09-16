# Per-project autopilot settings for docubite (map #226 run, Sep 2026).
# Not part of the tool — remove or change freely.
MODEL_STRONG="opus[1m]"   # grilling and execution tickets
MODEL_CHEAP="sonnet"      # research tickets and polish passes
MODEL_EXEC_FIRST="sonnet"  # execution tickets: first attempt on Sonnet; a "partial" retry escalates to MODEL_STRONG
EFFORT="low"               # every autopilot session, whichever model; independent of ~/.claude/settings.json
