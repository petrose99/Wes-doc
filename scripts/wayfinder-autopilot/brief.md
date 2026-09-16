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

## The bar is high, and the first build must already be near it

The owner's bar for closing a rendered-surface ticket (stricter than
`CLAUDE.md`'s floor):

- `critique` **≥ 34/40**, no heuristic under 3.
- `evaluate` **≥ 90/100**, no heuristic above 1, anti-pattern verdict Clean.
- Every real in-page detector finding cleared at 1440 and 390 (list and
  pane-open); only the documented app-wide residue may remain, named.
- `include`: keyboard flow verified live at both widths.

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
3. **Pre-flight against the scorecards.** Before building, walk the ten
   `critique` heuristics and the `evaluate` heuristics against the spec and
   write one line each: what in the spec earns a 4 / a 0-issue. A heuristic
   with no answer is a hole in the spec — fix the spec, not the code later.
4. Build the whole surface to that spec, all states included, with the
   detector hook fixing findings as they appear.

**Then score the new UI — and the first score is a KPI.** The report records
the first-pass `critique` and `evaluate` numbers separately from the close
numbers. A first pass under 30/40 or 80/100 means the pre-build pass was
skipped or shallow; say which step was weak and what it missed, so the next
ticket's pre-build learns from it. Then work the remaining findings in
batches (build fully, inspect once at both widths, fix everything shown,
confirm once) until the bar above is met, and record the after-counts.

- Findings with a real decision behind them become a Wayfinder ticket named
  on the close, with the score they cost. A finding without a decision is
  fixed, never parked.
- If the bar cannot be reached in this session, **leave the ticket open**
  with an `Autopilot: partial —` comment stating current scores, what is
  fixed and what remains; commit what you have. The driver will come back.
- **Score the new UI, not the old one.** A grilling ticket may critique the
  incumbent as *evidence* for its recommendations (what the old surface got
  wrong), never as a number to beat — the grilling is about to change what
  the surface is. Skip it entirely when the surface is being replaced. A
  decision ticket's report says "no score; surface not built yet". On an
  execution ticket the only scores that count are the new UI's.

## Report (mandatory, every session)

Before ending, write `docs/wayfinder-reports/<map>/<ticket>.md` (create the
folder if needed) and include it in your commit if you made one; if the
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
