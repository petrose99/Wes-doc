#!/usr/bin/env bash
# Rescore sweep: every closed sub-issue of a map that changed a rendered file
# without meeting the closing bar (bar.py) is reopened and sent back through
# measure → close on the code as it stands. Such a ticket never passed, so
# the work that depends on it has not either: reopening it takes it (and
# everything blocked by it) back off the frontier until the readers score it.
# run.sh calls this before the first ticket; run it by hand to see or act on
# a map without starting a run.
#
#   scripts/wayfinder-autopilot/rescore.sh <map> [--dry-run]
set -euo pipefail
AP="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
REPO="${WAYFINDER_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
MAP="${1:?usage: rescore.sh <map> [--dry-run]}"; DRY=0; [ "${2:-}" = --dry-run ] && DRY=1
OUT="$ROOT/docs/wayfinder-reports/$MAP"

gh api "repos/$REPO/issues/$MAP/sub_issues" --paginate --jq '.[] | select(.state=="closed") | .number' |
while read -r t; do
  [ -f "$OUT/$t.md" ] || continue          # never worked by the autopilot: nothing it claimed
  why="$(cd "$ROOT" && python3 "$AP/bar.py" "$OUT/$t.md" "$t" --all-branches)" && continue
  [ $? -eq 1 ] || continue                 # 3 = owes no bar (decision or backend ticket)
  echo "rescore #$t — $why"
  [ "$DRY" = 1 ] && continue
  h="$OUT/$t.handoff.md"
  if [ -f "$h" ] && grep -Eq '^milestone: (build-done|measured|closed)' "$h"; then
    # Phased: back to measure. Every milestone from `measured` on goes (the
    # readers run again on today's code) and `build-done` stands in its place
    # when a build session never wrote it (#328, and #396's hand-off that
    # only said `closed`); the driver's high-water mark
    # is lowered with it — phase_of never moves backwards on its own.
    python3 - "$h" <<'PY'
import sys; p = sys.argv[1]; out = []; done = cut = False
for ln in open(p):
    if ln.startswith("milestone:"):
        if cut: continue
        if ln.strip() in ("milestone: measured", "milestone: closed"):
            cut = True
            if not done: out.append("milestone: build-done\n")
            continue
        if ln.strip() == "milestone: build-done": done = True; out.append(ln); cut = True; continue
    out.append(ln)
out.append("\n## Rescore\n\nReopened by the rescore sweep: the ticket closed below the closing bar. The build is landed; measure the surface as it stands now, then close at the bar.\n")
open(p, "w").writelines(out)
PY
    echo measure > "$OUT/$t.phase"
    git -C "$ROOT" commit -q -m "docs(wayfinder): #$t back to measure — closed below the bar" -- "$h"
  fi
  gh issue reopen "$t" --repo "$REPO" >/dev/null
  gh issue edit "$t" --repo "$REPO" --remove-assignee "$(gh api user --jq .login)" >/dev/null 2>&1 || true
  gh issue comment "$t" --repo "$REPO" --body "Autopilot: continue — rescore. This ticket closed below the closing bar: $why. Its build is landed. Run \`phases/measure.md\` on the surface as it stands now (a capture round with the in-page detector, then the readers), then \`phases/close.md\`, and close only with integer close-critique >= 30 (every heuristic >= 3) and close-evaluate >= 80 on the report's \`scores:\` line. Tickets blocked by this one wait until it passes." >/dev/null
done
