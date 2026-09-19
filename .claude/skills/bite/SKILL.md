---
name: bite
description: Launch or control Bite — this repo's name for the Wayfinder autopilot loop (scripts/wayfinder-autopilot/run.sh). Use when the user says "run Bite", "start Bite on map N", "stop Bite", "is Bite running", or asks to launch the autopilot coding agent by name.
---

# Bite

Bite is this project's name for the Wayfinder autopilot driver at
`scripts/wayfinder-autopilot/run.sh`. It launches one fresh Claude Code
session per frontier ticket on a Wayfinder map, working it through the
`/wayfinder` protocol (grilling, spec, build, measure, close) until the
frontier is empty. See `scripts/wayfinder-autopilot/README.md` for the full
mechanics.

## Commands

Start Bite on a map, detached (survives the terminal/session closing):

```bash
scripts/wayfinder-autopilot/run.sh <map-number> --detach
```

Other invocations, same underlying driver:

```bash
scripts/wayfinder-autopilot/run.sh <map> --dry-run              # show the frontier order, do nothing
scripts/wayfinder-autopilot/run.sh <map> --max 1                # one ticket only
scripts/wayfinder-autopilot/run.sh <map> --ticket <n>            # one named ticket
scripts/wayfinder-autopilot/stop.sh <map>                        # stop cleanly: WIP commit + hand-off, resumable later
```

## Checking on Bite

```bash
tail -f docs/wayfinder-reports/<map>/detached.out      # progress feed
pgrep -af "wayfinder-autopilot/run.sh"                  # is it running
```

Current ticket: find the newest file in `docs/wayfinder-reports/<map>/logs/*.jsonl`
and tail its `assistant` tool_use entries.

## When the user asks to "run Bite" / "start Bite"

1. If they didn't name a map, ask which one (or infer from recent context/memory).
2. Confirm nothing is already running for that map (`pgrep -af run.sh`) before
   launching a second driver on it.
3. Launch with `--detach` unless they ask for `--max`/`--ticket`/foreground.
4. Report back the detached pid and the `tail -f` command to watch it.

## When the user asks to "stop Bite"

Run `scripts/wayfinder-autopilot/stop.sh <map>` — it stops the driver and the
current session cleanly (WIP commit + hand-off comment) rather than killing
it mid-edit.
