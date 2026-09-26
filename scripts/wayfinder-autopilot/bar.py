#!/usr/bin/env python3
"""Closing bar for one ticket, as the driver and rescore.sh check it after a
close. hooks/token-guard.sh `closing_bar` enforces the same rule before one —
change both together. A ticket owes the bar when its own commits changed a
rendered file (app/** or components/**, .tsx/.css; tests and app/api/**
excluded — CLAUDE.md's path-based gate). It meets the bar when the report's
`scores:` line carries integer close-critique >= 30 (every heuristic >= 3)
and close-evaluate >= 80, produced by the readers. `n/a`, a missing line or a
missing report all fail: a surface that was never scored has not passed.

usage: bar.py <report.md> <ticket> [--all-branches]   (run inside the ticket's repo/lane)
exit 0 = meets the bar · 1 = owes it and fails (reason on stdout) · 3 = owes nothing
"""
import os, re, subprocess, sys

def sh(*a):
    try: return subprocess.run(a, capture_output=True, text=True).stdout
    except Exception: return ""

def ticket_files(t, all_branches=False):
    # A ticket's commit names it in the subject as the thing being worked
    # (`wip(autopilot): #T …`, `fix(#T): …`, `land(#T)`), not as a reference
    # ("execution of #288" on #328's commits, "per #244" on a later build).
    files = set()
    for row in sh("git", "log", *(["--branches"] if all_branches else []), "--format=%H %s", "-E", f"--grep=#{t}([^0-9]|$)").splitlines():
        sha, _, subj = row.partition(" ")
        if not re.search(rf"(?<![\d/])#{t}(?!\d)", subj) or re.search(rf"\b(of|from|per|via|to|by)\s+#{t}(?!\d)", subj): continue
        if re.search(rf"#{t}\s+(filed|opened|spawned|created)", subj): continue
        files |= set(sh("git", "diff-tree", "--no-commit-id", "--name-only", "-r", sha).split())
    return files

def rendered(files):
    return sorted(f for f in files if re.match(r"^(app|components)/.*\.(tsx|css)$", f) and not re.search(r"\.test\.tsx$|/api/", f))

def scores_line(report):
    try: return next((l.strip() for l in open(report, errors="replace") if l.startswith("scores:")), "")
    except Exception: return ""

def meets(line):
    kv = dict(re.findall(r"(\S+)=(\S*)", line))
    def num(k):
        try: return int(kv.get(k, ""))
        except Exception: return None
    cc, ce = num("close-critique"), num("close-evaluate")
    return cc is not None and ce is not None and cc >= 30 and ce >= 80

if __name__ == "__main__":
    report, t = sys.argv[1], sys.argv[2]
    ui = rendered(ticket_files(t, "--all-branches" in sys.argv))
    if not ui: sys.exit(3)
    line = scores_line(report)
    if meets(line): sys.exit(0)
    print(f"changed rendered files ({', '.join(ui[:5])}{' …' if len(ui) > 5 else ''}) but the report's scores line is below the bar (close-critique >= 30 and close-evaluate >= 80, integers): {line or 'no scores: line'}")
    sys.exit(1)
