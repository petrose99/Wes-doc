# Wayfinder autopilot brief

You are running **unattended** inside `scripts/wayfinder-autopilot/run.sh`. The
owner of this repo started the loop and is not at the keyboard. Nobody will
answer a question; a session that waits for a human never finishes.

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

**One fix batch, then ship — a second only if the first removed a P1** (fixing
a P1 changes enough that the confirm can't stand in for it). Sequence: first
measurement → batch fixing every P1 and every heuristic under 3 → confirming
measurement → close at the bar. Confirm under the bar with no P1s: close and
record the gap. A P1 still open after the allowed batches: leave the ticket
`Autopilot: partial —` as a hand-off (the driver retries on the stronger
model). Never a batch to turn a 3 into a 4.

**The skills are there so the first pass is right.** Before the first line of
code on an execution ticket, the pre-build pass is mandatory and is done
properly, not skimmed:

1. `intent specify` — screen-by-screen spec: behaviour, layout, copy,
   interaction logic, every state, accessibility. `fortify` — the full state
   inventory (empty, loading, error, partial, offline, first-run, long
   content, zero results). `articulate` — every label, empty state, error
   and confirmation written before it is coded. `include` — focus order,
   names, targets, announcements planned, not retrofitted.
2. `impeccable shape` then `layout`, `typeset`, `clarify` for the surface;
   read `craft-floor.md`; read the stored critique of the nearest shipped
   surface (`.impeccable/critique/`) and the resolution's Action Summary.
   **Read both lessons files in full** (paths are given in the system
   prompt line after this brief): the generic one is what every earlier
   first pass missed in any project; the project one is what this codebase
   in particular trips on (shell, tokens, seed data, dev-server recipe).
   Each lesson that applies to this surface becomes a line in the spec now;
   the pre-flight (step 3) cites it.
3. **Pre-flight — `preflight.md` next to this brief, filled completely,
   before code.** It has seven parts and each exists because a real first
   pass lost points there: **A** two excellence targets only — H1 and H5 by
   default, earned through the Part B contracts, not extra work; more only if
   the ticket says "beyond the bar"; **B** six contracts that are grep-checkable
   (action reachability + reversal, view freshness after every mutation, one
   term per concept, shell-primitive reuse, focus/keys/failure path per
   interactive surface, time-axis edges); **C** coverage by component type;
   **D** an independent spec critic — a fresh-context `Agent` scores the spec
   with both rubrics as if it were built; its job is the *structure* (P1s,
   contracts, primitives), not the 4s. Run it with `model: "opus"` when the
   ticket touches money, approval, schema or auth; otherwise the default; **E** an explicit `evaluate`
   prediction — it scores the *worst* issue per heuristic, so name the worst
   thing the spec still permits and its severity, walk each core task with
   the four questions (try · notice · associate · see progress), sweep the
   anti-patterns. **Gate after D: predicted zero P0/P1, no heuristic
   under 3, two 4s, Clean.** Under the gate you change the spec, never the code later.
   The filled tables are then the build checklist, row by row.
4. Build the whole surface from the tables, all states included, with the
   detector hook fixing findings as they appear. **Before the first
   measurement, run the Part B contract checks** (reachability grep, string
   extraction, primitive diff, focus probe) and fix what they show — that is
   lint, not scoring. Then take the first critique and evaluate untouched.

**One capture pass per round, shared by every skill.** A round is one Playwright
run producing a named set — every state × 1440 and 390 as PNGs, the in-page
detector JSON per state, and the keyboard probe results — saved in the ticket's
scratch folder. `critique`, `evaluate` and `include` all read *that set*; none
of them opens its own browser. Re-capture only after code changes (the next fix
batch), never because a second skill wants to look. Two rounds per fix batch
at most: first pass, and confirm.

**Look at pixels only where something is flagged.** Screenshots enter your
context as images at ~1–1.5K tokens each; #252 read 66 of them. Per round,
read the detector JSON first; open a PNG only for a state the detector or the
critic flagged, or for the one representative screen per component type you
need for the critique's design-specificity judgement. Everything else stays on
disk, referenced by filename. Never re-read an image you have already seen
unless the code under it changed.

**Tests: affected until the close, full once.** During build and fix batches
run only the test files that touch what you changed (`vitest <paths>` or
`--changed`). The full suite and `next build` run exactly once, at the close.

**Keep the map an index.** When you append to *Decisions so far*, your entry is
one line: the ticket's linked title and a gist of ≤ 25 words — the detail is
already on the ticket. If any existing entry runs past one line, compact it the
same way while you are there (title link + gist; nothing is lost, the ticket
holds it). Every session loads the whole map; a long one taxes all of them.

**Then score the new UI — and the gap between predicted and measured is the
KPI.** The report shows reconciled prediction vs first pass vs close, per
heuristic, for both scorecards (`preflight.md` Part G). Every heuristic where
measured < predicted is a lesson in the precise form Part G gives (which check was marked covered, by
what, and what the critic found instead). A P1 found that the pre-flight
predicted away means a Part B row was filled optimistically; say which. Then work the remaining findings in
batches (build fully, inspect once at both widths, fix everything shown,
confirm once) until the bar above is met, and record the after-counts.

- **Write the lessons back — to the right file.** At close, append one line
  per correction the fix loop made that the pre-build should have caught
  (heuristic, what was missed, what to do at spec time). A lesson that would
  hold in any product goes to the **generic** file; one that only holds in
  this codebase goes to the **project** file. Merge with an existing line
  when it is the same lesson, and keep each file under ~80 lines — the files
  are read whole every session, so they stay short by generalising, not by
  forgetting. Commit the project file with the ticket. A session whose first
  pass met the bar still records what nearly slipped.
- Findings with a real decision behind them become a Wayfinder ticket named
  on the close, with the score they cost. A finding without a decision is
  fixed, never parked.
- **A session is one context, and the driver caps it at 150K tokens and
  3h30.** Plan the ticket to fit: pre-flight, build, one measurement round,
  close. If while filling the pre-flight you can see the work is more than
  one session (many screens, a schema change plus a surface, two queues),
  **split it before building**: create a child `wayfinder:task` ticket for
  the second half (blocked by this one), narrow this ticket's scope in a
  comment, and build the first half to the bar. Reaching the cap mid-build is
  the expensive way to split; the driver will commit your tree as WIP and
  hand off, but the next session pays to rediscover where you were.
- If the bar cannot be reached in this session, **leave the ticket open**
  with an `Autopilot: partial —` comment and commit what you have. The driver
  retries on a stronger model, so write the comment as a hand-off: current
  scores per heuristic, the path to the filled `preflight.md`, what is built
  and verified, the open findings by heuristic, and what you would do next.
- **Score the new UI, not the old one.** A grilling ticket may critique the
  incumbent as *evidence* for its recommendations (what the old surface got
  wrong), never as a number to beat — the grilling is about to change what
  the surface is. Skip it entirely when the surface is being replaced. A
  decision ticket's report says "no score; surface not built yet". On an
  execution ticket the only scores that count are the new UI's.

## Report (mandatory, every session)

Before ending, write the report at the path the system prompt gives (create
the folder if needed) and include it in your commit if you made one; if the
session made no code change, commit the report alone
(`docs(wayfinder): autopilot report for #<ticket>`). Format:

```markdown
# Autopilot report — #<ticket> <ticket title>

- Map: #<map> <map title>
- Type: <wayfinder label> · Started: <UTC> · Finished: <UTC>
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
<first-pass critique and evaluate (the KPI) · close critique and evaluate · in-page detector first-pass/close at 1440 and 390 per state · include check · which pre-build step was weak if the first pass fell short>

## Needs the owner
<anything deferred: removals, credentials, decisions you were unsure about>
```

Keep the report factual: what happened, not what should have happened.

## Leave the machine clean

Before ending, stop anything you started that is still running — dev server,
headless Chromium, `impeccable live`, watchers — so the next ticket's session
starts on a clean machine. The driver also kills your process group when you
exit, but stopping your own processes first avoids half-written files.
