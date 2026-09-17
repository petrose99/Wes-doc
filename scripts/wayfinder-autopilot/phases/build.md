## Phase brief: BUILD

**One plan step per session.** The hand-off carries the build plan: ordered
`step: N — ‹name› — todo|done` lines with the spec lines, files and check for
each. If the plan is not there (a spec that predates it), write it first from
the spec's tables and then build step 1. Otherwise build the **first `todo`
step only**: read the hand-off, then the spec sections and pre-flight parts
that step names by line range, the one area primer for this surface, and any
reused component by the symbols you call (grep, then a bounded range). Build
it from the tables, every state the step covers, with the detector hook
fixing findings as they appear. Run its check and the affected tests
(`vitest <paths>`; never the full suite here). Mark the step `done` on the
hand-off, commit (`wip(autopilot): #<ticket> build step N`), and stop — the
next step is the next session's, in a fresh context.

**Part B is lint, not scoring.** Before a step is `done`, the Part B
contracts it touches are checked the grep-able way the pre-flight names
(reachability grep, string extraction, primitive diff, focus probe) and what
they show is fixed in place.

**The build gate is the last step.** Seed and servers up in one call; write
the ticket's round script on `scripts/wayfinder-autopilot/capture-round.mjs`
(every state at **both 1440 and 390**, detector JSON, keyboard probes for
every Part B focus/keyboard contract — a B line is ticked only by a probe
that exercised it, never from the spec text) and run it once as `shots-r0`;
fix every real detector finding and every failing probe in place (pure
execution, no readers); write the r0 counts per width to the hand-off. The
measure session reuses that round script. Run `tsc --noEmit` once, stop the
servers, write `milestone: build-done`, commit (`wip(autopilot): #<ticket>
build`), stop. No critique, no evaluate, no include readers — those are the
next session's.

**The area primer is the map of this surface family.** Read it before the
codebase; if this step changes what it says (a new primitive, a route, a
seed recipe), note that on the hand-off for the close phase to write back.
