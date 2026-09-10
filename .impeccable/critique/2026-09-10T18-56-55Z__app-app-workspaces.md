---
target: my ui (core app screens), run 4 post-leftovers
total_score: 35
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\marketing-ui-audio-review-e977c4\\app\\(app)\\workspaces"
timestamp: 2026-09-10T18-56-55Z
slug: app-app-workspaces
---
# Impeccable Critique — DocuBite core app UI, run 4 (post 2069984 leftovers batch)

Method: dual-agent (A: design review · B: detector/browser evidence). Browser overlay skipped: dev stack unavailable in session; detector CLI ran (exit 2, 15 findings, ~12 false positives).

## Design Health Score — 35/40 (Good, borderline Excellent)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Push receipts + selection badges intact |
| 2 | Match System / Real World | 4 | Buttons read Approve/Reopen/Reject, not enum names |
| 3 | User Control and Freedom | 4 | Bulk-approve Undo closes the last no-return path in Operate mode |
| 4 | Consistency and Standards | 3 | One dialog shape now; still repo-local Dialog, not Radix |
| 5 | Error Prevention | 4 | Approve confirm + payment gate |
| 6 | Recognition Rather Than Recall | 3 | Shortcuts discovered via fine print at the bottom of a scrolling table |
| 7 | Flexibility and Efficiency | 4 | j/k/x/a/Enter parity on pipeline Review — Alex's #1 gripe resolved |
| 8 | Aesthetic and Minimalist Design | 3 | Status row trimmed to three; grid remains dense |
| 9 | Error Recovery | 3 | Undo is toast-only; dismissed toast = no history |
| 10 | Help and Documentation | 2 | Nothing explains in_review as a machine transition |
| **Total** | | **35/40** | **Good (borderline Excellent)** |

## Fix verification (2069984) — all five FULLY FIXED
1. SheetChoiceDialog → DS Dialog: hand-rolled dialog gone; aria-labelledby/describedby wired.
2. Status row: STATUS_OPTIONS ["approved","open","rejected"], primary/destructive/outline variants, verb labels.
3. Bulk-approve Undo: reviewedIds → approvedIds → sendDocumentsBackToReviewAction; model-layer, idempotent.
4. Keyboard parity: j/k/x/a/Enter, focus ring, legend, form-field guard; no stale closures.
5. Sidebar hexes: zero hex/rgba left in sidebar.tsx (neighbors in components/shell/ still carry theirs — out of scope).

## Remaining Priority Issues
1. [P2] Static aria IDs across dialog instances (dialog.tsx:82–83, confirm-dialog.tsx:63–64) — use useId().
2. [P2] `a` select-all fires while a row link has focus (document-list.tsx:126–131) — anchor not in the form-field guard.
3. [P2] Stage-reject dialog copy promises a "reason" the flow never collects (review-inbox.tsx:353).
4. [P3] focusedIndex not clamped when rows shrink (document-list.tsx:104).
5. [P3] Push receipts lost on hard reload — hydrate from the push audit trail.

## Detector
15 warnings (17 → 18 → 16 → 15). ~12 false positives (state-swap tints, tab underlines, intentional gradient). Three genuine low-contrast cases: line-items-editor.tsx:88, share-dialog.tsx:135, category-account-mapping-table.tsx:76 (slate-300/400 idle icons). pipeline-shell "(30d)" labels verified honest (30-day windowed query).

## Persona Notes
Alex: pain resolved; will hit the `a`-near-focused-link footgun within a week.
Sam: legible three-button row + push receipt; workflow-vs-plain approve controls still two conventions with no explanation.

## Questions to Consider
- If in_review is a machine state, why is it still a visible pill?
- Does single-row approve have the same round-trip integrity as the bulk path?
- What's the roadmap to a real design system — why isn't Radix the answer today?
