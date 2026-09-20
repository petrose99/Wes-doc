#!/bin/bash
# PreToolUse hook (Read, Skill, Bash). Silent unless the wayfinder driver set
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
#   4. The `intent` router — as a Skill call, a Read, or a Bash cat (15K
#      tokens on #287: 102K → 117K in one call) — the phase brief is the
#      router and names the skills. Same for impeccable's routing menu.
#   5. `impeccable shape` after spec-done — the pre-build sub-command; the
#      later phases use polish/critique/audit, which stay allowed.
[ -n "${WAYFINDER_CTX_FILE:-}" ] || exit 0
IN="$(cat)"
python3 - "$IN" <<'PY'
import json, os, re, sys, subprocess
d = json.loads(sys.argv[1]); tool = d.get("tool_name"); inp = d.get("tool_input") or {}
ctx = os.environ.get("WAYFINDER_CTX_FILE", "")
hand = os.environ.get("WAYFINDER_HANDOFF_FILE", "")
cont = bool(hand and os.path.exists(hand))
def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
          "permissionDecision": "deny", "permissionDecisionReason": reason}})); sys.exit(0)
ROUTER = "AUTOPILOT: the `intent` router is not loaded here — the phase brief is the router (15K tokens per load, paid on every later turn). Read the named skill's file instead (the *Skill files* list in the system prompt): specify, fortify, articulate, include for a spec; evaluate, journey, organize, strategize where the brief names them. Project context comes from CONTEXT.md and the map's Notes."
MENU = "AUTOPILOT: impeccable's routing menu is not needed — the phase brief names the sub-command; read its reference file directly (reference/shape.md, layout.md, typeset.md, clarify.md at spec; polish.md, critique.md, audit.md, adapt.md at close)."
def is_router(p): return "skills/intent/SKILL.md" in p or "skills/intent/intent/SKILL.md" in p
def spec_done():
    try: return "milestone: spec-done" in open(hand).read()
    except Exception: return False
# Hand-off size gate. The brief promised "the hook refuses 120" but the old
# guard only nagged once per session and the nag was ignored: on #297 the
# file grew to 247 lines, re-read whole by every later session. Now a commit
# (and a Write/Edit of the file itself) is refused while the hand-off is over
# WAYFINDER_HANDOFF_MAX_LINES, so the session must rewrite it as state first.
def handoff_lines(text=None):
    try: return (text if text is not None else open(hand).read()).count("\n") + 1
    except Exception: return 0
hmax = int(os.environ.get("WAYFINDER_HANDOFF_MAX_LINES", "80"))
def too_long(n): return f"HAND-OFF TOO LONG: {hand} would be {n} lines (limit {hmax}). It is a state file, not a log: keep the `milestone:` lines, the `step:` plan (a done step is one line, no notes under it), an Artifacts list of paths, Open findings as a pointer to <scratch>/close.md, and the exact next step. Delete every '(this session)' / '## G2 notes' narrative; move anything worth keeping into a file in the scratch folder and link it. Then retry."
if tool == "Bash":
    c = inp.get("command", "")
    if is_router(c): deny(ROUTER)
    if hand and re.search(r"\bgit\b[^|;&]*\bcommit\b", c):
        n = handoff_lines()
        if n > hmax: deny(too_long(n))
    if "impeccable/reference/routing.md" in c: deny(MENU)
    if cont and "impeccable/reference/shape.md" in c and spec_done():
        deny("CONTINUATION: `impeccable shape` is the pre-build sub-command and the spec phase already ran it. Read craft-floor.md by range and the sub-command this phase needs (polish, critique, audit, clarify, adapt).")
    sys.exit(0)
if tool == "Read":
    p = inp.get("file_path", ""); ranged = "limit" in inp or "offset" in inp
    if is_router(p): deny(ROUTER)
    if "impeccable/reference/routing.md" in p: deny(MENU)
    if cont and "impeccable/reference/shape.md" in p and spec_done():
        deny("CONTINUATION: `impeccable shape` is the pre-build sub-command and the spec phase already ran it. Read craft-floor.md by range and the sub-command this phase needs (polish, critique, audit, clarify, adapt).")
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
if tool in ("Write", "Edit") and hand and os.path.abspath(inp.get("file_path", "")) == os.path.abspath(hand):
    if tool == "Write": n = handoff_lines(inp.get("content", ""))
    else:
        try:
            cur = open(hand).read(); o = inp.get("old_string", ""); r = inp.get("new_string", "")
            n = handoff_lines(cur.replace(o, r) if inp.get("replace_all") else cur.replace(o, r, 1))
        except Exception: n = 0
    if n > hmax: deny(too_long(n))
    sys.exit(0)
if tool == "Skill":
    s = (inp.get("skill") or "").strip(); a = (inp.get("args") or "").strip()
    if s in ("intent", "intent:intent"): deny(ROUTER)
    if s == "impeccable" and a == "": deny(MENU)
    if cont and s == "impeccable" and a.split()[0].lower() == "shape" and spec_done():
        deny("CONTINUATION: `impeccable shape` is the pre-build sub-command and the spec phase already ran it. Read `craft-floor.md` by range and call the sub-command this phase needs — `impeccable polish`, `critique`, `audit`, `clarify`, `adapt` — with that name as the argument.")
sys.exit(0)
PY
