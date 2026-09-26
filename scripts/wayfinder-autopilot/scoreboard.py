#!/usr/bin/env python3
"""Scoreboard for one map: per session, the scores (from the report's
`scores:` line) beside the cost (from the stream-json log). No model runs
here; the driver calls it after every session. The first-pass score is the
KPI — the close is always reached by a fix batch and says nothing about
whether the pre-build is getting better. Cost is turns × context: every turn
re-reads the whole context, so a long session is quadratic.

usage: scoreboard.py <map> [repo-root]   → writes docs/wayfinder-reports/<map>/scoreboard.md
"""
import glob, json, os, re, subprocess, sys
MAP = sys.argv[1]; ROOT = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
OUT = os.path.join(ROOT, "docs/wayfinder-reports", MAP)

def cost(path):
    # stream-json writes one `assistant` line per content block, each repeating its message's
    # stream-start usage — so a turn is a message id, not a line, and its output_tokens is a
    # stub (8–16). The real output is only in each leg's `result` event: a session with none
    # (stopped, or still running) reports None rather than a stub-sum that reads as ~0K.
    imgs = agents = tools = 0; ctx = 0; seen = set(); result_out = 0; results = 0
    for ln in open(path, errors="replace"):
        if '"type":"assistant"' not in ln and '"type": "assistant"' not in ln and '"type":"result"' not in ln: continue
        try: j = json.loads(ln)
        except Exception: continue
        if j.get("type") == "result":
            results += 1; result_out += (j.get("usage") or {}).get("output_tokens", 0); continue
        if j.get("type") != "assistant": continue
        mid = j["message"].get("id") or id(j); u = j["message"].get("usage", {})
        if mid not in seen:
            seen.add(mid)
            ctx += u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
        for c in j["message"].get("content", []):
            if c.get("type") != "tool_use": continue
            tools += 1
            if c["name"] == "Read" and str(c["input"].get("file_path", "")).lower().endswith((".png", ".jpg", ".jpeg")): imgs += 1
            if c["name"] == "Agent": agents += 1
    return len(seen), tools, imgs, agents, ctx, result_out if results else None

def scores(ticket):
    p = os.path.join(OUT, f"{ticket}.md")
    if not os.path.exists(p): return {}
    m = re.search(r"^scores:\s*(.+)$", open(p, errors="replace").read(), re.M)
    return dict(re.findall(r"([a-z-]+)=(\d+)", m.group(1))) if m else {}

PRODUCT = ["app", "components", "lib", "models"]
def diff(ticket):
    """Product diff for the ticket: lines added, removed, files created across
    every commit whose subject names #ticket. The one number the minimalism
    rules in the build brief can move; scores cannot show it."""
    try:
        # --branches: an open ticket's commits live on its lane branch (wf/<map>-<ticket>), not
        # the checkout's; the digit guard keeps #457 from matching #4571.
        shas = subprocess.run(["git", "log", "--branches", "--format=%h", "-E", "--grep", f"#{ticket}([^0-9]|$)"], cwd=ROOT, capture_output=True, text=True).stdout.split()
        if not shas: return "·"
        add = rem = new = 0
        for sha in shas:
            for ln in subprocess.run(["git", "show", "--numstat", "--diff-filter=AM", "--format=", sha, "--"] + PRODUCT, cwd=ROOT, capture_output=True, text=True).stdout.splitlines():
                a, r, _ = ln.split("\t", 2)
                if a.isdigit(): add += int(a); rem += int(r)
            new += len(subprocess.run(["git", "show", "--name-only", "--diff-filter=A", "--format=", sha, "--"] + PRODUCT, cwd=ROOT, capture_output=True, text=True).stdout.split())
        return f"+{add} −{rem} / {new} new"
    except Exception:
        return "·"

runlog = {}
rl = os.path.join(OUT, "run-log.md")
if os.path.exists(rl):
    for ln in open(rl, errors="replace"):
        m = re.search(r"\| \[#(\d+)\].*?\| ([^|]*?)(?: \(([^()|]*)\))? \| (\d+m\d+s)[^|]* \| \[log\]\(logs/(\S+)\)", ln)
        if m: runlog[m.group(5)] = (m.group(2), m.group(3) or "default", m.group(4))

rows = []; diffs = {}
for f in sorted(glob.glob(os.path.join(OUT, "logs", "*.jsonl"))):
    base = os.path.basename(f); t = re.search(r"-(\d+)\.jsonl$", base).group(1)
    turns, tools, imgs, agents, ctx, out = cost(f)
    if turns == 0: continue
    outcome, model, dur = runlog.get(base, ("?", "?", "?"))
    s = scores(t)
    g = lambda k: s.get(k, "·")
    if t not in diffs: diffs[t] = diff(t)
    rows.append(f"| #{t} | {base[:15]} | {model} | {outcome[:28]} | {g('predicted-critique')} | {g('first-critique')} | {g('close-critique')} | {g('first-evaluate')} | {g('close-evaluate')} | {diffs[t]} | {turns} | {ctx/1e6:.0f}M | {'·' if out is None else f'{out/1e3:.0f}K'} | {imgs} | {agents} | {dur} |")

hdr = ["# Scoreboard — map #" + MAP, "",
       "First-pass scores are the KPI (the pre-build getting better); close scores are reached by the fix batch. Cost = turns × context. Diff = product lines (app, components, lib, models) across the commits naming the ticket, and files created — the number the build brief's minimalism rules are meant to move. `·` = the report carries no `scores:` line (decision ticket, or a session before the line existed) or no commit names the ticket; in Output, the session wrote no `result` event (stopped, or still running).", "",
       "| Ticket | Session | Model | Outcome | Pred. critique | First critique | Close critique | First evaluate | Close evaluate | Diff | Turns | Context in | Output | Images | Agents | Time |",
       "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
open(os.path.join(OUT, "scoreboard.md"), "w").write("\n".join(hdr + rows) + "\n")
print(f"scoreboard: {len(rows)} sessions → {os.path.join(OUT, 'scoreboard.md')}")
