#!/usr/bin/env bash
# Stage an autopilot WIP commit: tracked changes plus files the session
# created — never paths that were already untracked when the run started
# (those are the owner's in-progress work, not the session's), and never an
# exclusion pathspec on a gitignored path (git refuses the whole add with
# "paths are ignored", and the driver's WIP commits were silently never
# happening — 2026-09-19).
#   wip-add.sh [<pre-untracked-file>]     (run from the repo root)
set -uo pipefail
PRE="${1:-}"
EXCL=()
# check-ignore reports a `dir/` pattern for a path *inside* the dir, not the
# dir — and in a lane the dir is a symlink (LANE_LINKS), where the probe path
# is "beyond a symbolic link" and only the dir itself answers (2026-09-22, #380:
# every hard-cap WIP commit in the lane was refused with "paths are ignored").
ignored_dir() { git check-ignore -q "$1" 2>/dev/null || git check-ignore -q "$1/probe" 2>/dev/null; }
for p in .scratch .scratch[0-9]* .impeccable/live; do
  ignored_dir "$p" || EXCL+=(":!$p")
done
for d in docs/wayfinder-reports/*/logs; do
  [ -d "$d" ] && ! ignored_dir "$d" && EXCL+=(":!$d")
done
if [ -n "$PRE" ] && [ -f "$PRE" ]; then
  while IFS= read -r p; do
    [ -n "$p" ] && EXCL+=(":!$p")
  done < "$PRE"
fi
git add -A -- . "${EXCL[@]}"
