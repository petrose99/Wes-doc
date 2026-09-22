# Mission: Token usage in Claude Code sessions

## Why
You run an unattended Claude Code autopilot (Bite) that ships DocuBite tickets, and its bill is decided by how tokens are counted, cached and re-sent. You want to read a session's numbers yourself and know which lever to pull, without lowering the quality bar.

## Success looks like
- Read one session's `stream-json` log and say what it cost and why, from the four usage counters.
- Predict, before a change, whether it cuts the bill (turns, context, cache) or only moves cost around.
- Spot a wasteful session in the run log within a minute (load, turns, whole-file reads, router loads).
- Explain to someone else why "cache read" is still a charge.

## Constraints
- Learn in short bursts between autopilot runs; lessons must be completable in under ten minutes.
- Ground everything in this repo's real logs under `docs/wayfinder-reports/226/logs/`, not toy examples.
- Numbers about prices come from the Anthropic pricing page at the time of reading, never from memory.

## Out of scope
- Model training, tokenizer internals.
- Anthropic account billing mechanics (invoices, credits).
- Optimising interactive (non-autopilot) sessions, unless the same lever applies.

*Assumed from the working session on 2026-09-19; tell the teacher if any line is wrong.*
