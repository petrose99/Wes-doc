# Pre-flight — #259 Fold the Detail pane header (filled 2026-09-16, spec phase)

Spec: `spec.md` beside this file. Surface: Operate; all ten heuristics apply.

## Part A — Two excellence targets

| H | Target | What a 4 looks like on this surface | Where in the spec |
|---|---|---|---|
| H1 Status | 4 | Every ⋯ mutation (Archive/Unarchive, Flag/Remove flag, Delete) → toast + pane reload in the same tick, the list refreshes at the next close/move (stated, not stale by accident); `1 of N` live; Status line + ledger mark always present from the row, never a skeleton; stepper says where the row is at both widths | spec §1 wiring, §2 ⋯ table, §4 S1/S5 |
| H5 Prevention | 4 | Delete is behind the shared ConfirmDialog with the consequence sentence and Cancel focused; every ineligible item is visibly disabled with its reason; Archive is reversible from the same item; nothing destructive is a header-level control | spec §2 ⋯ table, S4 |
| H2–H4, H6–H10 | 3 | solid: one vocabulary (B3), shell primitives (B4), reasons on disabled items, Back/Close/Esc everywhere, errors keep state, `title` on truncations | Part B |

## Part B — Contracts

### B1 · Action reachability and reversal

| Action | Control | Destructive? | Confirmation names the consequence? | Reversal |
|---|---|---|---|---|
| Open in a new tab | ⋯ item 1 (`PaneMenuItem`), pane mode only | no | n/a | close the tab |
| Open file | source strip link | no | n/a | close the tab |
| Open review task | ⋯ item 1b (link) — `header.reviewLink` re-homed from the deleted top bar | no | n/a | Back |
| Archive / Unarchive | ⋯ item 2 | no (reversible) | none needed — reversible from the same item; toast says where it went | Unarchive, same item |
| Flag for attention / Remove flag | ⋯ item 3 | no | none | same item, flipped |
| Cancel invoice… / Create expense claim… | surface items (unchanged) | ⚠ (Cancel) | existing dialog with reason | unchanged (#218) |
| Delete… | ⋯ last, red | ⚠ irreversible | yes: "‹filename› and every row extracted from it will be removed, along with the stored source file. This cannot be undone." | none; stated in the dialog; bulk-bar Delete is the same dialog |
| Layout Split/Details/Source | strip radiogroup | no | n/a | pick another; the strip is always visible so Details never strands the operator |
| Back to queue / Close | header | no | n/a | reopen the row |

Check before measuring: `grep -rn "archiveDocumentsAction\|flagDocumentsAction\|deleteDocumentsAction\|DeleteDocumentButton\|CreateReviewTaskButton" components app` — each action ≥ 1 UI caller; `DeleteDocumentButton`/`CreateReviewTaskButton` either have a live importer or are deleted (dead component = P1 class).

### B2 · View freshness after every mutation

| Mutation | Views showing the entity | Mechanism | Same tick? |
|---|---|---|---|
| Archive/Unarchive | ⋯ item label (Archiving… while pending, `aria-busy`) · pane content · toast · list row (Open/Closed facet) | `onMutated("changed")` → `reloadKey++` (pane) ; list `router.refresh()` deferred to close/↑/↓ so the row stays under the operator (#239/#227) | pane yes; list at the next navigation — stated in the toast ("now under Closed") |
| Flag/Remove flag | ⋯ item label · toast | same | yes |
| Delete | pane · list · count · toast | `onMutated("removed")` → `close()` + `router.refresh()`; full: `router.push(backHref)` | yes |
| Layout change | source/details panels · radiogroup | local state + sessionStorage | yes |
| Selection move ↑/↓ | h2 · Status line · `1 of N` · stepper · content | existing (row-driven header, `loadDetail`) | header yes; content after load with skeleton |

### B3 · Vocabulary

| Concept | Term | Appears on | Casing |
|---|---|---|---|
| The pane at full width | Open in a new tab | ⋯ item | sentence |
| The source file | Open file | strip link (+ "Open it directly" in the PDF error line, unchanged) | sentence |
| Take off Open views | Archive / Unarchive | ⋯ item, toast "Archived — now under Closed" only on queues with a Closed facet (Invoices, Documents), else "Archived" | sentence |
| Review task | Open review task | ⋯ item 1b | sentence |
| Flag | Flag for attention / Remove flag | ⋯ item, toasts "Flagged" / "Flag removed" | sentence |
| Remove permanently | Delete… / dialog "Delete this document?" / "Delete" / toast "‹filename› deleted" | ⋯, dialog, toast, bulk bar | sentence |
| Leave the pane | Close (lg+ pane) · Back to queue (below lg, full) | header | sentence |
| Where the row is | Status line words = the row's pills (#233/#258) | line 2 | as `StatePills` |
| Layout | Split · Details · Source | strip | sentence, single words |
| Step position | "‹label› · n of N" | stepper below lg | as node labels |

Check: extract strings from `detail-pane.tsx`, `document-actions-menu.tsx`, `split-pane.tsx`, `stage-indicator.tsx`; assert no "document header", "detail sheet", "Open full page", "Expand details", "Show source only", "Split view" (retired), and that "Open in a new tab" appears once per surface.

### B4 · Primitive reuse

| Need | Shell primitive | New? |
|---|---|---|
| Overflow menu | `components/ui/popover.tsx` + `PaneMenuItem` | no (adds `role=menu` keys) |
| Confirm | `components/ui/confirm-dialog.tsx` | no |
| Status pills | `StatePills` (`row-cells.tsx`) | no |
| Stepper | `StageIndicator` | no (adds the one-line form) |
| Frame | `PaneFrame` split out of `DetailPane` | split, not new |
| Layout control | three `role=radio` buttons in a bordered group | new micro-control; reason: no segmented control exists in `components/ui`; it stays local to the strip and is listed for `extract` if a second user appears |
| Toasts | sonner | no |
| Looks-like check | the Status line pills carry no click; the layout radios look like buttons, not pills | ok |

Check: `grep -rn "window.confirm\|alert(" components/queue components/pipeline` empty; no new file under `components/ui`.

### B5 · Focus, keys, failure path

| Surface | Initial focus | Trap + Esc + return-to | Keys | On failure |
|---|---|---|---|---|
| ⋯ menu (Popover) | first `menuitem` | Radix trap; Esc → ⋯ trigger; Tab closes | ↑↓ roving wrap incl. `aria-disabled` items (hint via `aria-describedby`), Home/End, Enter/Space | action error → toast, menu closed, focus ⋯, item re-enabled |
| Delete dialog | Cancel (destructive) | ConfirmDialog trap; Esc/Cancel → ⋯ trigger (menu closed and focus restored *before* open) | Tab within | not-found → dialog closes, toast, pane → S2; other error → dialog stays open, busy off, error line inside |
| Cancel invoice dialog | unchanged (#218) | unchanged | | unchanged |
| Header buttons | — | Esc closes pane (queue root) → row trigger | ↑/↓ from anywhere in the queue | — |
| Strip link (Open file) | — | new tab | Enter | file 404 → the new tab shows the server's 404; the pane is untouched |
| Layout radiogroup | checked radio | — | ←/→ only; `[role=radiogroup]` in the queue keydown ignore list so ↑/↓ never reach it | — |
| Full mode Back | — | — | Enter | `from` missing → typed queue |
| Missing content (S2) | Refresh queue button | — | | — |

Check: Playwright probe at close — open ⋯ with keyboard, arrow to Delete…, Enter, assert `document.activeElement` inside the dialog then on ⋯ after Esc.

### B6 · Time-axis and concurrency

| Entity | What can change | Shown |
|---|---|---|
| Document | archived / flagged / cancelled / deleted by another user or a bulk action while open | the action's `success:false` reason → toast; `onMutated("changed")` reloads; a deleted row → S2 with Refresh queue |
| Queue order | rows added/removed while `1 of N` is shown | `1 of N` is the client list's; refresh on close/move; never a stale index after refresh (existing) |
| Layout preference | sessionStorage across rows | applied on each open; reset on a new tab |

## Part C — Coverage by component type

| Type | States | H1 | H3 | H5 | H6 | H9 |
|---|---|---|---|---|---|---|
| Pane header | loading (row-driven, no skeleton) · missing · error · long · below-lg · full | `1 of N` live, Status line | Close/Back/Esc | none destructive | every icon button labelled + `title` | — |
| ⋯ menu | empty-of-document (loading/missing) · cancelled · busy | item labels flip after reload | Esc/Tab | disabled + hint, Delete last red | labels + hints | toast with the reason |
| Delete dialog | busy · error | toast | Cancel/Esc | consequence copy, Cancel focused | | error keeps dialog |
| Stepper | 4/5 nodes · blocked · below-lg | current node | — | — | words + `aria-label` | — |
| Source strip | long filename · missing file · Details layout | — | layout always reachable | — | Open file labelled | error line + Open it directly |
| Full page | reached only via Open in a new tab (`?stage=`/`?page=` → queue+pane) · no `from` · deleted (404) | — | Back to queue | — | | 404 in shell |
| Toasts | success/error | sonner | dismiss | | | reason from server |

No GAP left.

## Part D — Independent spec critic (run 2026-09-16, `opus`, fresh context, agent a4fb7593)

Critic on the spec as first written: critique **29/40** (H4 = 2, rest 3) · evaluate sum 18 · **P1 × 1** (H4: legacy `?stage=`/`?page=` deep links from the dashboard, pipeline list and review page landed in full mode with no Approve, and `header.reviewLink` lost its home) · P2 × 4 (no pending state for Archive/Flag; ↑/↓ in the layout radiogroup also stepped the queue row; disabled-item hints not keyboard-reachable; Delete dialog vs S13 contradiction for an already-deleted row) · anti-patterns Clean.

Full-mode footer ruling: **P1 as written, acceptable after one routing change** — make `?full=1` the only trigger for full mode; legacy links open the queue with the pane where the sticky bar is. No footer needed. Recorded on the ticket.

Reconciled — all eight spec changes applied (spec §1, §2 ⋯ table, §2 strip, §3, §4 S13, §5; pre-flight B1/B2/B3/B5/C/E updated):

| # | Change | Where |
|---|---|---|
| 1 | Full mode only on `?full=1`; drop `\|\| query.stage \|\| query.page` from the six typed route gates | §1 |
| 2 | *Open review task* ⋯ item 1b; `CreateReviewTaskButton` stays in the Details tab | §1, §2 |
| 3 | Layout radiogroup ←/→ only; `[role=radiogroup]` in the queue keydown ignore list | §2, §5 |
| 4 | Archive/Flag items show *Archiving…*/*Flagging…* with `aria-busy`, menu closes on resolve | §2 |
| 5 | Delete dialog: not-found → close + S2; other error → stays open | §4 S13, B5 |
| 6 | Disabled items `aria-disabled` + visible hint + `aria-describedby` | §2 |
| 7 | "now under Closed" only on queues with a Closed facet | §2, B3 |
| 8 | Stepper one-liner: sr-only prefix, not `aria-label` on `<p>` | §3, §5 |

Critic's "marked covered but not": B1 review link (fixed 2) · B5 radiogroup keys (3) · B5/S13 contradiction (5) · B2 no in-progress state (4) · C/E2 only tested arrival via Open in a new tab (1, E2 row added) · B3 Closed facet assumed on every queue (7).

**Post-reconciliation prediction:** critique H1 4 · H2 3 · H3 3 · H4 3 · H5 4 · H6 3 · H7 3 · H8 3 · H9 3 · H10 3 = **32/40**; evaluate 0 P0 · 0 P1 · sum ≤ 10 · Clean · health ≈ 86. **Gate met.** (The critic's 3s on H1 and H5 were decided by findings 4 and 3, both now closed in the spec; the 4s stay a prediction to measure.)

## Part E — Predict `evaluate`

### E1

| H | Worst issue the spec still permits | Sev | Fix |
|---|---|---|---|
| H1 | list row still under Open after Archive until the pane closes (stated in the toast; the item shows Archiving… meanwhile) | 1 | B2 |
| H2 | "Unarchive" is not a word the operator uses | 1 | B3 accepted (CONTEXT: reversible from the same menu) |
| H3 | Delete has no undo (by nature) | 1 | dialog says so |
| H4 | layout radios are a one-off micro-control; legacy `?stage=` links re-routed to the queue so full mode is never a dead end without Approve | 1 | B4 listed; §1 route gate |
| H5 | none beyond the dialog | 0 | — |
| H6 | stepper one-liner hides the other nodes below lg | 1 | `aria-label` + n of N |
| H7 | no accelerator for Archive/Delete (#240's rule: no key acts on data) | 1 | by decision |
| H8 | Status line + stepper both say the state below lg (two lines) | 1 | #233 decided both |
| H9 | server error text may be terse | 1 | fallback copy; Delete not-found branch closes the dialog (S13) |
| H10 | no explanation of Split/Details/Source beyond labels | 1 | `title`s |

Sum 9 · P0 0 · P1 0 · P2 0 · predicted health ≈ 86.

### E2 — walkthroughs

| Task | Step | Try | Notice | Associate | Progress | Rating |
|---|---|---|---|---|---|---|
| Archive a row from the pane | open ⋯ | yes | yes (only ⋯) | yes | menu opens | pass |
| | choose Archive | yes | 2nd item | yes | toast + item → Unarchive | pass |
| Delete a row | ⋯ → Delete… | yes | red, last | yes (ellipsis) | dialog | pass |
| | confirm | yes | Delete button | consequence read | toast, pane closes, row gone | pass |
| Read the source larger | strip → Source | yes | segmented control beside filename | yes | panel widens | pass |
| | back to Split | yes | strip still there | yes | | pass |
| Open in a new tab and come back | ⋯ → Open in a new tab | yes | first item | yes | new tab, same header | pass |
| Dashboard "Blocked in review" link → approve | click row link | yes | queue opens with pane + sticky bar | yes | decision available | pass (after §1 route change) |
| | Back to queue | yes | ← in the header | yes | queue with origin | pass |
| Phone: see where a row is | open row | yes | Status line + one-line stepper | yes | | pass |

Estimated completion 95% · ≤ 3 steps each · likely hesitation: "Details" layout hiding the source (strip remains as the way back).

### E3 — anti-patterns
Pre-selection none · hidden consequence none (Delete dialog) · guilt copy none · buried exit none (Close/Back/Esc) · forced continuity none · asymmetric friction: Archive ⇄ Unarchive symmetric · misleading label: "Open file" vs "Open in a new tab" distinguished. Verdict: Clean.

Predicted critique: H1 4 · H2 3 · H3 3 · H4 3 · H5 4 · H6 3 · H7 3 · H8 3 · H9 3 · H10 3 = **32/40**.
