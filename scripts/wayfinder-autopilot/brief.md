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

This core brief is the same for every session. The driver appends one
**phase brief** after it (`phases/spec.md`, `build.md`, `measure.md`,
`close.md`, or `single.md` for an unphased ticket) — that is your
instruction set for this session; the other phase briefs are on disk beside
it, opened by range only if your work crosses into that phase.

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
- New `Build …` tickets you create or graduate are sized to the phases: one
  surface family, at most six build steps and ten captured states. A larger
  build is several tickets chained by blocking.

## The bar: solid, no rework, not perfection

The owner's bar for closing a rendered-surface ticket:

- `evaluate`: **zero P0/P1**, health **≥ 85**, anti-pattern verdict Clean.
- `critique`: **≥ 32/40, no heuristic under 3** — i.e. two 4s. Take them
  where the contracts already pay for them: H1 (view freshness on every
  mutation, B2) and H5 (confirm-with-consequence on every ⚠ action, B1) are
  4s by construction if Part B is honoured. Don't chase a third.
- In-page detector cleared to the named app-wide residue at 1440 and 390 —
  `gate.mjs` clean.
- `include`: keyboard flow verified live at both widths.

If the bar cannot be reached in this session, **leave the ticket open** with
an `Autopilot: continue —` comment, the hand-off file updated and the tree
committed.

## Sessions, phases and the hand-off

**A build ticket runs as four phases, each a fresh session** — spec →
build (one plan step per session) → measure → close — read off the
hand-off file's `milestone:` lines. Do only your phase; the phase brief
says how it ends. Do not start the next phase because there is context
left: the fresh context is the saving.

**A session is one context; a ticket is not.** The whole ticket ships over
as many sessions as it takes. A build or close session never narrows,
defers or splits the scope to fit a context; the only split is the spec
phase's sizing step, before any code. **Keep the hand-off file current at
every milestone** and commit WIP with it (`wip(autopilot): #<ticket>
<milestone>`), so a hard cap loses nothing.

**The hand-off is pointers, under ~80 lines** (the hook refuses 120):
`milestone:` lines, the exact next step, and paths — spec, pre-flight,
plan, captures, scores, `close.md`. Narrative, per-session history and
finding lists live in the scratch folder's files, never here: every session
re-reads this file whole. A continuation session reads it first and does
not redo what it records as done.

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
tests in 45K. A hook enforces the read rules below (a denied call comes
back with the reason; do what it says, do not retry the same call).

- **Every turn calls a tool.** A text-only turn re-reads the context for
  nothing. Do not announce what you are about to do — do it. Put independent
  tool calls in the same turn. The only text-only turn is the last one.
- **Read ranges, never whole files.** `grep -n` first, then `Read` with
  offset+limit (or `sed -n a,bp`) of the lines you need; files over ~220
  lines cannot be read whole. A persisted "output too large" file is
  grepped or tailed, never read back whole. The area primer in
  `docs/agents/areas/` says what a surface family is made of — read it
  instead of the codebase file by file.
- **One script per step, not one command per fact.** Put a multi-step check
  in a `.mjs`/`.py` file and run it once; read the summary.
- **Recon through `Explore`.** A foreground `Explore` agent returns the
  answer; the files it read stay out of your context.
- **Skills by name on a continuation.** The spec session ran the `intent`
  and `impeccable` routers; later sessions load the specific skills the plan
  names (`specify`, `fortify`, `articulate`, `include`; the Impeccable
  sub-command) and read `craft-floor.md`, not the routers again — the hook
  refuses `intent` and `impeccable shape` once a hand-off exists. The same
  holds for the Headcount department skills (`product:*`, `marketing:*`):
  the spec session picks them; later sessions load only the one the Action
  Summary or hand-off names.
- **Deterministic checks before readers.** The gate (`gate.mjs`), `tsc`,
  the tests and the Part B greps answer most questions for a few hundred
  tokens; a reader agent on a contact sheet costs a capture round and three
  agents. Fix on the gate; confirm with the readers once.
- **Images only where something is flagged.** A screenshot is ~1–1.5K tokens
  and stays in context for every later turn. Read the gate's summary and
  detector JSON first; open a PNG only for a flagged state, at most eight
  per round (the hook stops the session at ten); one contact sheet per
  round, never the PNG set. Readers (`Agent`) look at images in their own
  context, not yours.
- **Agents return pointers, not transcripts.** Any `Agent` you launch
  writes its full output to a file in the scratch folder and returns the
  path plus a summary under ~15 lines (scores, counts, the P0/P1 list).
  A reader's full finding list pasted into your context is paid for on
  every later turn; a file is read by range when it is needed.
- **Hand off at a milestone when context is high, deliberately.** With the
  hand-off current, a fresh session resumes at a sixth of the cost of
  continuing at 150K+.

## Report (mandatory, every session)

Before ending, write the report at the path the system prompt gives (create
the folder if needed) and include it in your commit if you made one; if the
session made no code change, commit the report alone
(`docs(wayfinder): autopilot report for #<ticket>`). The format is in
`scripts/wayfinder-autopilot/report.md` — read it once, at the end, not
before. Keep the report factual: what happened, not what should have
happened.

## Leave the machine clean

Before ending, stop anything you started that is still running — dev server,
headless Chromium, `impeccable live`, watchers — so the next ticket's session
starts on a clean machine. The driver also kills your process group when you
exit, but stopping your own processes first avoids half-written files.
