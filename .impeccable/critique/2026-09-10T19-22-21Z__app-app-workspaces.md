---
target: my ui (core app screens), run 6 leftovers+structural
total_score: 40
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\marketing-ui-audio-review-e977c4\\app\\(app)\\workspaces"
timestamp: 2026-09-10T19-22-21Z
slug: app-app-workspaces
---
# Impeccable Critique — DocuBite core app UI, run 6 (post 460940c leftovers + structural batch)

Method: dual-agent (A: design review · B: detector/browser evidence). Browser overlay skipped: dev stack unavailable in session; detector CLI ran (15 warnings, flat vs run 5, no new findings, all pre-existing/false-positive/intentional).

## Design Health Score — 40/40 (Excellent)

| # | Heuristic | Score | Note |
|---|-----------|-------|------|
| 1 | Visibility of System Status | 4 | Row-level push chips match the detail-pane receipt |
| 2 | Match System / Real World | 4 | Supplier/Category/Total everywhere but Inbox; "Received" not "createdAt" |
| 3 | User Control and Freedom | 4 | Undo on single + bulk; Push again works |
| 4 | Consistency and Standards | 4 | Emerald chip = emerald receipt; variant discipline holds |
| 5 | Error Prevention | 4 | Reject confirm w/ inline note; bulk confirm; payment gate |
| 6 | Recognition Rather Than Recall | 4 | Legend persistent (dimmed when empty) |
| 7 | Flexibility and Efficiency | 4 | Full j/k/x/a/Enter; id-based focus survives reorders |
| 8 | Aesthetic and Minimalist Design | 4 | Push chip compact; "Pushed to" prefix lives in the tooltip |
| 9 | Error Recovery | 4 | Undo toasts, receipts, honest withhold copy |
| 10 | Help and Documentation | 4 | Per-stage empty copy; placeholder says where the note lands |
| **Total** | | **40/40** | **Excellent** |

Design-specificity: 4/4 — reads as a considered AP application, not a template.

## Fix verification (460940c) — all six FULLY FIXED, no regressions
Focus-by-row-id · null-focus k→row 0 · persistent legend · ConfirmDialog FOCUSABLE+children · one-click stage-reject note (2KB cap, audit-event + task.detail-if-empty) · batched Synced/Paid push chips.

## Post-audit polish (committed after this score)
- ConfirmDialog: initial focus lands on the note field when children are present (autoFocus={!children} + rAF focus).
- Legend: aria-hidden dropped — shortcuts read to AT users on empty tabs too.

## Remaining P3s (parting notes, non-blocking)
- Push chip could click through to the push detail (it visually reads as a button).
- Synced status cell at 3 chips is at its density ceiling.
- keydown handler re-registers on each navigation (focusedIndex in deps) — a ref would quiet it.

## Structural questions — disposition
1. Synced-row receipts: BUILT (this batch).
2. Two review surfaces: deliberate — pipeline tab = row triage, /review = task split-view. Open product question: cross-link them ("Open in split view" on rows) or merge. Decision left to the team.
3. Rejection note: BUILT (one click, in the dialog). Reviewer's counter-question: should stage-APPROVE get the same optional-context slot for auditors?

## Detector
15 warnings (17 → 18 → 16 → 15 → 15 → 15), identical set, all pre-existing (state-swap tints, tab underlines, intentional gradient). No findings introduced by any commit in this series.
