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
# Closing-bar gate. #327 and #328 closed with `close-critique=n/a` and no
# detector run: a single-session task that changed rendered files treated
# the bar as optional. A `gh issue close` of this session's ticket is refused
# while the ticket has touched app/ or components/ (.tsx/.css, in commits
# mentioning the ticket) and the report's `scores:` line
# does not carry integer close-critique >= 30 and close-evaluate >= 80.
def closing_bar(c):
    t = os.environ.get("WAYFINDER_TICKET", ""); m = os.environ.get("WAYFINDER_MAP", "")
    if not t or not re.search(r"\bgh\s+issue\s+close\b", c) or not re.search(rf"(?<![\d/])#?{t}(?!\d)", c): return
    def sh(*a):
        try: return subprocess.run(a, capture_output=True, text=True).stdout
        except Exception: return ""
    root = sh("git", "rev-parse", "--show-toplevel").strip()
    # only this ticket's own commits count: a range or the working tree would
    # pick up the other tickets interleaved on the branch
    # a ticket's commit names it in the subject as the thing being worked
    # (`wip(autopilot): #T …`, `fix(#T): …`, `… for #T`), not as a
    # reference in the body ("execution of #288" on #328's commits)
    files = set()
    for row in sh("git", "log", "--format=%H %s", f"--grep=#{t}\\b", "-E").splitlines():
        sha, _, subj = row.partition(" ")
        if not re.search(rf"(?<![\d/])#{t}(?!\d)", subj) or re.search(rf"\b(of|from|per|via|to|by)\s+#{t}(?!\d)", subj): continue
        if re.search(rf"#{t}\s+(filed|opened|spawned|created)", subj): continue
        files |= set(sh("git", "diff-tree", "--no-commit-id", "--name-only", "-r", sha).split())
    ui = sorted(f for f in files if re.match(r"^(app|components)/.*\.(tsx|css)$", f))
    code = sorted(f for f in files if re.match(r"^(app|components|lib|models|worker|ai)/.*\.(ts|tsx)$", f))
    # Type-check gate: every close since 2026-09-19 wrote "20 pre-existing tsc
    # errors, out of scope" — true per ticket, and the baseline stayed red for
    # a day. A ticket whose commits touched TypeScript closes only on a clean
    # `tsc --noEmit` (~40s; the hook's timeout allows it).
    if code:
        r = subprocess.run(["npx", "tsc", "--noEmit", "--pretty", "false"], capture_output=True, text=True, cwd=root)
        if r.returncode != 0:
            errs = [l for l in r.stdout.splitlines() if "error TS" in l]
            deny(f"TYPE-CHECK: `tsc --noEmit` reports {len(errs)} error(s); ticket #{t} touched TypeScript ({', '.join(code[:4])}{' …' if len(code) > 4 else ''}) and closes only on a clean tree — even errors another ticket left: fix them or hand off with the list. First errors:\n" + "\n".join(errs[:8]))
    # Infra gate (lanes, 2026-09-21): #361 widened `turbopack.root` in
    # next.config.ts to get round a lane defect and would have landed it. A
    # ticket closes only while the project's infra files match the integration
    # branch the driver started on — a change there is a ticket of its own.
    base = os.environ.get("WAYFINDER_BASE_BRANCH", "")
    if base:
        infra = [f for f in sh("git", "diff", "--name-only", base, "--", "next.config.ts", "tsconfig.json", "package.json", "package-lock.json", "prisma/schema.prisma", ".claude/settings.json").split()
                 if not re.search(r"\b(schema|migration|dependency|package|config)\b", os.environ.get("WAYFINDER_TICKET_TITLE", ""), re.I)]
        if infra:
            deny(f"INFRA GATE: ticket #{t} leaves {', '.join(infra)} different from `{base}`. Those files change only on a ticket about them; a workaround for the lane (a symlinked node_modules, a dev-server quirk) is a driver bug — report it in the resolution comment, restore the file (`git checkout {base} -- {' '.join(infra)}`, commit), then close.")
    if not ui: return
    rep = os.path.join(root, "docs", "wayfinder-reports", m, f"{t}.md")
    line = ""
    try: line = next((l for l in open(rep) if l.startswith("scores:")), "")
    except Exception: pass
    kv = dict(re.findall(r"(\S+)=(\S*)", line))
    def num(k):
        try: return int(kv.get(k, ""))
        except Exception: return None
    cc, ce = num("close-critique"), num("close-evaluate")
    ok = cc is not None and ce is not None and cc >= 30 and ce >= 80
    if ok: return
    deny(f"CLOSING BAR: ticket #{t} changed rendered files ({', '.join(ui[:5])}{' …' if len(ui) > 5 else ''}), so it closes only at the bar: the report {rep} needs a `scores:` line with integer close-critique >= 30 (every heuristic >= 3) and close-evaluate >= 80, produced by the critique/evaluate readers on a capture round with the in-page detector cleared. Found: {line.strip() or 'no scores: line'}. Run phases/measure.md then close.md (a small ticket does both in this session), write the line, then close — or hand off with `Autopilot: continue —`.")
if tool == "Bash":
    c = inp.get("command", "")
    # A background command plus "I'll wait for the notification" ends a
    # headless session (#266 session 26 lost a capture round this way; #253
    # before it). Run it in the foreground with a timeout instead.
    if inp.get("run_in_background"):
        deny("NO BACKGROUND COMMANDS: a headless session ends the moment a turn has no tool call, and everything it started dies with it. Run this in the foreground (`timeout` up to 600000 ms) and read its result in the same turn; a long capture round is one foreground call, not a wait.")
    if is_router(c): deny(ROUTER)
    # A capture round without a long tool timeout gets backgrounded by the
    # harness at 2 min, and the session then polls the task file turn after
    # turn (#270 G2 r1: sleep/echo/while-ps loops at 40K a turn).
    if re.search(r"\bnode\s+\S*(round-\d+\.mjs|capture-round\.mjs)\b", c) and int(inp.get("timeout") or 0) < 300000:
        deny("CAPTURE ROUND: pass the Bash tool's `timeout` parameter (600000) on this call so the round runs as one foreground call and returns its output in the same turn. Without it the harness backgrounds the run at 2 minutes and every turn spent polling the task file is wasted.")
    if re.search(r"(npm run dev|next dev|pnpm dev|yarn dev)\b", c) or re.search(r"\b(nohup|setsid|disown)\b", c) or re.search(r"&\s*$", c.strip()):
        deny("DEV SERVER: start and stop it only through the area primer's recipe — `node .impeccable/live/dev.mjs start|stop|status` (heap-capped, pid-filed) and `node .impeccable/live/livesrv257.mjs` for the in-page detector (kill its pid at the end). `npm run dev`, nohup, setsid, disown and trailing `&` all die with the turn or hang it.")
    closing_bar(c)
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
