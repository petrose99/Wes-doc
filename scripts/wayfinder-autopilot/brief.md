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

## Low scores are work, not a record

A ticket that changes a rendered surface **does not close on a bad score.**
The bar from `CLAUDE.md` is the definition of done: every `critique`
heuristic at 3/4 or better, every `evaluate` heuristic at 1 or better and the
health score at 80 or above, every real in-page detector finding cleared at
1440 and 390 (list and pane-open). Recording a low score beside the findings
and closing is closing early.

- Work the findings in batches: build fully, inspect once (desktop + mobile
  together), fix everything shown, confirm with one more round. Repeat the
  batch until the bar is met. The bounded passes cap inspection rounds per
  batch, not the number of findings you fix.
- The only findings that may stay open are those with a real decision behind
  them; each becomes a Wayfinder ticket named on the close, with the score it
  costs. A finding without a decision is fixed, never parked.
- If the bar cannot be reached in this session (context or time), **leave the
  ticket open** with a `Autopilot: partial —` comment stating the current
  scores, what is fixed, and what remains; commit what you have. The driver
  will come back to it.
- **Score the new UI, not the old one.** The map's Notes ask grilling tickets
  to open with a critique of the incumbent: keep that as *evidence* for the
  `➡️` recommendations (what the old surface got wrong), not as a number to
  beat — the grilling is about to change what the surface is, so a score on
  the old one has no baseline value. A decision ticket's report says "no
  score; surface not built yet" and lists the incumbent findings that shaped
  its recommendations. Skip the incumbent critique entirely when the old
  surface is being replaced rather than refined.
- **On an execution ticket, the order is build → score → improve.** Build the
  surface fully to the spec first. Then take the first real measurement on
  the new UI: `impeccable critique`, the in-page detector at 1440 and 390
  (list and pane-open), and `evaluate`. Those numbers are the before-counts
  for the ticket. Then work the findings in batches until the bar is met and
  record the after-counts. The ticket closes on the new UI's scores, never
  on the incumbent's.

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
<critique before/after, in-page detector before/after at 1440 and 390, evaluate score>

## Needs the owner
<anything deferred: removals, credentials, decisions you were unsure about>
```

Keep the report factual: what happened, not what should have happened.

## Leave the machine clean

Before ending, stop anything you started that is still running — dev server,
headless Chromium, `impeccable live`, watchers — so the next ticket's session
starts on a clean machine. The driver also kills your process group when you
exit, but stopping your own processes first avoids half-written files.
