---
target: my ui (core app screens), run 5 final sweep
total_score: 39
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\marketing-ui-audio-review-e977c4\\app\\(app)\\workspaces"
timestamp: 2026-09-10T19-06-38Z
slug: app-app-workspaces
---
# Impeccable Critique — DocuBite core app UI, run 5 (post 91f5161 P2/P3 sweep)

Method: dual-agent (A: design review · B: detector/browser evidence). Browser overlay skipped: dev stack unavailable in session; detector CLI ran (15 warnings, flat vs run 4, no new findings).

## Design Health Score — 39/40 (Excellent)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Push receipt survives reload |
| 2 | Match System / Real World | 4 | Last false promise (stage-reject "reason") closed |
| 3 | User Control and Freedom | 4 | Modifier short-circuit returns Cmd/Ctrl+A to the browser |
| 4 | Consistency and Standards | 4 | Per-instance useId() ends the aria collision |
| 5 | Error Prevention | 4 | Copy no longer implies a field that doesn't exist |
| 6 | Recognition Rather Than Recall | 4 | Sticky shortcut legend above the scroll region |
| 7 | Flexibility and Efficiency | 4 | A/BUTTON tag guard; keyboard model internally consistent |
| 8 | Aesthetic and Minimalist Design | 3 | Fine but not distinctive; no visual pass claimed |
| 9 | Error Recovery | 4 | Index clamp + server hydration close the invisible-state modes |
| 10 | Help and Documentation | 3 | Legend discoverable; a `?` overlay would earn the 4 |
| **Total** | | **39/40** | **Excellent** |

Design-specificity: 4/4 — "a maker who reads their own screens."

## Fix verification (91f5161) — all seven FULLY FIXED, no regressions
useId dialogs · keyboard tag/modifier guard · stage-reject copy · focusedIndex clamp · push-receipt hydration (memory > server two-layer) · sticky legend · contrast trio.

## Remaining issues (all small)
1. [P2] First `k` press from default focus jumps to last row with no visible cue (document-list.tsx:128) — init focusedIndex to null + hint.
2. [P2] Focus tracked by index, not row id — a filter change can silently re-point j/k selection at a different document (Enter on the wrong row during heavy triage).
3. [P2] Legend hidden when the Review tab is empty — render dimmed instead.
4. [P3] ConfirmDialog FOCUSABLE set omits inputs/textareas — future "add note" field would be untabbable.
5. Detector's remaining honest items: idle slate-600-on-tint pairings in synoptic-form.tsx:30, ap-aging-chart.tsx:16, field-row.tsx:125/130.

## Structural questions surfaced
- Why don't Synced rows carry the push receipt as a row chip?
- /pipeline Review tab vs /review inbox: two surfaces, one job — every fix lands twice. Which goes away?
- "Add a note on the document" — is that flow one click or five?

## Detector
15 warnings (17 → 18 → 16 → 15 → 15), composition unchanged; run-4's "genuine contrast trio" reclassified as hover-swap false positives (fixes kept — they still improve idle legibility). No new findings from 91f5161.
