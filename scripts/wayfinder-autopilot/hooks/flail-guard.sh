#!/bin/bash
# Circuit breaker for one session: the same failure over and over (hook
# events PostToolUseFailure, PostToolUse, PreToolUse on Bash). Silent unless
# the driver set WAYFINDER_CTX_FILE. The other guards refuse the dead ends
# someone has already met (npm run dev, livesrv scripts); this one catches the
# next one. #266's 26M and 32M sessions were a run of calls failing one way —
# live-server down, detector 404 on every state — with the commands varied
# around it. After loop-context's breaker (github.com/cobusgreyling/loop-engineering).
#   PostToolUseFailure: the error is reduced to a signature (its error lines,
#     numbers/hashes/tmp paths blanked; a short one is keyed by the command's
#     first word too, an Edit/Write failure by its file) and counted in
#     <ctx>.flail, which the driver deletes per session. At WAYFINDER_FLAIL_MAX
#     (3) the session is told to stop retrying and diagnose; at twice that, to
#     hand off with the blocker.
#   PreToolUse (Bash): the exact command that tripped is refused while
#     nothing else has succeeded since — re-running it cannot change the
#     outcome. Any other successful call (PostToolUse) unlocks it.
[ -n "${WAYFINDER_CTX_FILE:-}" ] || exit 0
IN="$(cat)"
# the success and pre-call paths only matter once something has tripped
case "$IN" in *'"PostToolUseFailure"'*) ;; *) [ -f "$WAYFINDER_CTX_FILE.flail" ] || exit 0 ;; esac
python3 - "$IN" <<'PY'
import hashlib, json, os, re, sys
d = json.loads(sys.argv[1]); ev = d.get("hook_event_name", ""); tool = d.get("tool_name", ""); inp = d.get("tool_input") or {}
path = os.environ["WAYFINDER_CTX_FILE"] + ".flail"
mx = int(os.environ.get("WAYFINDER_FLAIL_MAX", "3"))
try: st = json.load(open(path))
except Exception: st = {"counts": {}, "tripped": {}}
cmd = " ".join(inp.get("command", "").split())
def save():
    try: json.dump(st, open(path, "w"))
    except Exception: pass
def out(event, **kw):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": event, **kw}})); sys.exit(0)
SIGNAL = re.compile(r"error|fail|cannot|can't|couldn't|refused|not found|no such|denied|timed? ?out|econn|enoent|eaddrinuse|exception|traceback|fatal|unable|invalid|missing|\b[45]\d\d\b", re.I)
def norm(s):
    s = re.sub(r"/tmp/\S+", "<tmp>", s.lower())
    s = re.sub(r"\b[0-9a-f]{7,}\b", "<hex>", s)
    return " ".join(re.sub(r"\d+", "<n>", s).split())
def signature(err):
    lines = [l for l in err.splitlines() if l.strip() and not re.match(r"^exit code \d+$", l.strip(), re.I)]
    if not lines: return None, ""   # a bare exit code is a predicate's "no" (grep, test, diff), not an error
    key = [l for l in lines if SIGNAL.search(l)][:3] or lines[-3:]
    text = norm("\n".join(key))
    if tool != "Bash": text = f"{tool} {inp.get('file_path', '')} {text}"
    elif len(text) < 24: text = f"{(cmd.split() or [''])[0]} {text}"
    return hashlib.sha1(text.encode()).hexdigest()[:12], (key[0] if key else err.strip())[:160]
if ev == "PostToolUseFailure":
    if d.get("is_interrupt"): sys.exit(0)
    sig, line = signature(d.get("error", ""))
    if not sig: sys.exit(0)
    n = st["counts"].get(sig, 0) + 1; st["counts"][sig] = n
    if n < mx: save(); sys.exit(0)
    if tool == "Bash" and cmd: st["tripped"][cmd] = sig
    save()
    if n >= 2 * mx:
        out(ev, additionalContext=f"SAME FAILURE {n}× — HAND OFF: `{line}` has now failed {n} times this session. Stop working this step. Write the blocker into the hand-off (the error, the commands tried, what you ruled out), commit, post `Autopilot: continue — blocked: <one line>` on the ticket, and end the session. A fresh session with the blocker written down is cheaper than more tries here.")
    out(ev, additionalContext=f"SAME FAILURE {n}×: `{line}` — the same error, whatever the command. Stop retrying variations. Read the error as a precondition that is false (server down? `node scripts/dev/dev.mjs status`; missing seed or env? wrong path or cwd? stale build?), check that precondition directly, and fix it before running anything that depends on it. Polling for a file a background Agent will write is this too (#430, #458): run the Agent in the foreground, where its result comes back in the same turn. Re-running the identical command with nothing changed is refused.")
if ev == "PostToolUse":
    if st["tripped"] and not (tool == "Bash" and cmd in st["tripped"]):
        st["tripped"] = {}; save()
    sys.exit(0)
if ev == "PreToolUse" and tool == "Bash" and cmd in st["tripped"]:
    out(ev, permissionDecision="deny", permissionDecisionReason=f"SAME FAILURE: `{cmd[:120]}` failed the same way {st['counts'].get(st['tripped'][cmd], mx)} times and nothing has succeeded since, so a re-run cannot change the result. Change the precondition first (start the server, fix the file, seed the data), then run it again.")
PY
