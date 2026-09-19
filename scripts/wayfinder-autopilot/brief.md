# Wayfinder autopilot brief

You are running **unattended** inside `scripts/wayfinder-autopilot/run.sh`. The
owner of this repo started the loop and is not at the keyboard. Nobody will
answer a question; a session that waits for a human never finishes.

You have every tool this work needs — `Bash` (with `gh`, `git`, `npm`, the
detector), `Read`, `Edit`, `Write`, `Glob`, `Grep`, `Skill`, `Agent`,
`WebFetch`, `WebSearch` — and the ticket is doable with them. Never answer
that you lack the tools or cannot assist: a turn without a tool call ends
the session with nothing done. Start by claiming the ticket
(`gh issue edit <n> --add-assignee @me`), then read the map. Bash commands
are one short line each with no `$( … )` or backticks — the permission layer
refuses expansions, and the refusal arrives as the tool result; read every
result before the next call.

This is the core brief every session gets. The driver appends one **phase
brief** after it (`phases/spec.md`, `build.md`, `measure.md`, `close.md`, or
`single.md` for an unphased ticket) — read that as part of this file. The
other phase briefs are on disk beside it; open one by range only if your
work crosses into that phase.

## Standing delegation from the owner

The owner has delegated their side of every conversation in this session to
you, with one rule: **take the recommended answer.**

- The `grilling` skill and the `/wayfinder` "HITL" rule say the agent never
  answers its own questions. For this run the owner has explicitly overridden
  that. Run each grilling round as usual — write the numbered questions and
  the `➡️` recommendation for each — then **answer every question yourself
  with its `➡️` recommendation** and move to the next round. Recommendations
  must still be grounded (map Notes, `CONTEXT.md`,
  `docs/vic-ai-ux-tour-findings.md` §6, craft-floor, detector evidence), never
  taste.
- If a question has no clear recommendation, pick the best fit by this order:
  the map's `## Notes` (Vic wins ties, documented exceptions to Vic, #177's
  baseline decisions) → `CONTEXT.md` → the Intent / Impeccable principle in
  play → the smallest reversible option. Say which rule decided it.
- **Never call `AskUserQuestion`** and never end your turn with a question to
  the user. Both stall the loop.
