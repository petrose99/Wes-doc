#!/bin/bash
# Stop hook. Silent unless the wayfinder driver set WAYFINDER_CTX_FILE for
# this session. A headless session ends the moment the model ends a turn, so
# the driver used to discover *afterwards* that the hand-off was never
# written, the tree was left uncommitted or the servers were left up — and
# the next session paid a full load (~27K) to re-orient. This hook refuses
# the stop, once or twice, with the exact thing still owed:
#   1. tracked changes (or new files the session created) not committed;
#   2. neither the hand-off file nor the report written this session
#      ("this session" = newer than the ctx file, which the driver
#      recreates per session);
#   3. the dev/live servers still up (the driver's pid file, not the port —
#      the owner's own server on :3000 is not the session's to stop).
# After WAYFINDER_STOP_BLOCKS_MAX refusals it lets the session go (the
# driver's WIP/hand-off path takes over), and it never refuses past the hard
# context stop, where the driver is already tearing the session down.
[ -n "${WAYFINDER_CTX_FILE:-}" ] || exit 0
IN="$(cat)"
python3 - "$IN" <<'PY'
import json, os, re, subprocess, sys, time
d = json.loads(sys.argv[1])
ctx = os.environ["WAYFINDER_CTX_FILE"]
hand = os.environ.get("WAYFINDER_HANDOFF_FILE", "")
t = os.environ.get("WAYFINDER_TICKET", "?"); m = os.environ.get("WAYFINDER_MAP", "?")
phase = os.environ.get("WAYFINDER_PHASE", "single")
mx = int(os.environ.get("WAYFINDER_STOP_BLOCKS_MAX", "2"))
cf = ctx + ".stop-blocks"
try: n = int(open(cf).read().strip() or 0)
except Exception: n = 0
if n >= mx: sys.exit(0)
try:
    tok, soft = open(ctx).read().split()[:2]
    if int(tok) >= int(soft) + int(os.environ.get("WAYFINDER_HANDOFF_ALLOWANCE", "30000")): sys.exit(0)
except Exception: pass
def sh(*a):
    try: return subprocess.run(a, capture_output=True, text=True, timeout=20).stdout
    except Exception: return ""
root = sh("git", "rev-parse", "--show-toplevel").strip() or os.getcwd()
def started():
    try: b = int(sh("stat", "-c", "%W", ctx).strip() or 0)
    except Exception: b = 0
    return b
t0 = started()
def touched(p):
    try: return t0 and os.path.getmtime(p) >= t0
    except Exception: return False
owed = []
# 1. uncommitted work
pre = set()
try: pre = set(l.strip() for l in open(os.path.join(os.path.dirname(ctx), f"pre-untracked-{t}.txt")) if l.strip())
except Exception: pass
dirty = []
for row in sh("git", "-C", root, "status", "--porcelain").splitlines():
    st, path = row[:2], row[3:]
    if st == "??" and (path in pre or path.rstrip("/") in pre or re.match(r"^(docs/wayfinder-reports/\d+/logs/|\.scratch)", path)): continue
    dirty.append(path)
if dirty:
    owed.append(f"the tree has uncommitted work ({', '.join(dirty[:5])}{' …' if len(dirty) > 5 else ''}) — commit it: `git add <paths>` then `git commit -m \"wip(autopilot): #{t} <what this session did>\"`")
# 2. hand-off / report
rep = os.path.join(root, "docs", "wayfinder-reports", m, f"{t}.md")
if t0 and hand and not touched(hand) and not touched(rep):
    if phase in ("close", "single"):
        owed.append(f"neither the report ({os.path.relpath(rep, root)}) nor the hand-off ({os.path.relpath(hand, root)}) was written this session — a {phase} session ends with the ticket closed on its report, or with the hand-off updated (exact next step, artefact paths) and an `Autopilot: continue —` comment")
    else:
        owed.append(f"the hand-off ({os.path.relpath(hand, root)}) was not written this session — a {phase} session ends with it updated: keep every existing `milestone:` line, add `milestone: {dict(spec='spec-done', build='build-done', measure='measured').get(phase, '<phase>-done')}` only if the phase is complete, mark the steps done, and put the exact next step at the bottom; then commit it")
# 3. servers
pidf = os.path.join(root, ".impeccable", "live", "dev-server.pid")
try:
    pid = int(open(pidf).read().split()[0]); os.kill(pid, 0)
    owed.append("the dev/live servers are still up — run `node scripts/dev/dev.mjs stop`")
except Exception: pass
if not owed: sys.exit(0)
try: open(cf, "w").write(str(n + 1))
except Exception: pass
left = mx - n - 1
reason = "NOT DONE YET — before this session ends: " + "; ".join(f"({i+1}) {o}" for i, o in enumerate(owed)) + f". Do these with tool calls, then end the turn. ({left} more refusal{'s' if left != 1 else ''} before the driver takes over.)"
print(json.dumps({"decision": "block", "reason": reason}))
PY
