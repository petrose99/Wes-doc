# Wayfinder autopilot

Works a Wayfinder map unattended: one fresh Claude session per frontier
ticket, answering grilling questions with the `➡️` recommendation, writing a
report per ticket, tearing down each session's processes before the next.

## Install once, use in any project

The folder is self-contained. Copy it somewhere global and run it from
inside whichever repo has the map:

```bash
cp -r scripts/wayfinder-autopilot ~/.claude/wayfinder-autopilot
cd ~/some-other-project && ~/.claude/wayfinder-autopilot/run.sh <map> --detach
```

The tracker repo comes from `gh repo view` (override with `WAYFINDER_REPO=owner/name`).
Each project gets `.claude/wayfinder-autopilot/lessons.md` for codebase-specific
lessons; the generic lessons live next to the driver and travel with it.
Allow the driver in that project's `.claude/settings.local.json`:
`Bash(~/.claude/wayfinder-autopilot/run.sh:*)`.

## Run

```bash
scripts/wayfinder-autopilot/run.sh <map> --dry-run            # print the ticket order, do nothing
scripts/wayfinder-autopilot/run.sh <map> --max 1              # one ticket, check the report
scripts/wayfinder-autopilot/run.sh <map> --detach             # whole frontier, survives the terminal
scripts/wayfinder-autopilot/run.sh <map> --ticket 251         # one named ticket
scripts/wayfinder-autopilot/run.sh <map> --detach --after-pid <pid>   # queue behind a running session
```

Watch: `tail -f docs/wayfinder-reports/<map>/detached.out`.
Stop: `kill <driver pid>` (current ticket finishes, nothing new starts).

Needs `.claude/settings.local.json` to allow `Bash(scripts/wayfinder-autopilot/run.sh:*)`
if Claude itself is to launch it; `/wayfinder` is `disable-model-invocation`,
so the driver passes it as the `-p` prompt, which counts as a user invocation.

## Files

- `run.sh` — driver: frontier query (open, unassigned, all blockers closed, in
  sub-issue order), per-session `setsid claude -p "/wayfinder <map> <ticket>"`,
  process-group teardown + stray dev-server/Chromium sweep, run log,
  continuation of tickets left open (`Autopilot: continue —`, a cap, or an
  exit without close: WIP committed, hand-off posted, ticket back on the
  frontier; parked only after `MAX_ATTEMPTS` consecutive sessions with no
  progress), claim release on failure.
- `lessons.md` — generic lessons (any product): what earlier first passes
  missed → what to put in the spec. Read whole each session, appended at
  close, capped ~80 lines by merging. The project's own
  `.claude/wayfinder-autopilot/lessons.md` holds codebase-specific ones.
- `brief.md` — appended system prompt: standing delegation (take the
  recommended answer, never AskUserQuestion, never remove a feature without
  owner sign-off), one ticket per session, build → score → improve on
  execution tickets with the CLAUDE.md bar as definition of done, mandatory
  report format, leave the machine clean.
- Output: `docs/wayfinder-reports/<map>/<ticket>.md` (per-ticket report with
  the Q&A table of answers taken on the owner's behalf), `run-log.md`,
  `logs/*.jsonl` (full stream-json transcripts).

## Tuning

- `ALLOWED_TOOLS` in `run.sh`: sessions run in `acceptEdits` with this
  allowlist; a denied command shows up in the report as "denied". Widen here.
- `MAX_ATTEMPTS` in `run.sh`: consecutive no-progress sessions on one ticket before it is parked; a session that commits or updates the hand-off file resets it.
- Typical times on map #226: grilling tickets 6–16 min; execution tickets longer.
