# Pre-flight — prove the spec scores before writing code

`critique` scores each Nielsen heuristic 0–4 against five concrete checks, and a 4
means *every* (every action confirms, escape everywhere, fully consistent).
`evaluate` counts the worst issue per heuristic (0 = none found) and walks the
core tasks. Neither can be passed by a sentence per heuristic; both can be
predicted by a coverage matrix. Fill this file (copy it to the ticket's scratch
folder) **before the first line of code**. It is the build checklist afterwards.

## 1. Inventory (the rows)

From `specify` + `fortify`. Be exhaustive; anything missing here is invisible to
every check below.

- **Screens / routes**: …
- **Components** per screen (list, row, pane, dialog, sheet, form, nav, bar…): …
- **Actions** (every button, link, key, gesture; mark destructive ones ⚠): …
- **States** per component: empty · loading · error · partial · zero-results ·
  first-run · long/overflow content · offline/slow · permission-denied
- **Copy surfaces**: every label, empty state, error, confirmation, hint, help
- **Cross-surface hops**: every navigation in or out (carries origin context?)
- **Core tasks** (3–5, for the walkthrough): …

## 2. Coverage matrix (the 50 checks)

One row per check. *Applies to* = inventory items the check touches. *Covered by*
= the spec element that satisfies it for **each** of those items — or `GAP`.
Predicted score per heuristic: 4 only if no GAP and no partial; 3 if partial on a
secondary item; a GAP on a primary item is ≤ 2. Be as hard as the critic will be.

| # | Check | Applies to | Covered by | Gap → spec change |
|---|---|---|---|---|
| H1 | Loading indicator on every async op | | | |
| H1 | Confirmation of every action (save/submit/delete) | | | |
| H1 | Progress on multi-step processes | | | |
| H1 | Current location always visible (active nav, breadcrumb, title) | | | |
| H1 | Inline validation, not only on submit | | | |
| H2 | Familiar terms, no unexplained jargon (check CONTEXT.md glossary) | | | |
| H2 | Information order matches the user's mental order | | | |
| H2 | Icons/metaphors recognisable, labelled | | | |
| H2 | Domain-appropriate language for this persona | | | |
| H2 | Reading flow: primary thing first, left→right, top→bottom | | | |
| H3 | Undo (or reversible equivalent) on every state change | | | |
| H3 | Cancel on every form and dialog | | | |
| H3 | Clear way back (origin restore, Esc closes pane/sheet) | | | |
| H3 | Clear filters / search / selection in one action | | | |
| H3 | Escape from every multi-step flow without loss | | | |
| H4 | One term per concept across the surface (and the rest of the app) | | | |
| H4 | Same action → same result everywhere it appears | | | |
| H4 | Platform conventions (native form controls, focus, keys) | | | |
| H4 | Visual consistency with the shell: tokens, type, spacing, components | | | |
| H4 | Same gesture/key = same behaviour in every component | | | |
| H5 | Confirm before every destructive action ⚠ (consequences named) | | | |
| H5 | Inputs constrained (pickers, selects, masks) so invalid is impossible | | | |
| H5 | Smart defaults | | | |
| H5 | Labels that prevent misreading (units, formats, examples) | | | |
| H5 | Autosave / draft recovery where input is long | | | |
| H6 | Options visible, not buried (no icon-only, no hidden menus for primary) | | | |
| H6 | Contextual help where a decision is hard (hint, tooltip) | | | |
| H6 | Recent / history where users return to things | | | |
| H6 | Autocomplete / suggestions on free-text lookups | | | |
| H6 | Every icon has a visible or accessible label | | | |
| H7 | Keyboard shortcuts for the frequent actions | | | |
| H7 | Customisation where the shell offers it (columns, density, saved views) | | | |
| H7 | Recent items / favourites | | | |
| H7 | Bulk / batch actions where rows exist | | | |
| H7 | Power features don't complicate the default path | | | |
| H8 | Only what's needed at each step; secondary info demoted | | | |
| H8 | One clear hierarchy per screen (what's read first) | | | |
| H8 | Colour and emphasis purposeful (status, action, danger only) | | | |
| H8 | No decorative clutter | | | |
| H8 | Layout focused; density matches the shell | | | |
| H9 | Errors in plain language, no codes | | | |
| H9 | Error names the specific problem | | | |
| H9 | Error offers the fix / next step | | | |
| H9 | Error shown at the source (field, row), not only a toast | | | |
| H9 | Non-blocking: user's input preserved on error | | | |
| H10 | Help reachable without leaving context | | | |
| H10 | Contextual help at the hard moments (first-run, empty, complex field) | | | |
| H10 | Task-focused, not feature-focused | | | |
| H10 | Concise and scannable | | | |
| H10 | Findable (link, `?`, search) | | | |

**Predicted critique**: H1 _ · H2 _ · H3 _ · H4 _ · H5 _ · H6 _ · H7 _ · H8 _ · H9 _ · H10 _ = **__/40**
Gate: ≥ 36 predicted (prediction is optimistic; the bar is 34). Below it, fix the spec, not the code later.

## 3. Task walkthroughs (what evaluate does)

For each core task, step by step: *Will the user know what to do? Can they see
how? Will they understand the feedback?* Every "no" or "only if they guess" is a
spec gap — add it to the matrix's Gap column.

| Task | Step | Knows what to do? | Sees how? | Understands feedback? | Gap |
|---|---|---|---|---|---|

Anti-pattern sweep: any pre-selected choice, hidden cost, guilt copy, hard-to-find
exit, forced continuity, or asymmetric friction? → P0/P1 in evaluate; remove now.

**Predicted evaluate**: issues per heuristic (worst severity) → predicted **__/100**.
Gate: ≥ 92 predicted.

## 4. After the first measurement

Put the real scores beside the predicted ones. **Every heuristic where actual <
predicted is a lesson**, written as: *(ticket, Hn) predicted 4, got 2 — the check
"…" was marked covered by "…" but the critic found "…" → next time, "…"*. That
line goes to the lessons file. The size of the gap between prediction and
measurement is the KPI for how honest the pre-flight was.
