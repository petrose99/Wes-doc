---
target_identity: "file:/home/ubuntu/Dev/Wes-doc/components/workspace/review-inbox.tsx"
target_fingerprint: "sha256:a5f6161dd5939331f18fa512883fe0664ad2478e74beead4c1270832f9e341fb"
target_path: /home/ubuntu/Dev/Wes-doc/components/workspace/review-inbox.tsx
timestamp: 2026-09-15T19-46-57Z
slug: components-workspace-review-inbox-tsx
---
---
target: "Review queue (incumbent approvals inbox) — baseline for #227, map #226"
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:/home/ubuntu/Dev/Wes-doc/components/workspace/review-inbox.tsx"
target_path: /home/ubuntu/Dev/Wes-doc/components/workspace/review-inbox.tsx
timestamp: 2026-09-15T20-30-00Z
slug: components-workspace-review-inbox-tsx
---
Method: dual-agent (A: general-purpose design-review subagent, screenshots at 1440/390 list · row selected · In review tab · bulk bar · B: general-purpose detector subagent — static `impeccable detect` + in-page `detect.js` via headless Chromium against the running dev server, 3 seeded review tasks incl. one on a two-stage workflow). Mode: Operate. This is the *before* baseline for the Approvals destination (#227); the surface it measures is expected to be replaced, not polished.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Tabs carry no counts, no "n of m"; green confidence dot beside reason "Low confidence" (RI:50 vs 455) |
| 2 | Match System / Real World | 2 | Reason column is engine vocabulary ("Rule required", "Check failed"); pane heading is the filename |
| 3 | User Control and Freedom | 3 | Undo on single/bulk status (RI:157–180, 289–333) is good; stage approve has neither confirm nor undo |
| 4 | Consistency and Standards | 1 | Second grammar for the job Invoices now does: j/k vs ↑/↓, 420px pane vs 60%, 37px rows vs 62px, actions mid-scroll vs sticky footer; sidebar highlights Invoices under an H1 "Documents — Review queue" |
| 5 | Error Prevention | 2 | `e` approves the selected row with no confirm; approve gate checks only Paid/Unpaid, so a row with a **failed duplicate check** gets an enabled Approve (RI:551/536/267) |
| 6 | Recognition Rather Than Recall | 2 | Assignee on the row type, never in the row; desktop shows "Stage 1 of 2" with no chain of who decided what |
| 7 | Flexibility and Efficiency | 3 | j/k/e/p, select-all, URL tabs; no sort, filter, facet, or "assigned to me" |
| 8 | Aesthetic and Minimalist | 2 | Pane stacks six or seven equal-weight controls with no primary; disabled Reopen on every Open task; 140px header before the tabs |
| 9 | Error Recovery | 2 | Excellent check sentences with no action attached; bulk partial outcome is two toasts, not per row |
| 10 | Help and Documentation | 2 | Keyboard hint (2.6:1 slate-400) and one empty-state paragraph |

**Total: 21/40.** Design specificity: generic — swap three strings and another product ships it. The amount column is "—" on every row.

## Detector evidence (in-page `detect.js`, 1440 / 390)

| State | 1440 | 390 |
|---|---|---|
| List | 12 | 6 |
| Row selected | 17 | 9 |

Static `impeccable detect`: 0. Chrome baseline noise in every run: 5–6 (`ai-color-palette` ×2 on the workspace avatar, `overused-font`, `layout-transition`, `dark-glow`, sidebar `text-overflow`). In scope: `low-contrast` ×5–6 (j/k/e/p hint + kbd, "Source not available"), `nested-cards` ×2 in the pane, `cramped-padding` on the Paid/Unpaid toggle and the mobile Approve button, `all-caps-body` on the create-rule summary, `line-length` 115ch on the subtitle, `skipped-heading` (h1→h3) on the mobile sheet.

## Priority issues

- **P0 — Mobile Approve/Reject is unreachable.** The sheet's fixed bottom bar (RI:750, `z-index: auto` inside the `z-40` sheet) paints under the app's `z-40` bottom nav (mobile-tab-bar.tsx:36); `elementFromPoint` on both buttons returns the nav link. The phone has no decision surface.
- **P1 — Approve gate ignores failed hard checks** (RI:551, 536, 267): Paid/Unpaid is the only client gate; CONTEXT.md and queue-screen.tsx:209 say duplicate checks are never overridable.
- **P1 — Approval is optimistic where CONTEXT.md says Server-confirmed** (RI:158 removes the row before the server answers; `decideStage` approve at RI:182–193 has no confirm and no undo).
- **P1 — The money is missing from the money queue**: Total renders "—" (RI:442; `summarizeDocumentForReview` formats only a numeric `reviewed.total`, models/documents.ts:705–707) while the pane's fields show 1380.00 / 1033.85 / 5175.00.
- **P1 — Grammar divergence from the Queue screen** on every axis (see H4). The surface's only unique content is the workflow-stage decision and the Reason column.
- **P2 — Contradictory/dead signals**: "Escalated" via a fail/warn ternary (RI:612); "on the full view" with no link (RI:732); `review-task-detail.tsx` is orphaned and still offers `in_review` as a user-pickable status (RTD:122).

## Accessibility facts (live DOM)

Desktop table has no role/label/caption; rows are `tabIndex -1`, only the checkbox is reachable; selected `<tr>` exposes no `aria-selected`/`aria-current`; pane is a bare `<div>`; mobile sheet has no `role="dialog"`. 25 Tabs from load to the first row's checkbox at 1440, 10 at 390. Shortcuts undiscoverable on mobile.

## Strengths to carry forward

1. Push receipt with destination + timestamp that survives reload (RI:574–604).
2. Undo semantics with correct revert grouping (RI:157–180, 289–333).
3. Check sentences and bulk-confirm copy name real consequences; the mobile approval timeline (RI:699–722) is the right chain metaphor.

## Structural comparison (incumbent · Queue screen · Vic Ready to Approve)

Row: 37px/8 cols · 62px + leading Processing mark · 62px due/status/amount/vendor. Header: H1+subtitle+Back+tabs · one band with facets · one band View/Sort/Filters. Approve/Reject: mid-pane scroll box · sticky pane footer + bulk bar · bulk bar + sticky mobile bar. "Assigned to me": absent · absent · the whole view (personal saved view). Confirmation: count in bulk title only · EligibilityStrip + ItemizedRecapTable · "Eligible (1 of 1)" strip + recap + "Approve Invoices (1)". Chain: one line "Stage 1 of 2" · pane tabs (history-tabs.tsx) · STEP n → named user/reason/time, INITIATED footer.

Screenshots: scratchpad `review-list-1440.png`, `review-selected-1440.png`, `review-list-390.png`, `review-selected-390.png`, `desk-row1-workflow.png`, `desk-bulk.png`, `mob-detail.png`.
