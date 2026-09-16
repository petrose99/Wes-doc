# Pre-flight — make the first build score, on purpose

Evidence from three autopilot builds: first passes came in at 26–28/40 with
**no heuristic at 4** (seven or eight 3s, two or three 2s) and `evaluate` at
68–81 with 4 P1s. Ten 3s is 30 — the bar of 34 is unreachable without at least
four 4s. And every 2 and every P1 fell into one of six recurring classes that a
spec can state as a contract and a grep can verify. This pre-flight does both.
Copy it into the ticket's scratch folder and fill it **before the first line of
code**; attach the filled file to the report.

---

## Part A — Two excellence targets (H1 and H5 by default; they fall out of Part B)

The critic's 4 is *"every action confirms" · "escape everywhere" · "fully
consistent" · "errors nearly impossible" · "everything discoverable"*. A 4 does
not happen by coverage; it is designed for. Pick **at least six** heuristics to
build to 4 on this surface, and for each write what 4 concretely looks like
*here*, using the rubric's 4-row as the sentence to satisfy. The other four are
built to a solid 3 (no primary gap).

| H | Target | What a 4 looks like on this surface (concrete elements) | Where it is in the spec |
|---|---|---|---|
| H1 Status | 4 / 3 | e.g. every mutation → row + pane + footer + toast update in the same tick; counts on every tab; location in title and nav | |
| H2 Real world | 4 / 3 | e.g. every noun is the glossary term, every verb the operator's verb; order = the operator's order | |
| H3 Control | 4 / 3 | e.g. undo or reversal on every state change; Cancel + Esc + focus-return on every dialog; Clear on every filter/selection | |
| H4 Consistency | 4 / 3 | e.g. only shell primitives; one casing rule; one name per act on button, dialog title, toast | |
| H5 Prevention | 4 / 3 | e.g. every destructive action confirmed with consequence copy; every input constrained; ineligible rows visibly undecidable | |
| H6 Recognition | 4 / 3 | e.g. no icon without label; hints at the hard fields; recent/last-used where the operator returns | |
| H7 Efficiency | 4 / 3 | e.g. shortcuts on the frequent actions with a `?` sheet; bulk on every list; select-all-eligible | |
| H8 Minimal | 4 / 3 | e.g. one hierarchy per screen; no column that repeats one value; no empty KPI | |
| H9 Recovery | 4 / 3 | e.g. every error at its source, names the problem and the fix, keeps the input | |
| H10 Help | 4 / 3 | e.g. the rule taught where it bites (empty state, dialog description, first-run); `?` reachable | |

Fill two rows, not ten: H1 (every mutation updates every view in the same tick
— B2) and H5 (every ⚠ action confirmed with its consequence, inputs
constrained — B1). Both are 4s by construction when Part B is honoured, so they
cost nothing extra. The other eight are built to a solid 3. Gate: predicted
≥ 32 with none under 3. More 4-targets only when the ticket says "beyond the
bar".

Heuristics the mode makes `n/a` (H7/H10 on Persuade surfaces) are stated, not
skipped silently. On Operate surfaces all ten apply.

---

## Part B — Contracts (fixes the recurring 2s and P1s; each is grep-checkable)

Fill every table. Each row is later verified against the code **before** the
first measurement — that verification is allowed (it is linting, not scoring).

### B1 · Action reachability and reversal
Every action the spec names must have a reachable control and a stated reversal.
Dead paths (a server action with no caller) were a P1 on #251.

| Action | Control (component, label) | Destructive? | Confirmation copy names the consequence? | Reversal (undo / reverse action / none + why) |
|---|---|---|---|---|

Check before measuring: every exported server action has ≥ 1 UI caller
(`grep -rn <name> components app`); every ⚠ action has a confirm; every
"reversible" claim has a control.

### B2 · View freshness after every mutation
Stale views were H1 = 2 on #251 (row, pane and footer still said Pending).

| Mutation | Every view that shows the entity (row · pane header · footer · badge · count · toast) | Update mechanism (revalidate / router.refresh / optimistic per CONTEXT rule) | Same tick? |
|---|---|---|---|

### B3 · Vocabulary (one term per concept, one casing)
Drift was H4 = 2 on #251 and a P1 on #252 ("Pay From" vs "Payer account";
"Create batch" / "Create payment batch" / "Batch created"; Title Case vs
sentence case in one column).

| Concept | The one term (CONTEXT.md glossary) | Appears on (button · title · toast · column · empty state) | Casing |
|---|---|---|---|

Check before measuring: extract every user-visible string in the new files;
no two strings name the same concept differently; casing rule uniform; every
domain noun is in CONTEXT.md or added to it.

### B4 · Primitive reuse (no bespoke component beside a shell one)
Two design systems on one tree was H4 = 1 on #252.

| Need (dialog · sheet · panel · table · pill · tabs · toggle · form bar…) | Shell primitive used (path) | New primitive? → why the shell one cannot serve, and `extract` ticket |
|---|---|---|

Rule: a new primitive needs a stated reason; "faster to write" is not one.

### B5 · Focus, keys and failure path per interactive surface
Focus never entering a ConfirmDialog and a bare `<a>` landing on a 409 text page
were P1s.

| Surface (dialog · sheet · popover · link · download · form) | Initial focus | Trap + Esc + return-to | Keys | On 4xx / 5xx / network: what the user sees, input preserved? |
|---|---|---|---|---|

### B6 · Time-axis and concurrency edges (`fortify`)
A discount lapsing between batch creation and approval paid the wrong amount —
P1 on #251. For each entity the surface writes:

