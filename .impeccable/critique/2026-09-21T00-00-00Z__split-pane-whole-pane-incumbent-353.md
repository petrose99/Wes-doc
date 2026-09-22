# Critique — incumbent document detail pane, whole surface (map #353 baseline, ticket #354)

Target: `components/pipeline/document-detail/split-pane.tsx` inside `components/queue/detail-pane.tsx` (PaneFrame). Mode: Operate.
Method: dual-agent (A: code-only design review · B: static detector + in-page detect.js at 1440/390, mouse parked). Dev server :3000, live-server :8400. Captures in the session scratchpad (`full-1440.png`, `full-page-tall-1440.png`, `pane-inv-*.png`, `pane-rcpt-*.png`, `tab-*-1440.png`).
Reference the map moves toward: `docs/wayfinder-reports/ramp-refs/bill-status-lines.jpeg`.

## Design specificity
Generic with AP ornaments. Frame + five-tab strip + layout radiogroup + 13 label-over-input rows + green Save is any admin edit drawer. The AP-specific parts (stage band, suspect strip with Enter-to-advance, per-field Source crosshair, PO chip / Match manually) are bolted around the generic core. **There is no coding step**: no category / ledger account on the document (`lib/doc-types.ts:83-97`) or per line. The Direction radiogroup (retired in the glossary 2026-09-17) still renders and gates Save review (`split-pane.tsx:476-489, :497`).

## Heuristics (0–4)
| # | Heuristic | Score | Evidence |
|---|---|---|---|
| H1 | Visibility of system state | 3 | Stage band + toasts + `aria-busy`; Direction autosaves silently; status line and stepper duplicate one fact. |
| H2 | Match to the real world | 1 | Payable/Receivable asked of an AP-only product; "Select a mark for the arithmetic."; "All N fields extracted"; no coding vocabulary anywhere. |
| H3 | User control and freedom | 3 | Escape closes, Match manually has Discard, Direction reverts on failure; Save review has no undo and can silently approve. |
| H4 | Consistency and standards | 1 | Three save verbs (Save review · Save note · footer Approve/Reject); tab order flips by breakpoint; Direction autosaves while every other field waits for Save. |
| H5 | Error prevention | 2 | Fields lock during approval; Save gated on a non-error (Direction); live check recompute is good. |
| H6 | Recognition over recall | 1 | Source/Manual `opacity-0` until hover; checks on a tab away from the fields; Enter-to-advance undiscoverable without suspects. |
| H7 | Flexibility and efficiency | 3 | Enter confirm-and-advance, ↑/↓ row nav, roving tabs; no keyboard path to Approve; Direction costs a click per document. |
| H8 | Aesthetic and minimalist | 1 | Filename twice, low-confidence count twice, status twice, 3-way layout control, Create-a-rule card inside the review form, **totals block rendered twice** (8 totals inputs, 4 duplicated — B, DOM enumeration). |
| H9 | Error recovery | 3 | Missing/error/boundary states with Retry; generic "Could not save — try again" names no field. |
| H10 | Help and documentation | 2 | Disabled reason visible; PO-locked footnote; nothing says what Save review does (save vs approve). |

**Total 20/40.** Cognitive load: ≈28–33 interactive controls above the fold in the Details tab before any line item or Save (Ramp ≈6); 42 form controls in the tabpanel; the form scrolls ~2.9 screens at 900px. Four of five tabs require recall across tabs.

## Browser evidence (B)
Static: 2 findings (`gray-on-color` match-manually.tsx:185; `border-accent-on-rounded` split-pane.tsx:187).
In-page, real after residue: full 1440 = 7 (4× `clipped-overflow-container` on pane scaffolding *at 1440*, `line-length` 105ch on the matcher helper, rail `text-overflow`, `cramped-padding` on a hidden shell div); full 390 = 0; invoice pane 1440 = 9 (7× clipped scaffolding + rail + hidden div); invoice pane 390 = 0; receipt pane 1440 = 3 (`em-dash-overuse` ×29 on the list, rail, hidden div); receipt pane 390 = 0. No page errors.
Observed, not detector: Checks tab reads "No open checks" while the stage strip says Checks is current and the phone header says "Checks · 2 of 5"; Approval tab has no controls in full mode; Audit "No activity recorded yet" on a document with saved fields; Note is one textarea + its own Save; the 390 footer's Reject label sits under the red "1 Issue" dev pill; the receipt viewer shows a broken image; keyboard focus reaches the document on Tab #17.

## Priority issues
- **P0** Retired Direction still gates Save review — `distill`.
- **P0** Two approval paths, three save verbs, no one footer verb — `clarify` + Intent `journey`.
- **P1** The code step does not exist (no Category anywhere) — `shape` after the coding-row ticket (#356/#350).
- **P1** Checks and Approval hidden on tabs away from the fields — `layout` + Intent `organize`.
- **P1** Flat 13-row form, no grouping (supplier · dates · money) — `layout`.
- **P2** Redundant chrome (filename, count, status, layout radiogroup, rule card, duplicate totals) — `distill`.
- **P2** Hover-only Source/Manual affordance — `harden`.
- **P2** Tab order differs by breakpoint — `adapt`.

## Distance from Ramp (bill-status-lines)
Ramp answers who / how much / coded to what / when / where-is-it in one view with no tabs, one status track with a date, a supplier card, one line table with Category, a viewer with two icons and a grip. Today's pane: coding absent; status ×3; checks on a tab; supplier one of 13 identical inputs; viewer chrome = filename + Open file + Hide source + 3-way radiogroup; commit split across Save review / Approve / Save note; five tabs ordered differently per breakpoint.
