---
target: "Invoices Queue screen (#225, map #226)"
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/(queue)/invoices/page.tsx"
target_fingerprint: "sha256:d8f5aca62af7e05b115607569c77e1fd6395b5902878c30568d30d176b2945b1"
target_path: /home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/(queue)/invoices/page.tsx
timestamp: 2026-09-15T19-30-56Z
slug: paces-workspaceid-queue-invoices-page-tsx-a507843a
---
Method: dual-agent (A: general-purpose design-review subagent, screenshots at 1440/390 list · pane · Approval tab + keyboard walk · B: general-purpose detector subagent — static `impeccable detect` + in-page `detect.js` via headless Chromium against the running dev server, 4 seeded invoices). Re-run of the 2026-09-15T16-31 baseline (20/40, old `(chrome)/invoices` page) after #225 landed the Queue screen composition.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | One document reads **Approved** (row pill), **reviewed** (pane pill), **Approval — signed off** (stepper) and **"No approval steps yet"** (Approval tab) |
| 2 | Match System / Real World | 3 | Aging badges Title Case beside sentence-case UI; "Touchless 0% · 0 of 12" above a 4-row list |
| 3 | User Control and Freedom | 3 | Escape/focus-return right; Delete (red) sits above the primary decision; two ⋯ menus split one job |
| 4 | Consistency and Standards | 2 | Toggle chips and facet chips are the same pill with different behaviour; sr-only "State" and visible "State" columns both announced |
| 5 | Error Prevention | 3 | Confirm dialogs with recap tables; the document-type chooser on an Invoices row invites reclassifying out of the queue |
| 6 | Recognition Rather Than Recall | 2 | Leading glyph encodes aging, not Processing state (CONTEXT.md); aging shown twice; State column drops when the pane opens |
| 7 | Flexibility and Efficiency | 3 | ↑/↓/Esc, deep links, bulk bar; no j/k, no Approve shortcut, no hint they exist |
| 8 | Aesthetic and Minimalist Design | 2 | Pane opens with three stacked headers (~184px chrome); the document introduces itself four times |
| 9 | Error Recovery | 3 | Loading/missing/error/boundary states with Retry; disabled-decision reason is a 12px grey hint |
| 10 | Help and Documentation | 2 | Override Mode explained only in ⋯; `Views ●` dot unexplained; "inferred" is title-only |
| **Total** | | **25/40** | **Acceptable (up from 20/40)** |

## Design Specificity Verdict

