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
hand-off — flip `todo` to `done` on the step line, update `## Next step`,
and nothing else (no notes under the step; what you verified goes in the
commit message) — commit (`wip(autopilot): #<ticket> build step N`), and
stop — the next step is the next session's, in a fresh context.

**Ponytail's ladder governs the code, the spec governs the scope.** The
session starts with the ponytail ruleset (YAGNI, reuse before write, one
line before ten). Climb it for every piece of code: the shell primitives and
helpers the area primer names are rung 2, never rewritten. What it may never
cut is the "explicitly requested" set: every state in the spec's tables,
every Part B contract, the craft floor, accessibility. A state the spec
names is not YAGNI.

**Part B is lint, not scoring.** Before a step is `done`, the Part B
contracts it touches are checked the grep-able way the pre-flight names
(reachability grep, string extraction, primitive diff, focus probe) and what
they show is fixed in place.

**The build gate is the last three steps, not one.** On #285 and #286 the
gate as a single step ran 66 minutes and crossed the hand-off line; as
three it fits. The plan ends with:

- `step: G1 — round script` — seed and servers up in one call; write the
  ticket's round script on `scripts/wayfinder-autopilot/capture-round.mjs`:
  every state at **both 1440 and 390**, detector JSON, and a keyboard probe
  for every Part B focus/keyboard contract (a B line is ticked only by a
  probe that exercised it, never from the spec text). **Every probe records
  its own verdict**: `keyboard("name", { ok: <bool>, reason, seq })` — the
  script compares what the walk reached against what the contract says,
  so the gate can fail it without a reader. Copy the area primer's
  *Detector residue* lines to `<scratch>/residue.txt` and pass the same
  regex to the round's `residue` option. Run it once to prove it executes
  end to end; do not start fixing what it shows. Stop the servers; `done`;
  commit.
- `step: G2 — r0 and fixes` — servers up; run the round as `shots-r0`; run
  `node scripts/wayfinder-autopilot/gate.mjs shots-r0 --residue-file
  residue.txt` and fix what it lists — real detector findings, failing
  probes, errored states, page errors — in place (pure execution, no
  readers); re-run only the states you touched and gate again; write the
  gate's counts per width to the hand-off. If the fixes outgrow the session,
  hand off with the gate output as the list of what is left — this is the
  one gate step that may take two sessions. Stop the servers; `done`;
  commit.
- `step: G3 — build-done` — `tsc --noEmit` once, full project, servers
  stopped; the Part B contract checks over the whole surface (reachability
  grep, string extraction, primitive diff); write `milestone: build-done`,
  commit (`wip(autopilot): #<ticket> build`), stop.

The measure session reuses the round script from G1. No critique, no
evaluate, no include readers in any gate step — those are the next
session's.

**The area primer is the map of this surface family.** Read it before the
codebase; if this step changes what it says (a new primitive, a route, a
seed recipe), note that on the hand-off for the close phase to write back.
