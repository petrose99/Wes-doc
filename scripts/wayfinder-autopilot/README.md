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
scripts/wayfinder-autopilot/stop.sh <map>                     # stop cleanly: runner, session, WIP commit, hand-off; resume with run.sh
```

Watch: `tail -f docs/wayfinder-reports/<map>/detached.out`.
Stop: `kill <driver pid>` (current ticket finishes, nothing new starts).

Path-based design gate: the spec phase marks every plan step `kind: surface|backend` from the files it touches (`app/**`/`components/**` rendering files → surface); only surface steps owe the Intent/Impeccable pass and the detector, and `token-guard.sh` refuses an Edit/Write of a rendering file until `craft-floor.md` has been read in that session. Backend paths are never design-gated; they carry the backend floor instead (`CODING_STANDARDS.md`): seams + red-first tests per step, `simplify`, `/code-review` at close. The hook refuses a commit of `lib/`/`models/`/`worker/` logic without a `.test.ts` (escape `no-test: <reason>`) and a close without `review: P0=0 P1=0` on the report.

Phased builds: a "Build …" task ticket runs as four fresh sessions — spec → build → measure → close — read off `milestone:` lines in the hand-off (`spec-done`, `build-done`, `measured`); the driver keeps a high-water mark in `<ticket>.phase` so a phase never moves backwards.

Capture rounds: `capture-round.mjs` is the shared runner for the measure and close phases (fresh context per state, detector injection, residue filter, keyboard probes, per-state error isolation, `detector.json` + `keyboard.json`); a ticket's round script is a state list on top of it. The token-guard hook refuses `git commit` and any Write/Edit of the hand-off while it is over `WAYFINDER_HANDOFF_MAX_LINES` (80 in this repo's `config.sh`); context-guard nags once as well, and the run-log row records the length. The same hook refuses `gh issue close` on a ticket that touched `app/` or `components/` until the report's `scores:` line carries close-critique ≥ 30 and close-evaluate ≥ 80.

Hard phases: once a phase has `HARD_AFTER` run-log rows without completing (default 2) every further session on it runs on `MODEL_HARD` at `EFFORT_HARD` (per-project `config.sh`), skipping the cheap first pass; when the phase advances the count restarts and routing reverts to the normal ladder. The driver reads these once at start — restart it at a session boundary to apply a change.

Model ladder on a phase: build and close sessions start on `MODEL_EXEC_FIRST` and stay there while sessions progress (a commit or a hand-off change); the ticket's last run-log row saying *no progress* moves the next session to `MODEL_STRONG`, and `HARD_AFTER` of them to `MODEL_HARD`. A model switch also drops the cached base prompt (~20K), so it is made on evidence, not on "second session".

Cascade with hand-back (inside one session): a session is a chain of legs on one transcript (`--resume`), and the model may change between legs — the transcript carries the plan, not the model. A leg that ends with the ticket open, no hand-off and no tool call is first nudged on the same model (`SESSION_NUDGES`), then *pushed*: `MODEL_UNBLOCK` (Opus) is resumed into the same session to do the one step that stalled and stop with `UNBLOCKED:`; the session's own model then resumes on top of that work. `UNBLOCK_MAX` pushes per session. This is why the default model can be Sonnet everywhere: Opus is paid for the hard step only, not the session. The driver prints each push and return in the detached log.

Lanes (`LANE_MODE=worktree` in `config.sh`): every ticket is worked in its own git worktree under `../<repo>-lanes/<map>-<ticket>` on branch `wf/<map>-<ticket>`, branched from the local tip of whatever branch the driver started on (the *integration branch*). `node_modules` is hard-link-cloned (`LANE_CLONES`; Turbopack rejects a symlinked one), `.env`, `.impeccable/live` and `settings.local.json` are symlinked in (`LANE_LINKS`); `.next` is fresh per lane (a cold compile on the first capture). The ticket's report and hand-off live in the lane, so the driver reads phase and progress from there, and WIP commits land on the lane branch — the checkout the driver runs from is never written by a session, so the owner can work in it while Bite runs. After every session the branch is pushed; the first push opens a **draft PR** against the integration branch so work in flight is visible. When the ticket closes at the bar the PR is marked ready and, with `LANE_MERGE=auto` (default), merged `--no-ff` into the integration branch locally and pushed — GitHub records the PR as merged — and the lane is removed. If that merge conflicts with uncommitted changes in the checkout the PR is left open and the lane kept; land it by hand. `LANE_MERGE=review` never merges: the PR waits for a human, and the frontier holds back any ticket whose blocker's PR is still open, so dependent work is not built on unreviewed code. Logs, run-log and scoreboard stay in the checkout under `docs/wayfinder-reports/<map>/`. `stop.sh` commits and pushes each running lane. `lanes-tour.sh [<map>]` walks through all of this against the live state; the decision is `docs/adr/0004`. Lanes are sequential: one dev server (:3000) and one devdb; parallel lanes would need a port per lane.

Ticket sizing: a `Build …` ticket is one surface family, at most six build steps and ten captured states. Charting sizes it (`reference/charting.md` §Tickets); the spec phase checks the plan against the limits and splits the remainder into a blocked child ticket *before any code* (`phases/spec.md` step 6). A build or close session never splits.

Deterministic gate: `gate.mjs <shots-dir> [--baseline <dir>] --residue-file <area primer or residue.txt>` reads a round's `detector.json` + `keyboard.json` and prints real findings outside the residue, failing probes (`ok: false`, recorded by the round script), errored states, page errors and findings new since the baseline — exit 0 when clean. The build's G2 and the close phase's fix loop run on it; the reader agents run once, on the round that passes. Residue regexes live in the area primer's ```` ```residue ```` block.

Close-phase state lives in `<scratch>/close.md` (triage, batches, gate results, next step); the hand-off holds a pointer. `CLOSE_RESUME=1` in `config.sh` instead resumes the previous close session (`--resume`, soft cap `CLOSE_RESUME_MAX_TOKENS`, [1m] models only, one driver run) — off by default: it keeps the loop's memory at the cost of every later turn re-reading a longer context.

Load per session: the run-log's duration cell carries `load NK`, the tokens the first turn paid before any work. A note on caching: an identical `--append-system-prompt-file` *is* served from cache across separate `claude -p` processes (probe: second run read 12.3K, created 0), but in real sessions it never hits — Claude Code's own system context ahead of it changes every commit (git status), and a model switch changes the cache key. So the lever is the size of the load (brief, phase brief, hand-off), not cache hits; watch the column.

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
- `scoreboard.py` — per-session scores (from each report's `scores:` line)
  beside cost (turns, context, images, subagents, from the stream log). The
  driver regenerates `docs/wayfinder-reports/<map>/scoreboard.md` after every
  session. First-pass score is the KPI; cost is turns × context.
- `retro.sh` + `retro-brief.md` — a bounded retrospective session (cheap
  model, no dev server, no logs, no screenshots) that reads the scoreboard
  and the last N reports and proposes lessons/pre-flight/brief edits as a PR.
  Run every four or five builds: `scripts/wayfinder-autopilot/retro.sh <map>`.
- Area primers (project, not tool): `docs/agents/areas/<area>.md`, one page
  per surface family, read at spec/build start, written or refreshed at close.
- `contact-sheet.mjs` — tiles a capture round into one PNG (Playwright) so a
  reader opens one image per round instead of one per state.
- `lessons.md` — generic lessons (any product): what earlier first passes
  missed → what to put in the spec. Read whole each session, appended at
  close, capped ~80 lines by merging. The project's own
  `.claude/wayfinder-autopilot/lessons.md` holds codebase-specific ones.
- `brief.md` + `phases/{spec,build,measure,close,single}.md` — appended system prompt (core + one phase brief per session); measure is plumbing (raw scores only, MODEL_MEASURE), close triages: standing delegation (take the
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
