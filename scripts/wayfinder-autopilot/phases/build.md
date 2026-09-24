## Phase brief: BUILD

**One plan step per session.** The hand-off carries the build plan: ordered
`step: N — ‹name› — kind: surface|backend — todo|done` lines with the spec
lines, files and check for each. **The kind decides what the step owes** (a
path filter, not a judgement call — see phases/spec.md "Classify"): a
`surface` step (renders under `app/**` or `components/**`) reads
`craft-floor.md` whole and the Intent digests the spec's Action Summary
named (`fortify` for its states, `articulate` for its words) before its
first edit, and builds with the detector hook on; a `backend` step reads
none of that. It runs the **backend loop** instead: `CODING_STANDARDS.md`
once (it is the floor; a rule there is a P0/P1, not a style), then for each
seam on the step line a test written **red first** at that seam, the code
to make it green, `vitest <paths>`, then a `simplify` pass over the diff
(reuse before write, one line before ten) and `tsc --noEmit`. Tests
travel with code: the hook refuses a commit that changes `lib/`, `models/`
or `worker/` logic without a `.test.ts` in the same commit unless the
subject says `no-test: <reason>` (a pure deletion, a mechanical rename). A step line
without a `kind:` (a plan written before this rule) is classified now from
its file list and the line amended. The hook refuses an `Edit`/`Write` of a
rendering file until `craft-floor.md` has been read this session; it never
touches a backend path. If the plan is not there (a spec that predates it), write it first from
the spec's tables and then build step 1. Otherwise build the **first `todo`
step only**: read the hand-off, then the spec sections and pre-flight parts
that step names by line range, the one area primer for this surface, and any
reused component by the symbols you call (grep, then a bounded range;
there is no `Agent` in a build session — grep is the recon). Build
it from the tables, every state the step covers, with the detector hook
fixing findings as they appear. Run its check and the affected tests
(`vitest <paths>`; never the full suite here). Mark the step `done` on the
hand-off — flip `todo` to `done` on the step line, update `## Next step`,
and nothing else (no notes under the step; what you verified goes in the
commit message) — commit (`wip(autopilot): #<ticket> build step N`).

**Then read the context meter before stopping.** `cat "$WAYFINDER_CTX_FILE"`
prints `<tokens> <hand-off line>`. If tokens are under **55000** and the
next `todo` step is a numbered one (not G1–G3), build it now, in this
session, the same way — re-orientation from a fresh context costs ~1.4M
billed tokens and ~40 turns per session on #270, more than a small step
itself. Otherwise stop: the next step is the next session's. Never start a
step past 55K, never start a gate step after a numbered one.

**Ponytail's ladder governs the code, the spec governs the scope.** The
ruleset is these three rungs, nothing else is injected: YAGNI (build only
what the spec names), reuse before write (a primer primitive before a new
helper, a new helper before a new file), one line before ten. Climb it for
every piece of code: the shell primitives and
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

- `step: G1 — round script` — servers up with **one** call, `node
  .impeccable/live/dev.mjs start <ws>` (dev server :3000 + the :8400
  in-page detector, waits for both, preps the workspace), then the seed
  script the area primer names; `dev.mjs stop` at the end. Never `npm run
  dev`, `nohup`, `setsid`, a background call, `impeccable live-server` or
  a livesrv/start-live-server script — the hook refuses them (#270's G1
  lost 20 turns, #266's G2 two sessions, finding this out). Write the
  ticket's round script on `scripts/wayfinder-autopilot/capture-round.mjs`:
  `roundArgs()` for its arguments, every state at **both 1440 and 390**,
  detector JSON, and a probe for every Part B focus/keyboard contract (a B
  line is ticked only by a probe that exercised it, never from the spec
  text). **Probes use only the shared helpers on `s`** — `focusIs`,
  `visible`, `hidden`, `count(sel, within)`, `dialog()`, `waitFor`,
  `tabWalk`, `press`, `uniqueFile` for any upload fixture — and record
  their own verdict with `s.probe("name", ok, reason)`; the hook refuses a
  round script with hand-rolled probe code. The round fails fast if a
  server is down, so a `detector-error` on every state is never a finding. Copy the area primer's
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

## Implementation minimalism (build phase only)

**Precedence.** Intent decides what exists and how it behaves; Impeccable
decides how it renders; the ticket's decisions and `craft-floor.md` are the
bar. This section decides only *how much code* it takes to reach that bar.
Where the two seem to disagree, the design bar wins and the implementation
stays minimal. "Complete" means every designed state ships, never that more
code ships. Never trim a designed state, a copy string, a keyboard path or
an accessibility name to save lines.

Adapted from [Ponytail](https://github.com/dietrichgebert/ponytail) (MIT),
`full` mode. You are a lazy senior developer: lazy means efficient, not
careless. The best code is the code never written.

Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? The ticket says what does; nothing else.
2. Does it already exist in this codebase? Reuse the helper, util, model or
   primitive that is already here (`components/ui`, `models/*`, `lib/*`);
   never re-write it.
3. Does the standard library already do this? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the
step, the hand-off and the code it touches, trace the real flow end to end,
then climb.

Bug fix = root cause, not symptom. Grep every caller of the function you
touch and fix the shared function once.

Rules:

- No abstractions that the ticket did not ask for. No new dependency if it
  can be avoided. No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins, once you understand the problem. The smallest
  change in the wrong place is a second bug.
- Pick the edge-case-correct option when two approaches are the same size.
- Mark a deliberate simplification with a known ceiling with a `ponytail:`
  comment naming the ceiling and the upgrade path.

Not lazy about: understanding the problem, input validation at trust
boundaries, error handling that prevents data loss, security, accessibility,
every state the ticket designed, anything the ticket explicitly requested.
Non-trivial logic leaves one runnable check behind (one small test file in
the project's existing test style); trivial one-liners need none.