**LLM assessment:** still category-interchangeable at the row level — slate-on-white table, emerald accent, no per-cell confidence underline visible because every seeded row clears the threshold. Three authored moves now exist: the `Status · All ▾` facet-chip grammar with a Cancel/Apply panel (Vic's shape, on purpose), the pane frame with `1 of 4` + ↑↓ + a sticky decision bar, and the Extracted → Checks → Approval → Sync → Pay stepper inside the pane. The #224 destination (queue fills the screen, one right-hand pane, operator never leaves the list) is now visible; it was absent in the baseline.

**Deterministic scan (static):** `impeccable detect --json` on the page + `components/queue` — exit 0, zero findings (baseline: 3).

**In-page detector (1440 / 390):** list 6 / 5, pane-open 6 / 5 (baseline 23 / 27 / 20). Net of the shell/overlay baseline (`overused-font`, `layout-transition`, `dark-glow` on `body`; `ai-color-palette` ×2 on the workspace switcher avatar) the queue itself carries **one** finding: `cramped-padding` on the narrowed list column at 1440 with the pane open (its border-right is flush with the rows — intentional: the rows are the column). The `text-overflow` at 1440 is the switcher's name inside the hover-expanded rail, shell not queue.

**Measured boxes (1440×900):** rail 56px · header band 48px · thead 36px · rows 62px · list 1384px full-bleed · pane 830px (60%) from x=610 · narrowed list 553px · pane footer y=851–900. First data row at y≈86 (baseline y=594).

## Overall Impression

The composition decided on #224 is on screen and the mechanics (keyboard model, URL sync, focus management, facet panel) are better than most shipped queues. What drags the score is *inside the pane*: the embedded document page brings its own header, pill, type chooser and status vocabulary, so the pane says four different things about whether one invoice is approved.

## What's Working

- Keyboard model: Enter → focus on `h2#queue-detail-pane-title`; ArrowDown moves selection with `1 of 4` live; Escape returns focus to the *currently* selected row's trigger (verified after one ArrowDown).
- URL honesty: `replaceState` to `/invoices/<id>` on open, back on close; refresh reopens the row.
- Facet chips + Apply panel retire the eleven-pill row; one header band before the table.

## Priority Issues

- **[P0] One document, four contradictory statuses.** Row "Approved", pane pill "reviewed", stepper "Approval — signed off", Approval tab "No approval steps yet." A financial decision screen cannot disagree with itself about whether the decision was made. Fix: one status vocabulary from CONTEXT.md's Processing state; the pane pill is the row's `StatePills`; the Approval tab on a reviewed document with no stage decisions names who approved it and when from the audit log. `/impeccable clarify`.
- **[P1] Leading mark encodes aging, not Processing state.** `invoice-queue.tsx:140` `leading={<StatusGlyph bucket={bill.agingBucket} />}` contradicts CONTEXT.md ("due-date urgency is not a processing state"); aging is duplicated by the badge. This is #223's scope (five-state processing glyph) — route there, not here. `/impeccable layout`.
- **[P1] Pane opens with three stacked headers and Delete above Approve.** Queue header → pane header → embedded document header → stepper ≈184px of chrome; Delete is the most saturated control in the pane. Fix: fold the embedded document header into the pane header (filename as subtitle; flag/Archive/Delete join the ⋯ with Cancel invoice), keep the stepper as the single second band. `/impeccable distill`.
- **[P2] Mobile list is a clipped desktop table.** `min-w-[720px]` shows Supplier and half an Invoice # at 390; chips wrap to three rows with an orphaned ⋯ row. #224/#187 chose the horizontal scroller; a two-line card row below `md` and a `Filters (n)` button is the alternative worth deciding. `/impeccable adapt`.
- **[P2] Two `State` column headers announced** (sr-only on the leading cell + the visible State column); `aria-selected` on a plain `<tr>` outside a grid role; row trigger's accessible name concatenates supplier and filename with no state or amount. `/impeccable audit`.

False finding from Assessment A, dropped: "mobile account avatar overlaps the tab bar / footer hint" — the black `N` circle at bottom-left is the Next.js dev-tools indicator, not product UI (the sidebar is `hidden md:flex`).

## Persona Red Flags

- **Alex (power user):** 30 Tabs from load to the first row, and the rail flashes open on each Tab through it; no j/k or Approve shortcut and no hint; sort is a native `<select>`; the type chooser + "All 8 fields extracted." take the first 110px of every Details tab.
- **Sam (screen reader / keyboard):** duplicate "State" headers; `aria-selected` on `<tr>`; row name without state or amount; `Views ●` dot has no text alternative; pane content arrives async with `aria-busy` on a sibling, not the section.

## Minor Observations

16×16 checkboxes in a 62px row; "Touchless 0% · 0 of 12" reads as a scold on a fresh workspace and 12 ≠ 4 visible rows; stepper "Pay" node clipped at 390; pane header subtitle "OE-44210 · $391" vs embedded header filename — pick one; aging badge colour is louder than processing state.

## Questions to Consider

1. If every row is Approved and the confidence underline never shows, what tells the operator DocuBite did any AI work — should the default view be *Needs attention*?
2. If the source PDF were thumbnail-on-demand, would fields + history fit in 40% and let the list keep its State column?
3. Why does an Invoices queue ask "What type of document is this?" on every row — a real operator decision, or a shared review form that predates typed destinations?
