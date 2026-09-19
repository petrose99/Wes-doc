#!/bin/bash
# PreToolUse hook (Read, Skill). Silent unless the wayfinder driver set
# WAYFINDER_CTX_FILE for this session. Denies the tool calls that map #226's
# logs showed cost the most for the least — deterministically, so the brief's
# prose rules do not have to be obeyed to hold:
#   1. Read of a long file with no offset/limit (65 of 94 Reads on #286; the
#      36 KB spec read whole six times, a 45 KB component twice).
#   2. Read of a persisted "Output too large" tool-result file whole — the
#      output was too big once already; grep/tail it instead.
#   3. More than WAYFINDER_READ_PNG_MAX images in one session (a PNG is
#      ~1.5K tokens that every later turn re-reads; the brief's cap is eight
#      per round).
#   4. The `intent` router on a continuation session (43 KB ≈ 11K tokens;
#      loaded on six consecutive build sessions of #286 after the spec had
#      already named `specify`). The named skill is called directly.
#   5. `impeccable shape` after spec-done — the pre-build sub-command; the
#      later phases use polish/critique/audit, which stay allowed.
[ -n "${WAYFINDER_CTX_FILE:-}" ] || exit 0
IN="$(cat)"
python3 - "$IN" <<'PY'
import json, os, sys, subprocess
d = json.loads(sys.argv[1]); tool = d.get("tool_name"); inp = d.get("tool_input") or {}
ctx = os.environ.get("WAYFINDER_CTX_FILE", "")
hand = os.environ.get("WAYFINDER_HANDOFF_FILE", "")
cont = bool(hand and os.path.exists(hand))
def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
          "permissionDecision": "deny", "permissionDecisionReason": reason}})); sys.exit(0)
if tool == "Read":
    p = inp.get("file_path", ""); ranged = "limit" in inp or "offset" in inp
    if p.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        cf = ctx + ".png-count"; n = 0
        try: n = int(open(cf).read().strip() or 0)
        except Exception: pass
        n += 1
        try: open(cf, "w").write(str(n))
        except Exception: pass
        mx = int(os.environ.get("WAYFINDER_READ_PNG_MAX", "10"))
        if n > mx: deny(f"IMAGE BUDGET: this session has opened {n-1} images (cap {mx}); each stays in context for every later turn. Read the gate summary / detector JSON / keyboard.json for this state instead, or hand the check to a fresh `Agent`.")
        sys.exit(0)
    if "/tool-results/" in p and not ranged:
        deny("PERSISTED OUTPUT: that file is a tool result the harness already judged too large for context. Do not read it whole — `grep -n <pattern> <file>` or `tail -n 40 <file>`, then Read a range (offset/limit) if you still need one.")
    if not ranged:
        try: lines = int(subprocess.run(["wc", "-l", p], capture_output=True, text=True).stdout.split()[0])
        except Exception: lines = 0
        mx = int(os.environ.get("WAYFINDER_READ_MAX_LINES", "220"))
        if lines > mx:
            deny(f"READ BY RANGE: {os.path.basename(p)} is {lines} lines. Whole-file reads are the largest avoidable cost in these sessions (each is re-read on every later turn). Run `grep -n <symbol|heading> {p}` first, then Read with offset+limit for just the lines you need (or `sed -n a,bp`). Files under {mx} lines may be read whole.")
    sys.exit(0)
if tool == "Skill":
    s = (inp.get("skill") or "").strip(); a = (inp.get("args") or "").strip()
    if cont and s in ("intent", "intent:intent"):
        deny("CONTINUATION: the `intent` router already ran at spec (11K tokens per load). Call the named Intent skill directly — `specify`, `fortify`, `articulate`, `include`, `evaluate`, `journey`, `organize` — the one the hand-off or Action Summary names.")
    if cont and s == "impeccable" and (a == "" or a.split()[0].lower() == "shape"):
        try: done = "milestone: spec-done" in open(hand).read()
        except Exception: done = False
        if done: deny("CONTINUATION: `impeccable shape` is the pre-build sub-command and the spec phase already ran it. Read `craft-floor.md` by range and call the sub-command this phase needs — `impeccable polish`, `critique`, `audit`, `clarify`, `adapt` — with that name as the argument.")
sys.exit(0)
PY
