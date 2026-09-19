# Token usage Resources

## Knowledge

- [Docs: Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)
  Primary source on how the cache works: prefix matching, cache write vs read, the 5-minute and 1-hour lifetimes, what invalidates a cache. Use for: anything about `cache_creation_input_tokens` and `cache_read_input_tokens`.
- [Docs: Pricing](https://docs.claude.com/en/docs/about-claude/pricing)
  The per-model rates for input, output, cache write and cache read. Use for: turning a session's counters into money. Read it fresh each time; rates change.
- [Docs: Context windows](https://docs.claude.com/en/docs/build-with-claude/context-windows)
  Why every turn re-sends the whole conversation and what fills the window. Use for: the "turns × context" model.
- [Docs: Manage costs effectively (Claude Code)](https://docs.claude.com/en/docs/claude-code/costs)
  Claude Code's own guidance on what drives cost in a session. Use for: harness-level levers (compaction, tool output, `/cost`).
- [Docs: Monitoring usage (Claude Code)](https://docs.claude.com/en/docs/claude-code/monitoring-usage)
  How to observe usage from the CLI and telemetry. Use for: checking a live session rather than a log after the fact.
- Local: `docs/wayfinder-reports/226/logs/*.jsonl` and `run-log.md`
  This repo's own sessions, one JSON line per event with a `usage` block on each assistant turn. Use for: every exercise; the numbers are yours.
- Local: `scripts/wayfinder-autopilot/scoreboard.py`
  Turns × context per session, beside the quality scores. Use for: seeing cost and quality on one line.

## Wisdom (Communities)

- [Anthropic Discord](https://discord.gg/anthropic) — the `#claude-code` channel.
  Other people running long agentic sessions compare cost tactics here. Use for: sanity-checking a lever before building it.
- [github.com/anthropics/claude-code/issues](https://github.com/anthropics/claude-code/issues)
  Where harness behaviour (what loads into the system prompt, hook semantics) is discussed with the maintainers. Use for: questions the docs do not answer.

## Gaps

- No authoritative breakdown of what Claude Code's default system prompt and tool schemas cost per model; this workspace measures it empirically (see reference/billing-cheatsheet.html).
