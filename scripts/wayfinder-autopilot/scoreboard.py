#!/usr/bin/env python3
"""Scoreboard for one map: per session, the scores (from the report's
`scores:` line) beside the cost (from the stream-json log). No model runs
here; the driver calls it after every session. The first-pass score is the
KPI — the close is always reached by a fix batch and says nothing about
whether the pre-build is getting better. Cost is turns × context: every turn
re-reads the whole context, so a long session is quadratic.

usage: scoreboard.py <map> [repo-root]   → writes docs/wayfinder-reports/<map>/scoreboard.md
"""
import glob, json, os, re, sys
MAP = sys.argv[1]; ROOT = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
OUT = os.path.join(ROOT, "docs/wayfinder-reports", MAP)

def cost(path):
    turns = imgs = agents = tools = 0; ctx = out = 0
    for ln in open(path, errors="replace"):
        if '"type":"assistant"' not in ln and '"type": "assistant"' not in ln: continue
        try: j = json.loads(ln)
        except Exception: continue
        if j.get("type") != "assistant": continue
        u = j["message"].get("usage", {}); turns += 1
        ctx += u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
        out += u.get("output_tokens", 0)
        for c in j["message"].get("content", []):
            if c.get("type") != "tool_use": continue
            tools += 1
            if c["name"] == "Read" and str(c["input"].get("file_path", "")).lower().endswith((".png", ".jpg", ".jpeg")): imgs += 1
            if c["name"] == "Agent": agents += 1
    return turns, tools, imgs, agents, ctx, out

def scores(ticket):
    p = os.path.join(OUT, f"{ticket}.md")
    if not os.path.exists(p): return {}
    m = re.search(r"^scores:\s*(.+)$", open(p, errors="replace").read(), re.M)
    return dict(re.findall(r"([a-z-]+)=(\d+)", m.group(1))) if m else {}

runlog = {}
rl = os.path.join(OUT, "run-log.md")
if os.path.exists(rl):
    for ln in open(rl, errors="replace"):
        m = re.search(r"\| \[#(\d+)\].*?\| ([^|]*?)(?: \(([^()|]*)\))? \| (\d+m\d+s) \| \[log\]\(logs/(\S+)\)", ln)
        if m: runlog[m.group(5)] = (m.group(2), m.group(3) or "default", m.group(4))

rows = []
for f in sorted(glob.glob(os.path.join(OUT, "logs", "*.jsonl"))):
    base = os.path.basename(f); t = re.search(r"-(\d+)\.jsonl$", base).group(1)
    turns, tools, imgs, agents, ctx, out = cost(f)
    if turns == 0: continue
    outcome, model, dur = runlog.get(base, ("?", "?", "?"))
    s = scores(t)
    g = lambda k: s.get(k, "·")
    rows.append(f"| #{t} | {base[:15]} | {model} | {outcome[:28]} | {g('predicted-critique')} | {g('first-critique')} | {g('close-critique')} | {g('first-evaluate')} | {g('close-evaluate')} | {turns} | {ctx/1e6:.0f}M | {out/1e3:.0f}K | {imgs} | {agents} | {dur} |")

hdr = ["# Scoreboard — map #" + MAP, "",
       "First-pass scores are the KPI (the pre-build getting better); close scores are reached by the fix batch. Cost = turns × context. `·` = the report carries no `scores:` line (decision ticket, or a session before the line existed).", "",
       "| Ticket | Session | Model | Outcome | Pred. critique | First critique | Close critique | First evaluate | Close evaluate | Turns | Context in | Output | Images | Agents | Time |",
       "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
open(os.path.join(OUT, "scoreboard.md"), "w").write("\n".join(hdr + rows) + "\n")
print(f"scoreboard: {len(rows)} sessions → {os.path.join(OUT, 'scoreboard.md')}")
