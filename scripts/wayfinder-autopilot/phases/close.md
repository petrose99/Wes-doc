## Phase brief: CLOSE

Read the hand-off: the raw scores and the untriaged finding lists are on it
(the measure session records, it does not judge), the round script exists —
do not re-measure first.

**Triage first, in one pass.** Go through `## Raw findings (untriaged)` and
the detector counts and label each finding: *real* (fix it in the batch),
*residue* (in the named app-wide/shared-component residue set — say which
entry), *tooling* (dev-server overlay such as `nextjs-portal` in the tab
order, a probe-labelling gap, a capture timing artifact — say what and how
you verified it against source), or *decision* (a Wayfinder ticket, named
on the close). Verify a `tooling` call against the code before dismissing
it; a P1 dismissed without evidence is a P1 shipped. Write the triaged list
to the hand-off, replacing the raw one, before the first edit.

**A dismissed finding is re-scored, never subtracted by hand.** If the
triage removed anything the readers counted (a tooling artifact, a residue
entry), re-run the `evaluate` reader — and `critique` if a heuristic under 3
was driven by a dismissed finding — as fresh `sonnet` agents on the *same*
capture set, with the triaged list and the reason each item was dismissed
in their prompt, so the close score is a number the reader produced. The
`scores:` line carries only integers; "50 read as pass" is not a score and
breaks the scoreboard. If the re-scored number is still under the bar, the
fix batch or an `Autopilot: continue —` follows, as for any other gap.

**One fix batch, then ship — a second only if the first removed a P1**
(fixing a P1 changes enough that the confirm can't stand in for it).
Sequence: the batch fixing every P1, every heuristic under 3 and every real
detector finding → the confirming round with the same round script and the
readers re-run on it (fresh `sonnet` agents on the contact sheet + JSON, as
in measure) → close at the bar. Confirm under the bar with no P1s: close and
record the gap. A P1 still open after the allowed batches: update the
hand-off, leave the ticket open with `Autopilot: continue —`. Never a batch
to turn a 3 into a 4.

**Checks, each exactly once, dev server stopped first** (this box cannot run
them beside it — #252 lost an hour swapping): affected tests → full suite →
`tsc --noEmit` → `eslint` → `next build`.

**Findings split two ways.** A finding with a real decision behind it
becomes a Wayfinder ticket named on the close, with the score it costs. A
finding without a decision is fixed, never parked.

**The gap between predicted and measured is the KPI.** The report shows
reconciled prediction vs first pass vs close, per heuristic, for both
scorecards (`preflight.md` Part G). Every heuristic where measured <
predicted is a lesson in Part G's form (which check was marked covered, by
what, and what the reader found instead). A P1 the pre-flight predicted away
means a Part B row was filled optimistically; say which.

- **Attribute every first-pass finding before writing lessons.** For each
  finding the first critique/evaluate raised, name the lesson or contract
  that should have caught it and its status: *none* (write one, with its
  `check:`), *unchecked* (existed as prose, not applied — convert to a
  check), *wrong* (applied and still missed — rewrite it), or *new class*
  (nothing could have caught it — say why). The table goes in the report;
  the lessons files change only through it.
- **Write the lessons back — to the right file, each with its `check:`.**
  One line per correction the fix loop made that the pre-build should have
  caught. Generic (holds in any product) → the generic file; codebase-only →
  the project file. Merge with an existing line when it is the same lesson;
  keep each file under ~80 lines — they are read whole by the spec phase.
  Commit the project file with the ticket. A first pass that met the bar
  still records what nearly slipped.

**Write the area primer back.** `docs/agents/areas/` holds one page per
surface family. If none exists for this area, write one; if one exists,
refresh it with what the build changed. Under ~80 lines, facts only, no
history. Commit it with the ticket.

**Keep the map an index.** Your *Decisions so far* entry is one line: the
ticket's linked title and a gist of ≤ 25 words. If an existing entry runs
past one line, compact it the same way while you are there.

**Definition of done** is `docs/agents/design-tickets.md` §"Implementing a
design ticket" — read that section by range before closing: the Action
Summary's skills actually run, detector in-browser with before/after counts,
`evaluate` score on the ticket, `polish` (and `audit`/`include` where
responsive, contrast or keyboard changed) closed it out.

Then the report, and close at the bar.