| Entity | What can change between the operator's first act and the last (time, another user, upstream sync) | What the surface shows / does then |
|---|---|---|

---

## Part C — Coverage by component type (fast completeness sweep)

Not per instance — per **type** present on the surface (list · row · pane ·
dialog · sheet · form · nav · bulk bar · empty state · toast). For each type,
one line per state and one per check-family; `GAP` where the spec is silent.

| Component type | States (empty · loading · error · partial · zero-results · first-run · overflow · offline · denied) | Feedback (H1) | Exit (H3) | Prevention (H5) | Labels (H6) | Error copy (H9) |
|---|---|---|---|---|---|---|

Every `GAP` becomes a spec line now.

---

## Part D — Independent spec critic (fixes optimism)

Self-prediction runs high. Before code, hand the **spec + this file** to a
subagent (`Agent`, fresh context) with the critique rubric's ten 4-rows and
`evaluate`'s severity scale, and ask it to *score the spec as if it were the
built surface*, listing for each heuristic the concrete element that earns the
number or the gap that costs it. It reads text only — cheap. Reconcile: every
heuristic where the critic's number is below yours is a spec change, not an
argument. Record both columns here:

| H | critique: self / critic / reconciled | evaluate worst-issue: self / critic / reconciled | Spec change made |
|---|---|---|---|

Gate after reconciliation: **zero P0/P1 predicted, no heuristic under 3, two
4s (≥ 32), verdict Clean, evaluate ≈ ≥ 85.**

---

## Part E — Predict `evaluate` (worst-issue scoring, walkthroughs, anti-patterns)

`evaluate` is not `critique` with a different scale. It **hunts issues**: each
heuristic gets the severity of the *worst* issue found — 0 none · 1 cosmetic ·
2 minor · 3 major · 4 catastrophic — so one dead path is a 3 on H3 however good
the rest of H3 is. Its health score composes the heuristic sum, task success
from cognitive walkthroughs, and the anti-pattern verdict. Observed: sum 18 with
four P1s → 68; sum 8 → 85. **≥ 90 needs: heuristic sum ≤ 5, zero P0/P1, every
walkthrough step pass (≤ 2 hesitations, no failure), verdict Clean.**

### E1 · Worst-issue prediction per heuristic
For each heuristic, name the single worst thing the spec still permits and its
severity. Use this mapping — it is how the critic has actually scored these:

| Class (from Part B) | Severity |
|---|---|
| Action promised but unreachable; irreversible destructive act with no reversal | 3 (P1) |
| View stale after a mutation until refresh | 3 (P1) |
| Focus does not enter a dialog; Esc does not close; keyboard trap | 3 (P1) |
| Link/download lands on a raw error page; input lost on error | 3 (P1) |
| Time-axis edge changes the outcome silently (wrong amount, wrong state) | 3–4 (P1/P0) |
| Two terms for one concept in one view; inconsistent casing in one column | 2 (P2) |
| Bespoke primitive beside the shell's for the same job | 2 (P2) |
| Empty KPI, repeating column, label only in `title` | 1–2 |

| H | Worst issue the spec still permits | Severity | Fix in spec (→ Part B row) |
|---|---|---|---|
| H1 | | | |
| H2 | | | |
| H3 | | | |
| H4 | | | |
| H5 | | | |
| H6 | | | |
| H7 | | | |
| H8 | | | |
| H9 | | | |
| H10 | | | |

Predicted heuristic sum: __ · predicted P0: 0 · P1: 0 · P2: __

### E2 · Cognitive walkthroughs — the four questions, per step
For 3–5 core tasks (the operator's real jobs on this surface, from the journey
map), every step gets the four questions `evaluate` asks. One "no" = hesitation,
two = failure. A failure anywhere is a spec change now.

| Task | Step | Will they try? (motivation) | Will they notice the control? (visibility) | Will they associate it with the effect? (understanding) | Will they see progress? (feedback) | Rating |
|---|---|---|---|---|---|---|

Estimated task success (state it as an estimate): completion __% · steps __ ·
likely error points __.

### E3 · Anti-pattern sweep
Pre-selection · hidden cost or consequence · guilt or pressure copy · buried exit
· forced continuity · asymmetric friction (easy in, hard out) · misleading
label. Each hit is P0/P1 by definition — remove it in the spec. Verdict
predicted: Clean.

## Part F — Build from the tables, then verify the contracts before measuring

The tables **are** the build checklist. Tick each row as its code lands;
screenshot each component type at 1440 and 390 as it lands. Before the first
measurement, run the Part B checks (reachability grep, string extraction for
B3, primitive diff for B4, focus probe for B5). Fix what they show — that is
lint, not scoring. **Then** take the first critique and evaluate: that number
is the untouched first pass.

## Part G — Predicted vs measured (the KPI and the lessons)

| H | critique: predicted / first pass / close | evaluate worst-issue: predicted / first pass / close | Gap explanation |
|---|---|---|---|

Also record: evaluate health predicted / first pass / close · P1 count
predicted / found · walkthrough failures predicted / found · verdict.

Every heuristic where first pass < prediction is a lesson, in this exact form:
*(ticket, Hn) predicted 4, got 2 — Part _ row "…" was marked covered by "…";
the critic found "…" → next time, "…"*. Generic → the tool's `lessons.md`;
codebase-specific → the project's. A first pass under the bar with a
prediction above the gate means a Part was filled optimistically; name it.
