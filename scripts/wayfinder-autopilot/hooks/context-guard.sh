#!/bin/bash
# PostToolUse hook. Silent unless the wayfinder driver set WAYFINDER_CTX_FILE
# for this session. The driver writes "<context-tokens> <soft-cap>" to that
# file every 30s and touches "<file>.signal" when the soft cap is crossed.
# From then on, every tool call returns one instruction: hand off now. The
# driver's hard stop sits above the soft cap by the hand-off allowance, so
# the tokens spent writing the hand-off never count against the line.
[ -n "${WAYFINDER_CTX_FILE:-}" ] || exit 0
sig="$WAYFINDER_CTX_FILE.signal"
# Hand-off size guard, once per session: the brief says ~80 lines of pointers,
# and #257's grew to 500+ (13K tokens read at the start of every one of its
# twelve sessions). Past HANDOFF_MAX_LINES the session is told to rewrite it
# as pointers into the scratch folder before anything else.
hf="${WAYFINDER_HANDOFF_FILE:-}"; hmax="${WAYFINDER_HANDOFF_MAX_LINES:-120}"
if [ -n "$hf" ] && [ -f "$hf" ] && [ ! -f "$WAYFINDER_CTX_FILE.handoff-nagged" ]; then
  hl=$(wc -l < "$hf")
  if [ "$hl" -gt "$hmax" ]; then
    touch "$WAYFINDER_CTX_FILE.handoff-nagged"
    python3 -c 'import json,sys; print(json.dumps({"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":sys.argv[1]}}))' \
      "HAND-OFF TOO LONG: $hf is $hl lines; the rule is under ~80 (hard limit $hmax). Every session re-reads it whole. Before continuing, rewrite it as pointers: milestone lines, the exact next step, and paths to the spec, pre-flight, captures, scores and triage files in the scratch folder — move narrative and per-session history into those files, do not carry it here."
    exit 0
  fi
fi
[ -f "$sig" ] || exit 0
h="${WAYFINDER_HANDOFF_FILE:-the ticket hand-off file}"
# hand-off already written after the signal: the session is on its way out; stay quiet
if [ -f "$h" ] && [ "$h" -nt "$sig" ]; then exit 0; fi
read -r ctx soft < "$WAYFINDER_CTX_FILE" 2>/dev/null
ctx="${ctx:-0}"; soft="${soft:-150000}"
t="${WAYFINDER_TICKET:-ticket}"; a="${WAYFINDER_HANDOFF_ALLOWANCE_K:-30}"
msg="HAND-OFF NOW. Context is at $((ctx/1000))K, past the $((soft/1000))K hand-off line. Do not start anything new. At the nearest safe point: (1) write $h for a reader with no memory of this session: milestones done (with the milestone: line if a phase is complete), what is built and verified, artefact paths (spec, pre-flight, captures, scores), open findings, the exact next step; (2) commit everything (wip(autopilot): #$t hand-off at the context line); (3) post 'Autopilot: continue - <one line>' on the ticket; (4) end the turn with no further tool calls. The tokens for these steps do not count against the line; the hard stop is ${a}K above it."
python3 -c 'import json,sys; print(json.dumps({"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":sys.argv[1]}}))' "$msg"