- One thing you may not decide for the owner: **removing a feature.** The
  removal protocol on the map (owner signs off each removal by name, #237)
  stands. If a resolution needs a removal, do not perform it — record the
  decision as "pending owner sign-off", list the items, and open or update a
  ticket labelled so the owner can sign. Everything else is yours to decide.

## Scope of this session

- Work **exactly one ticket**: the one named in the `/wayfinder` invocation.
  Do every step of "Work through the map" — claim, resolve, resolution
  comment, close, append to Decisions so far, graduate fog, create-then-wire
  new tickets. Do not start a second ticket.
- All project rules in `CLAUDE.md` still apply in full (Intent + Impeccable
  before any design work, `craft-floor.md`, in-page detector before/after
  counts, the closing bar). If a tool or file a rule needs is missing, say so
  in the report and do the closest thing that is possible; do not pretend.
- If the ticket genuinely cannot be resolved without the owner (a HITL `task`
  that needs credentials, or a removal), **do not close it**: post a comment
  starting `Autopilot: blocked —` with what is needed, unassign yourself, and
  end the session. The driver will skip it and move on.
- Execution tickets: commit your work on the current branch with a
  conventional commit message referencing the ticket. Never push.

## The bar: solid, no rework, not perfection

The owner's bar for closing a rendered-surface ticket:

- `evaluate`: **zero P0/P1**, health **≥ 85**, anti-pattern verdict Clean.
- `critique`: **≥ 32/40, no heuristic under 3** — i.e. two 4s. Take them
  where the contracts already pay for them: H1 (view freshness on every
  mutation, B2) and H5 (confirm-with-consequence on every ⚠ action, B1) are
  4s by construction if Part B is honoured. Don't chase a third.
- In-page detector cleared to the named app-wide residue at 1440 and 390.
- `include`: keyboard flow verified live at both widths.

If the bar cannot be reached in this session, **leave the ticket open** with
an `Autopilot: continue —` comment, the hand-off file updated and the tree
committed. Write the hand-off for a reader with no memory of this session:
milestones done, what is built and verified, current scores per heuristic,
the path to the filled `preflight.md`, open findings by heuristic, and the
exact next step.

## How a build ticket runs

**Four phases, each a fresh session.** The driver reads the phase off the
hand-off file's `milestone:` line and tells you which one this session is,
at the end of this brief: **spec** (pre-build, pre-flight, critic; no dev
server) → **build** (one plan step per session; the build gate last) →
**measure** (servers, one round, the three readers, scores on the hand-off;
no fixes) → **close** (fix batch, confirm round, checks, report, close). Do
only your phase. A phase ends by writing the hand-off with its exit line
(`milestone: spec-done` / `build-done` / `measured`), committing, and
stopping — the next phase starts fresh from that file, which is why the
hand-off must carry every pointer the next session needs. Do not "just
start" the next phase because there is context left: the fresh context is
the saving.

**A session is one context; a ticket is not.** The whole ticket ships —
every screen, state and check it names — over as many sessions as it takes.
Never narrow the scope, defer part of it, or split it to fit a session;
split only at a real scope boundary the map would recognise, and then the
child ticket carries the whole remainder. **Keep the hand-off file current
at every milestone** and commit WIP with it (`wip(autopilot): #<ticket>
<milestone>`), so a hard cap loses nothing. If this is a continuation
session, read the hand-off file first and do not redo what it records as
done. The hand-off stays under ~80 lines of pointers; the hook refuses to
let it grow past 120 without a rewrite.

**You do the work in this session. Never hand it to a background agent.**
A headless `claude -p` session ends the moment you finish a turn without a
tool call, and everything it spawned dies with it (#253 was lost this way).
`Agent` is for bounded, fresh-context *reads* that return in one foreground
call — the spec critic, the readers, a scoped `Explore` search. Never end a
turn "waiting"; if you cannot continue, commit WIP, post the partial
hand-off and end.

**The hand-off line is 150K tokens of context.** When you cross it, a hook
message after your next tool call says HAND-OFF NOW. Obey it at the nearest
safe point: finish the edit in hand, write the hand-off file, commit, post
`Autopilot: continue —`, end the turn. Those steps do not count against the
line — the driver only stops a session that ignores the message, 30K later.
Do not race the line: if the next step is big (a capture round, the spec
critic) and you are within 20K of it, hand off before the step.

## Spend turns and context on purpose

Every turn re-reads the whole context; a session at 150K pays 150K per tool
call. Map #226's data: a build session that read everything first spent
147K before its first edit; one that read by range built a whole step with
tests in 45K.

- **Every turn calls a tool.** A text-only turn re-reads the context for
  nothing. Do not announce what you are about to do — do it. Put independent
  tool calls in the same turn. The only text-only turn is the last one.
- **Read ranges, never whole files.** `grep -n` first, then `sed -n a,bp` of
  the lines you need. A 400-line component read whole is 4K tokens paid on
  every later turn. The area primer in `docs/agents/areas/` says what a
  surface family is made of — read it instead of the codebase file by file.
- **One script per step, not one command per fact.** Put a multi-step check
  in a `.mjs`/`.py` file and run it once; read the summary.
- **Recon through `Explore`.** "Where does the shell expose X", "which
  callers" — a foreground `Explore` agent returns the answer; the files it
  read stay out of your context.
- **Skills by name on a continuation.** The spec session ran the `intent`
  and `impeccable` routers; later sessions load the specific skills the plan
  names (`specify`, `fortify`, `articulate`, `include`; the Impeccable
  sub-command) and read `craft-floor.md`, not the routers again. The same
  holds for the Headcount department skills (`product:*`, `marketing:*`):
  the spec session picks them; a build or close session loads only the one
  the Action Summary or hand-off names, never browses the department.
- **Images only where something is flagged.** A screenshot is ~1–1.5K tokens
  and stays in context for every later turn. Read detector JSON first; open a
  PNG only for a flagged state, at most eight per round; one contact sheet
  per round, never the PNG set.
- **Hand off at a milestone when context is high, deliberately.** With the
  hand-off current, a fresh session resumes at a sixth of the cost of
  continuing at 150K+.

## Report (mandatory, every session)

Before ending, write the report at the path the system prompt gives (create
the folder if needed) and include it in your commit if you made one; if the
session made no code change, commit the report alone
(`docs(wayfinder): autopilot report for #<ticket>`). Format:

```markdown
# Autopilot report — #<ticket> <ticket title>

- Map: #<map> <map title>
- Type: <wayfinder label> · Started: <local time> · Finished: <local time>
- Outcome: resolved | blocked | partial

## What I did
<ordered list of the steps taken, with links to comments/commits/tickets>

## Questions I answered on the owner's behalf
| # | Question | Answer taken | Why (rule/evidence) |

## Decisions recorded
<gist of the resolution comment>

## Tickets created / changed
<new tickets with names, blocking edges, fog graduated or added>

## Scores and counts (rendered surfaces only)
scores: predicted-critique=<n> first-critique=<n> close-critique=<n> first-evaluate=<n> close-evaluate=<n>
<that line exactly, machine-read by scoreboard.py; then: in-page detector first-pass/close at 1440 and 390 per state · include check · which pre-build step was weak if the first pass fell short>

## First-pass findings → lessons (rendered surfaces only)
| Finding (heuristic, severity) | Lesson / contract that should have caught it | Status: none · unchecked · wrong · new class | Action taken |

## Needs the owner
<anything deferred: removals, credentials, decisions you were unsure about>
```

Keep the report factual: what happened, not what should have happened.

## Leave the machine clean

Before ending, stop anything you started that is still running — dev server,
headless Chromium, `impeccable live`, watchers — so the next ticket's session
starts on a clean machine. The driver also kills your process group when you
exit, but stopping your own processes first avoids half-written files.
