# Autopilot on a Mistral key. Same ladder as config.sh — strong / cheap /
# exec-first / measure / hard — with each rung mapped to a Mistral model,
# served through the LiteLLM proxy (.claude/wayfinder-autopilot/mistral/up.sh).
# Selected by scripts/wayfinder-autopilot/run-mistral.sh (WAYFINDER_CONFIG);
# plain run.sh keeps the Anthropic ladder in config.sh.
MODEL_STRONG="mistral/mistral-code-latest"    # was opus[1m]; mistral-medium/small are 429-blocked on this key (tier), code/codestral/ministral are open
MODEL_CHEAP="mistral/codestral-latest"         # was sonnet
MODEL_EXEC_FIRST="mistral/codestral-latest"    # was sonnet
MODEL_MEASURE="mistral/codestral-latest"       # was haiku
EFFORT=""                                      # --effort is Anthropic-only; the proxy drops it, so don't pin it
HARD_AFTER=2
MODEL_HARD="mistral/mistral-code-latest"      # was opus
EFFORT_HARD=""
SESSION_NUDGES=6           # resume a session that ends on a text-only turn ("Next I'll…") with "continue"; see run.sh
PROMPT_MODE="system"       # protocol in the system prompt, plain user turn — Mistral refuses the slash-injected skill (see run.sh)
SESSION_TOOL_SET="Task,Bash,Edit,Glob,Grep,Read,Skill,WebFetch,WebSearch,Write"   # the tools the work uses; the full built-in set (Cron*, Workflow, SendMessage…) confused the model

# The proxy must be up before any claude -p call; start it if it is not.
curl -sf http://127.0.0.1:4000/health/liveliness >/dev/null 2>&1 || "$(dirname "${BASH_SOURCE[0]}")/mistral/up.sh" >&2

# Point claude -p at the proxy and resolve the in-session aliases
# (`model: "opus"|"sonnet"|"haiku"` on Agent calls) to Mistral models.
export ANTHROPIC_BASE_URL="http://127.0.0.1:4000"
export ANTHROPIC_AUTH_TOKEN="sk-local-autopilot"   # LiteLLM master key; the Mistral key lives in mistral/.env
export ANTHROPIC_API_KEY=""
export ANTHROPIC_DEFAULT_OPUS_MODEL="mistral/mistral-code-latest"
export ANTHROPIC_DEFAULT_SONNET_MODEL="mistral/codestral-latest"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="mistral/ministral-14b-latest"
export ANTHROPIC_SMALL_FAST_MODEL="mistral/ministral-14b-latest"
