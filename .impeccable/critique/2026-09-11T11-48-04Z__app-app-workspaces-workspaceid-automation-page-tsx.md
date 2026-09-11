---
target: Controls section (still feels cluttered)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\distracted-perlman-7db57c\\app\\(app)\\workspaces\\[workspaceId]\\automation\\page.tsx"
target_fingerprint: "sha256:e849441a811a93507e7e4010e258e29281b4da35dccd2d0f126855a7b916962e"
target_path: "C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\distracted-perlman-7db57c\\app\\(app)\\workspaces\\[workspaceId]\\automation\\page.tsx"
timestamp: 2026-09-11T11-48-04Z
slug: app-app-workspaces-workspaceid-automation-page-tsx
---
# Critique — Controls section ("still feels cluttered")
Method: dual-agent (A: design review · B: detector/browser evidence)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Live counts good; stale 30-day metrics contradict them on-screen |
| 2 | Match System / Real World | 3 | "Auto with approval" ambiguous |
| 3 | User Control and Freedom | 3 | Everything links out |
| 4 | Consistency and Standards | 1 | Spine "Review 0" vs panel "Blocked in Review 2"; "Approved" = 3 meanings |
| 5 | Error Prevention | 2 | Contradictory numbers invite wrong action |
| 6 | Recognition Rather Than Recall | 2 | Now vs 30-day unstated |
| 7 | Flexibility and Efficiency | 2 | No fast path to "why isn't it flowing" |
| 8 | Aesthetic and Minimalist Design | 1 | Over-narrated; dead-zero panels full weight |
| 9 | Error Recovery | 2 | 0% shown with no cause/next step |
| 10 | Help and Documentation | 2 | Help force-fed inline |
| Total | | 20/40 | Acceptable |

## Specificity
Authored, not generic. Detector: 0 findings. Clutter cause = narration volume (~1,400 chars prose, 8 font sizes, 25 links in main) + dead-zero panels, not object count. Vendors for contrast: 759 chars, 5 sizes, 5 links.

## Priority Issues
- [P0] Contradictory counts: spine (live) vs readiness ledger (30-day), no timeframe labels. Fix: scope-label or reconcile. → harden
- [P1] Page never answers "why isn't it flowing" though the system knows (no trusted vendor yet). Fix: diagnosis line under the 0% linking to Vendor rules. → clarify
- [P1] Cut narration ~60%: notes to one line, teaching copy behind disclosure/first-run. → distill
- [P2] Collapse dead-zero panels (Policy decisions, Matching) to one quiet line each. → distill
- [P2] Spine annotation aria-labels ("Vendor rules — governs Inbox→Review"). → audit

## Personas
Alex: 0% with no cause; ~17 equal links; distrusts contradictory counts. Sam: annotation links context-free in tab order; 0% not a heading/landmark; contradictions worse aurally.

## Minor
Three stacked bands before content; cognitive-load 6/8 fail; console clean; 0 unnamed controls.

## Questions
Manual or instrument panel — should teaching be first-run-only? When all metrics are zero, should the page compose around the diagnosis instead of the panel grid?
