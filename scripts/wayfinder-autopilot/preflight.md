# Pre-flight — make the first build score, on purpose

Evidence from three autopilot builds: first passes came in at 26–28/40 with
**no heuristic at 4** (seven or eight 3s, two or three 2s) and `evaluate` at
68–81 with 4 P1s. Ten 3s is 30 — the bar of 34 is unreachable without at least
four 4s. And every 2 and every P1 fell into one of six recurring classes that a
spec can state as a contract and a grep can verify. This pre-flight does both.
Copy it into the ticket's scratch folder and fill it **before the first line of
code**; attach the filled file to the report.

---

## Part A — Excellence targets (fixes the 30 ceiling)

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

Predicted critique = sum. **Gate: ≥ 36 predicted** (predictions run optimistic;
the bar is 34). Under the gate, add a 4-target or raise a 3 — in the spec.

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

| H | Self-predicted | Spec-critic | Reconciled | Spec change made |
|---|---|---|---|---|

Gate after reconciliation: **critique ≥ 36, evaluate ≥ 92**.

---

## Part E — Task walkthroughs and anti-patterns (what `evaluate` does)

For 3–5 core tasks, step by step: *knows what to do? · sees how? · understands
the feedback?* Every "no" / "only by guessing" → Part C `GAP` or a Part B row.

| Task | Step | Knows | Sees | Understands | Gap |
|---|---|---|---|---|---|

Anti-pattern sweep (pre-selection, hidden cost, guilt copy, buried exit, forced
continuity, asymmetric friction): each hit is a P0/P1 — remove in the spec.

---

## Part F — Build from the tables, then verify the contracts before measuring

The tables **are** the build checklist. Tick each row as its code lands;
screenshot each component type at 1440 and 390 as it lands. Before the first
measurement, run the Part B checks (reachability grep, string extraction for
B3, primitive diff for B4, focus probe for B5). Fix what they show — that is
lint, not scoring. **Then** take the first critique and evaluate: that number
is the untouched first pass.

## Part G — Predicted vs measured (the KPI and the lessons)

| H | Reconciled prediction | First pass | Close | Gap explanation |
|---|---|---|---|---|

Every heuristic where first pass < prediction is a lesson, in this exact form:
*(ticket, Hn) predicted 4, got 2 — Part _ row "…" was marked covered by "…";
the critic found "…" → next time, "…"*. Generic → the tool's `lessons.md`;
codebase-specific → the project's. A first pass under the bar with a
prediction above the gate means a Part was filled optimistically; name it.
