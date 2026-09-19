## Phase brief: CLOSE

Read the hand-off: the raw scores and the untriaged finding lists are on it
(the measure session records, it does not judge), the round script exists —
do not re-measure first.

**The close state lives in one file, not in your context.** Keep
`<scratch>/close.md` (create it on the first close session): the triaged
list, each fix batch with what it changed, every gate result, and the
current next step. Update it after every batch and every gate. The hand-off
carries one pointer to it and the `milestone:` lines, nothing else from
this phase — a fresh close session reads `close.md` and continues; it never
re-derives what an earlier one tried.

**Triage first, in one pass.** Go through `## Raw findings (untriaged)` and
the detector counts and label each finding: *real* (fix it in the batch),
*residue* (in the area primer's residue set — say which entry), *tooling*
(dev-server overlay such as `nextjs-portal` in the tab order, a
probe-labelling gap, a capture timing artifact — say what and how you
verified it against source), or *decision* (a Wayfinder ticket, named on
the close). Verify a `tooling` call against the code before dismissing it;
a P1 dismissed without evidence is a P1 shipped. Write the triaged list to
`close.md`, replace the raw list on the hand-off with the pointer, and
write the residue entries you relied on to `<scratch>/residue.txt` (one
regex per line) so the gate and the round script count the same way.

**A dismissed finding is re-scored, never subtracted by hand.** If the
triage removed anything the readers counted, re-run the `evaluate` reader —
and `critique` if a heuristic under 3 was driven by a dismissed finding —
as fresh `sonnet` agents on the *same* capture set, with the triaged list
and the reason each item was dismissed in their prompt, so the close score
is a number the reader produced. The `scores:` line carries only integers.

**Fix on the gate, confirm with the readers — once.** The readers are the
expensive step (a capture round, a contact sheet, three agents); most of
what a fix batch changes can be checked without them. The loop is:

1. **Batch**: fix every P1, every heuristic under 3 and every *real*
   detector finding from the triage.
2. **Gate**: servers up; run the round script as `shots-c<n>`; run
   `node scripts/wayfinder-autopilot/gate.mjs shots-c<n> --baseline
   <previous round> --residue-file residue.txt --json gate-c<n>.json`.
   It is deterministic: real detector findings outside the residue, failing
   keyboard probes (`ok: false` in `keyboard.json`), errored states, page
   errors, and findings *new since the baseline* (a fix that broke
   something). Read its summary, not the PNGs.
3. **Repeat** 1–2 on what the gate lists, at most **three gate rounds** in
   total. A finding the gate still shows after the third: record it in
   `close.md` and move on — it goes on the ticket as a named gap or a
   Wayfinder ticket, not into a fourth batch.
4. **Confirm**: on the round that passed the gate (or the third), the
   contact sheet and the three readers as fresh `sonnet` agents, exactly as
   in measure. This is the only reader run in the phase. Its scores are the
   close scores.
5. **Close at the bar.** Confirm under the bar with no P1s: close and record
   the gap. A P1 still open: update `close.md` and the hand-off, leave the
   ticket open with `Autopilot: continue —`. Never a batch to turn a 3 into
   a 4.

Fixing a P1 the readers raised, where the gate cannot see it (a copy or
flow problem, not a detector or probe finding): make the confirm round the
check for it — the readers re-score it — and if it is still open after
confirm, hand off; do not spend a second reader run in this session.

**Checks, each exactly once, dev server stopped first** (this box cannot run
them beside it — #252 lost an hour swapping): affected tests → full suite →
`tsc --noEmit` → `eslint` on the ticket's changed files → `next build`.

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
  Commit the project file with the ticket.

**Write the area primer back.** `docs/agents/areas/` holds one page per
surface family. If none exists for this area, write one; if one exists,
refresh it with what the build changed — including its **Detector residue**
section, which is what `residue.txt` was built from. Under ~80 lines, facts
only, no history. Commit it with the ticket.

**Keep the map an index.** Your *Decisions so far* entry is one line: the
ticket's linked title and a gist of ≤ 25 words. If an existing entry runs
past one line, compact it the same way while you are there.

**Definition of done** is `docs/agents/design-tickets.md` §"Implementing a
design ticket" — read that section by range before closing: the Action
Summary's skills actually run, detector in-browser with before/after counts,
`evaluate` score on the ticket, `polish` (and `audit`/`include` where
responsive, contrast or keyboard changed) closed it out.

Then the report, and close at the bar.
