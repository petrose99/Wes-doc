---
target: my ui (core app screens), run 3 post-fixes
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\marketing-ui-audio-review-e977c4\\app\\(app)\\workspaces"
timestamp: 2026-09-10T18-41-08Z
slug: app-app-workspaces
---
# Impeccable Critique — DocuBite core app UI, run 3 (post ad46e84 fix batch)

Method: dual-agent (A: design review · B: detector/browser evidence). Browser overlay skipped: dev stack unavailable in session; detector CLI ran (exit 2, 16 findings, ~15 false positives).

## Design Health Score — 31/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Push receipt with destination + time is exemplary |
| 2 | Match System / Real World | 4 | Vocabulary sweep complete; "Approved" no longer lies |
| 3 | User Control and Freedom | 3 | Bulk undo + confirms landed; pipeline bulk approve still lacks undo (needs server action) |
| 4 | Consistency and Standards | 2 | Red buttons bypass DS destructive variant; two dialog primitives now |
| 5 | Error Prevention | 4 | Confirm gate covers bulk approve on both surfaces + stage-reject |
| 6 | Recognition Rather Than Recall | 3 | Shortcut legend only on /review |
| 7 | Flexibility and Efficiency | 3 | Keyboard parity /review vs pipeline Review tab still missing |
| 8 | Aesthetic and Minimalist Design | 3 | Duplicate success signal: toast + inline receipt for the same push |
| 9 | Error Recovery | 3 | "Push again" recovery path broken (stale closure — new bug) |
| 10 | Help and Documentation | 2 | No in-context lifecycle explainer on first /pipeline arrival |
| **Total** | | **31/40** | **Good** |

## Fix verification (ad46e84)
- Bulk approve/reject ConfirmDialog on both surfaces: VERIFIED. Undo on review-inbox bulk: VERIFIED. Stage-reject confirm: VERIFIED.
- Vocabulary sweep: VERIFIED clean (no user-facing to_review/Extraction/(30d) in swept files); leftovers adjacent: pipeline-shell.tsx:68–69 "(30d)" labels, column-chips.tsx:60 "Extraction instruction".
- DS Button unification: PARTIAL — zero hand-rolled <button> left, but red actions use ad-hoc red utilities instead of variant="destructive" (bulk-action-bar.tsx:131, review-inbox.tsx:325, :461).
- SheetChoiceDialog: VERIFIED full modal contract (role, aria-modal, labelledby/describedby, Esc, Tab trap, opener restore).
- Push receipt: VERIFIED rendering; NEW P1 regression — "Push again" is a no-op (stale closure over `pushed` in pushSelected; review-inbox.tsx:510 + the `p` shortcut), and the success toast duplicates the inline receipt.

## Priority Issues
1. [P1] "Push again" no-op — pushSelected closes over old `pushed` set and short-circuits (review-inbox.tsx:197–214, :510). Fix: force flag bypassing the guard.
2. [P1] Duplicate success signal — toast.success at :209 + inline receipt. Drop the toast.
3. [P2] Red actions bypass variant="destructive" (bulk-action-bar.tsx:131; review-inbox.tsx:325, :461).
4. [P2] Status row: four same-weight outline pills; promote "approved" as primary.
5. [P3] Receipt shows time only, no date; [P3] stage-reject ConfirmDialog nested in detail block (hoist).

## Persona Red Flags
Alex: `p` after a push silently no-ops (same closure bug); no legend on pipeline Review tab.
Sam: ConfirmDialog lacks aria-describedby (description not announced); paid/unpaid buttons color-only state, no aria-pressed.

## Detector
16 warnings (−2 vs run 2), ~15 false positives (state-swap hover tints, tab underlines), 1 intentional gradient (colored-text.tsx). No new true positives from ad46e84.

## Questions to Consider
- If the push receipt is the peak moment, why is the toast still firing on top of it?
- Should the UI mirror all four schema statuses, or is "in_review" a machine state users never pick?
- Two dialog primitives now exist — when does the DS get a proper <Dialog> peer?
