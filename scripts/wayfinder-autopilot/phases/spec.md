## Phase brief: SPEC

**Classify the work by the paths it touches before anything else** (the
same rule as a CI `paths:` filter or CODEOWNERS: the files decide which
checks are owed, not the ticket's title). Draft the build plan's step list
first — name and files per step — and mark each step's kind:

- `kind: surface` — any file under `app/**` or `components/**` that renders
  (`.tsx`, `.css`; tests excluded). The step owes the design pass below and
  the detector at measure.
- `kind: backend` — everything else (`lib/`, `models/`, `prisma/`, `worker/`,
  `scripts/`, `app/api/**` routes, actions files). No Intent or Impeccable
  reads, no craft floor, no detector. It owes the **backend pass** instead:
  read `CODING_STANDARDS.md` (the backend floor) once; name the step's
  **seams** on its plan line — the public functions or routes under test
  and the test file each gets (`tdd`'s pre-agreed seams; a deletion says
  `seams: none (deletion)`); if the step adds a module or moves a boundary,
  read `codebase-design` once and write the interface (invariants, error
  modes, idempotency) into the plan; if the boundary is hard to reverse,
  surprising later and a real trade-off (the Nango boundary is), the step
  includes an ADR under `docs/adr/` (`domain-modeling`).

The pre-build pass (items 1–4) is owed **only if at least one step is
`surface`**, and scoped to those steps' states and copy. A ticket whose
steps are all backend writes one line on the hand-off — `design pass: not
owed (no surface steps)` — skips items 1–4 and G1–G2, and goes straight to
item 5 with G3 as its only gate. A mixed ticket (#380: four backend steps
and one surface step) runs items 1–4 for the surface step alone, sized to
it — not to the deletion around it. The build hook enforces the rendering
half: an `Edit`/`Write` under `app/**|components/**` is refused until the
session has read `craft-floor.md`.

**The skills are there so the first pass is right.** Before the first line of
code on a surface step, the pre-build pass is mandatory and is done
properly, not skimmed:

1. `specify` (its file, read directly — this brief is the router; the
   `intent` router costs 15K tokens to name the same four skills, and the
   hook refuses it) — screen-by-screen spec: behaviour, layout, copy,
   interaction logic, every state, accessibility. `fortify` — the full state
   inventory (empty, loading, error, partial, offline, first-run, long
   content, zero results). `articulate` — every label, empty state, error
   and confirmation written before it is coded. `include` — focus order,
   names, targets, announcements planned, not retrofitted.
   **Headcount department skills (`product:*` and `marketing:*`, files
   under *Skill files*) sit alongside these and shape the content, not just
   the form.** Read by name, at most two per session, only where they apply:
   `product:product-requirements` before `specify` on any execution ticket
   (problem and success measure before solution; scope by exclusion); and
   for a marketing-site surface (`app/(marketing)`, `components/marketing`)
   `marketing:positioning-and-messaging` before `articulate` so every
   headline, CTA and body line inherits one positioning, with
   `marketing:marketing-copywriting` for the copy itself. Where a Headcount
   skill and an Intent skill disagree on copy or scope, Intent's
   anti-pattern catalog wins; note the conflict in the spec.
2. `impeccable shape` then `layout`, `typeset`, `clarify` for the surface
   (`.claude/skills/impeccable/SKILL.md` §Setup and §How to design once,
   then each sub-command's `reference/<name>.md`; never the routing menu);
   read `.claude/skills/impeccable/reference/craft-floor.md`; read the stored
   critique of the nearest shipped surface (`.impeccable/critique/`) and the
   resolution's Action Summary.
   **Read both lessons files in full, in one Bash call** (paths are in the
   system prompt after this brief): the generic one is what every earlier
   first pass missed in any project; the project one is what this codebase
   in particular trips on.
   Each lesson that applies to this surface becomes a line in the spec now;
   the pre-flight cites it.
3. **Read the area primer** for the ticket's surface family in
   `docs/agents/areas/` — components and primitives, save grammar, routes,
   seed and capture recipe, residue, conventions — instead of the codebase
   file by file (#252 read 178 files to learn what one page says).
4. **Pre-flight — `preflight.md` next to this brief, filled completely,
   before code.** Seven parts, each there because a real first pass lost
   points: **A** two excellence targets only — H1 and H5 by default, earned
   through the Part B contracts; more only if the ticket says "beyond the
   bar"; **B** six grep-checkable contracts (action reachability + reversal,
   view freshness after every mutation, one term per concept, shell-primitive
   reuse, focus/keys/failure path per interactive surface, time-axis edges);
   **C** coverage by component type; **D** an independent spec critic — a
   fresh-context foreground `Agent` scores the spec with both rubrics as if
   it were built; its job is the *structure* (P1s, contracts, primitives),
   not the 4s. `model: "opus"` when the ticket touches money, approval,
   schema or auth; otherwise `sonnet`; **E** an explicit `evaluate`
   prediction — name the worst thing the spec still permits per heuristic
   and its severity, walk each core task (try · notice · associate · see
   progress), sweep the anti-patterns. **Gate after D: predicted zero P0/P1,
   no heuristic under 3, two 4s, Clean.** Under the gate you change the
   spec, never the code later. The filled tables are the build checklist.
5. **Write the build plan onto the hand-off** as the last act of this phase:
   ordered `step: N — ‹name› — kind: surface|backend — todo` lines, one
   per surface/state group (or per backend module group), each naming the
   spec lines it comes from, the files it touches and its check (a backend
   step's check is its seams' tests: `seams: <fn> → <file>.test.ts, …`); the three gate steps last (`G1 — round script`, `G2 — r0 and
   fixes`, `G3 — build-done`, as `phases/build.md` defines them). The build
   sessions run one step each from this plan.
6. **Size the ticket to the phases, now — before any code.** The four-phase
   run assumes each phase fits a session. The plan tells you whether it
   will: a ticket whose plan has **more than 6 build steps before the
   gates, or more than 10 states in the round** (each captured at two
   widths) will not measure or close in one session — #286's did not close
   in twelve. If the plan exceeds either limit, split *here*, at a scope
   boundary the map would recognise (a screen, a role's view, a dialog
   family): this ticket keeps the first part, and the remainder becomes a
   new child ticket of the map, labelled `wayfinder:task`, titled
   `Build …` for the same surface family, blocked by this ticket, with the
   spec lines and plan steps it inherits named in its body. Post a comment
   on this ticket saying what moved and why, trim the plan to what stays,
   and carry on. This is the one place a build ticket is split: never in a
   build or close session to fit a context, only at spec to fit the phases.
   The spec critic checks the sizing as part of D.

**Score the new UI, not the old one.** The incumbent may be critiqued as
*evidence* for the spec (what the old surface got wrong), never as a number
to beat. The only scores that count are the new UI's, measured after build.

No dev server, no browser, no product code in this phase. End by writing the
hand-off with `milestone: spec-done`, committing (`wip(autopilot): #<ticket>
spec`), and stopping.
