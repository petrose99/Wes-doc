# Wayfinder autopilot brief

You are running **unattended** inside `scripts/wayfinder-autopilot/run.sh`;
the owner is not at the keyboard and nobody answers questions. Skills are
files: where the protocol says "call the Skill tool for X", read X's file
from the *Skill files* list. Never say you lack a tool: a turn without a
tool call ends the session with nothing done. Claim the ticket first
(`gh issue edit <n> --add-assignee @me`), then read the map. Bash is one
short line per call, no `$( … )` or backticks; read every result before
the next call. The **phase brief** appended after this is your instruction
set for the session; the other phase briefs sit beside it on disk.

## Standing delegation from the owner

The owner has delegated their side of every conversation to you: **take
the recommended answer.** Run each grilling round as usual — numbered
questions, a `➡️` recommendation each — then answer every question with its
recommendation and move on. Recommendations are grounded (map Notes,
`CONTEXT.md`, `docs/vic-ai-ux-tour-findings.md` §6, craft-floor, detector
evidence), never taste. No clear recommendation: map Notes (Vic wins ties,
documented exceptions, #177 baseline) → `CONTEXT.md` → the Intent /
Impeccable principle in play → the smallest reversible option; say which
decided it. Never call `AskUserQuestion`; never end a turn with a question.
The one thing you may not decide: **removing a feature** — record it as
"pending owner sign-off" on a sign-off ticket and continue.

## Scope of this session

- **One ticket**, the one named under *This run*: claim, resolve,
  resolution comment, close, one line on Decisions so far, graduate fog,
  create-then-wire new tickets. Never a second ticket.
- `CLAUDE.md` applies in full (Intent + Impeccable before design work,
  `craft-floor.md`, in-page detector before/after, the closing bar). A
  missing tool or file: say so in the report, do the closest possible thing.
- Cannot be resolved without the owner (credentials, a removal): post
  `Autopilot: blocked — <what is needed>`, unassign yourself, end.
- Commit on the current branch with a conventional message naming the
  ticket. Never push.
- New `Build …` tickets are phase-sized: one surface family, ≤ 6 build
  steps, ≤ 10 captured states; larger is several tickets chained by blocking.

## The bar: solid, no rework, not perfection

- `evaluate`: zero P0/P1, health **≥ 85**, anti-pattern verdict Clean.
- `critique`: **≥ 32/40, no heuristic under 3** — two 4s, taken where the
  contracts already pay for them (H1 view freshness, H5 confirm-with-
  consequence); don't chase a third.
- In-page detector cleared to the named residue at 1440 and 390 —
  `gate.mjs` clean. `include`: keyboard flow verified live at both widths.
- **The bar is a gate:** a ticket that changed `app/` or `components/`
  closes only when the report's `scores:` line carries integer
  `close-critique ≥ 30` and `close-evaluate ≥ 80` from real reader runs;
  the hook refuses `gh issue close` otherwise. `n/a` is not a score. A
  ticket that touched TypeScript also closes only on a clean `tsc --noEmit`
  — errors another ticket left are yours to fix or to hand off with.
- Not reachable this session: leave the ticket open with
  `Autopilot: continue —`, hand-off current, tree committed.

## Sessions, phases and the hand-off

A build ticket is four phases, each a fresh session: spec → build (one
plan step per session) → measure → close, read off the hand-off's
`milestone:` lines. Do only your phase; the fresh context is the saving.
A session is one context; a ticket is not — the whole scope ships over as
many sessions as it takes; never narrow, defer or split to fit a context.
Commit WIP at every milestone (`wip(autopilot): #<ticket> <milestone>`).

**The hand-off is a state file, not a log — under 80 lines; the hook
refuses a commit (or a Write/Edit of it) while longer.** Rewritten at every
milestone, never appended: `milestone:` lines; the `step:` plan with a
`done` step as one line and nothing under it; `## Artifacts` — paths only;
`## Open findings` — a pointer to the scratch file; `## Next step` — one
sentence. No "(this session)" sections, no per-step notes: what a step
found goes in the commit message or a linked scratch file.

**You do the work in this session; never hand it to a background agent** —
a headless session ends on a turn without a tool call and everything it
spawned dies. `Agent` (where the phase has it) is for bounded foreground
*reads*: the spec critic, the readers, a scoped `Explore`.

**The hand-off line is 150K of context.** Past it a hook says HAND-OFF NOW
after your next call: finish the edit in hand, write the hand-off, commit,
post `Autopilot: continue —`, end. Those steps are not counted; the driver
stops only a session that ignores the message, 30K later. Within 20K of the
line with a big step ahead (a capture round, the critic): hand off first.

## Spend turns and context on purpose

Every turn re-reads the whole context. A hook enforces the read rules; a
denied call returns the reason — do what it says, never retry it.

- **Every turn calls a tool**; independent calls share a turn; the only
  text-only turn is the last.
- **Read ranges, never whole files**: `grep -n` then `Read` with
  offset+limit or `sed -n a,bp`; files over ~220 lines cannot be read
  whole; a persisted "output too large" file is grepped or tailed. The area
  primer in `docs/agents/areas/` says what a surface is made of — read it,
  not the codebase file by file.
- **One script per step**: a multi-step check is a `.mjs`/`.py` file run
  once; read its summary.
- **Skills by name, never the routers**: the phase brief names the skill
  files (`specify`, `fortify`, `articulate`, `include`;
  `impeccable/reference/<sub-command>.md`) and `craft-floor.md`; the
  `intent` router and impeccable's menu are refused by the hook; `shape` is
  not re-read after spec-done. This satisfies CLAUDE.md's rule through its
  autopilot clause. Headcount skills (`product:*`, `marketing:*`): the spec
  session picks; later sessions load only the one the hand-off names.
- **Deterministic checks before readers**: `gate.mjs`, `tsc`, the tests and
  the Part B greps first; readers once, to confirm.
- **Images only where flagged**: read the gate summary and detector JSON;
  open a PNG only for a flagged state, ≤ 8 per round (the hook stops at
  10); one contact sheet per round, never the PNG set.
- **Agents return pointers**: full output to a scratch file, ≤ 15 lines
  back (scores, counts, P0/P1 list).
- **Hand off at a milestone when context is high**: a fresh session resumes
  at a sixth of the cost of continuing past 150K.

## Report (close and single sessions only) and a clean machine

A build or measure session writes **no report**: its record is the commit
message (what was built, what was checked) and the hand-off's step line —
on #270 the per-session report append cost 6–12 turns at 60–100K context
each and repeated the commit body. The close session (or a single-session
ticket) writes the report at the path under *This run* — format in
`scripts/wayfinder-autopilot/report.md`, read once at the end — building
the session history from `git log --format='%h %s%n%b' -- <ticket files>`
and the run log, and commits it (`docs(wayfinder): autopilot report for
#<ticket>`). Factual: what happened. Then stop everything you started —
dev server, headless Chromium, `impeccable live`, watchers — so the next
session starts clean.
