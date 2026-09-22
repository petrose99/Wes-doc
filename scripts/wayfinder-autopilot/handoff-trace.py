#!/usr/bin/env python3
"""Append a `## Driver trace` to a ticket's hand-off when the session that just
ended did not update it (cap hit mid-investigation, plain exit, crash).

    handoff-trace.py <session.jsonl> <handoff.md> <worktree> <session-start-epoch> <reason>

#266: two sessions (one of them 32M tokens) ended "hand-off not updated"; the
next session started from the previous milestone and redid the work. The
trace is what the agent would have written: commits this session made, the
last tool calls, the last thing it said. It replaces any earlier trace
(state, not a log) and stays inside the hand-off line limit.
"""
import json, os, re, subprocess, sys, time

log, hand, wt, s0, reason = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
MAX = int(os.environ.get("WAYFINDER_HANDOFF_MAX_LINES", "120"))
N_CALLS = 12

def sh(*a):
    try: return subprocess.run(a, capture_output=True, text=True, cwd=wt).stdout
    except Exception: return ""

commits = [l for l in sh("git", "log", "--format=%h %s", f"--since=@{s0}").splitlines() if l]
dirty = [l for l in sh("git", "status", "--short").splitlines() if l]

calls, last_text = [], ""
try:
    for line in open(log):
        try: d = json.loads(line)
        except Exception: continue
        if d.get("type") != "assistant" or d.get("parent_tool_use_id"): continue
        for b in d.get("message", {}).get("content", []):
            if b.get("type") == "tool_use":
                i = b.get("input") or {}
                arg = i.get("command") or i.get("file_path") or i.get("skill") or i.get("prompt") or json.dumps(i)
                arg = re.sub(r"\s+", " ", str(arg)).strip()
                calls.append(f"{b['name']}: {arg[:110]}")
            elif b.get("type") == "text" and b.get("text", "").strip():
                last_text = b["text"].strip()
except FileNotFoundError:
    pass

stamp = time.strftime("%Y-%m-%d %H:%M %Z")
out = [f"## Driver trace ({stamp})", "",
       f"The previous session ended without updating this file: {reason}. What it did, from its log:", ""]
out.append(f"- Commits this session ({len(commits)}, newest first):" if commits else "- Commits this session: none")
for c in commits[:8]: out.append(f"  - `{c[:100]}`")
out.append("- Uncommitted at exit: " + (", ".join(l.strip() for l in dirty[:8]) + (" …" if len(dirty) > 8 else "") if dirty else "clean (the driver commits WIP)"))
out.append(f"- Last {min(N_CALLS, len(calls))} tool calls of {len(calls)}:")
for c in calls[-N_CALLS:]: out.append(f"  - {c}")
if last_text:
    t = re.sub(r"\s+", " ", last_text)
    out.append(f"- Last thing it said: {t[:400]}{'…' if len(t) > 400 else ''}")
out.append("- Start from here, not from the milestone above; delete this section when you rewrite the hand-off.")

body = ""
try: body = open(hand).read()
except FileNotFoundError: body = f"# Hand-off\n\nmilestone: (none — first session left no hand-off)\n"
body = re.sub(r"\n## Driver trace \([^\n]*\)\n.*?(?=\n## |\Z)", "", body, flags=re.S).rstrip("\n")
trace = "\n".join(out)
room = MAX - (body.count("\n") + 2)
if room < len(out):  # keep the header lines and the tail of the trace
    keep = max(6, room)
    out = out[:5] + out[-(keep - 5):] if keep < len(out) else out
    trace = "\n".join(out)
open(hand, "w").write(body + "\n\n" + trace + "\n")
print(f"driver trace: {len(commits)} commits, {len(calls)} calls → {hand}")
