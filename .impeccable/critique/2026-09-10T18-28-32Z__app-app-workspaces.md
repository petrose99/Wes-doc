---
target: my ui (core app screens), post-merge
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\marketing-ui-audio-review-e977c4\\app\\(app)\\workspaces"
timestamp: 2026-09-10T18-28-32Z
slug: app-app-workspaces
---
# Impeccable Critique — DocuBite core app UI, run 2 (post-merge f408178, five-stage lifecycle)

Method: dual-agent (A: design review · B: detector/browser evidence). Browser overlay skipped: dev stack unavailable in session; detector CLI ran (exit 2, 18 findings, ~15 false positives).

## Design Health Score — 28/40 (Good, borderline)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Best-in-class: ArrivalPoller, live-region counts, FX-pending chips |
| 2 | Match System / Real World | 3 | "Synced" empty copy misstates the sync condition (document-list.tsx:77) |
| 3 | User Control and Freedom | 2 | Bulk approve/reject: no confirm, no undo (both surfaces) |
| 4 | Consistency and Standards | 2 | Two "review" surfaces; tour still says "Extraction" for the "Documents" rail entry |
| 5 | Error Prevention | 3 | Delete now ConfirmDialog'd; bulk approve is the remaining gap |
| 6 | Recognition Rather Than Recall | 3 | Shortcuts only in a footnote; `p` advertised when push unavailable |
| 7 | Flexibility and Efficiency | 3 | Keyboard support only on /review, not the pipeline Review tab |
| 8 | Aesthetic and Minimalist Design | 3 | Dashboard deduped; review detail pane still 8+ stacked blocks |
| 9 | Error Recovery | 3 | Honest held-back toasts; push failure gives no fix path |
| 10 | Help and Documentation | 2 | Onboarding/tour copy describes the pre-merge product; lifecycle untaught |
| **Total** | | **28/40** | **Good (borderline)** |

## Design Specificity Verdict
3/4. Lifecycle spine + Tools rail, opinionated stage tabs, honest bulk-approve toasts ("Approved 3 — 2 held back"). Held back by two coexisting visual dialects (dashboard's polished panels vs review queue's bare borders) and hand-rolled buttons bypassing the Button primitive in the two highest-stakes components. Detector: 18 warnings (15 gray-on-color, 2 border-accent, 1 gradient-text); ~15 false positives; real items: dashboard's deprecated `?stage=to_review` URLs, sidebar hard-coded hexes, sub-40px bulk-bar touch targets.

## Priority Issues
1. [P0] Bulk approve unguarded in BOTH surfaces — review-inbox.tsx:294 and bulk-action-bar.tsx:93–96; bulk() has no undo (:246). Delete gets a full alertdialog; authorizing payment of N invoices gets nothing. Fix: ConfirmDialog + undo toast.
2. [P1] "Approved (30d)" label lies — page.tsx:81 labels all-time stageCounts.approved as 30-day (models/documents.ts:292 has no window). Window the query or drop "(30d)".
3. [P1] Half-applied rename debt (NEW from merge) — tour titled "Extraction" (lib/section-copy.ts:62) for the "Documents" rail; SECTION_COPY describes pre-merge flow; dashboard emits legacy `?stage=to_review` hrefs (page.tsx:159, 168); "Synced" empty copy wrong. One vocabulary sweep.
4. [P2] Focus-visible + ad-hoc sheet-choice modal — hand-rolled buttons in bulk-action-bar.tsx (93–122) and review-inbox.tsx (294–450) lack focus rings; overlay (bulk-action-bar.tsx:137–151) has no role/Esc/trap.
5. [P2] "Pushed to accounting" dead end — review-inbox.tsx:450–454; no link to bill/Synced tab (push-to-accounting-card.tsx knows externalBillId).

## Audit Health Score (technical) — 12/20 (Acceptable)
| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | No focus-visible on hand-rolled controls; mouse-only rows; untrapped overlay |
| 2 | Performance | 3 | Solid optimistic UI; skeleton churn on j/k |
| 3 | Responsive | 2 | Bulk-bar buttons ~26–28px; modal Cancel bare text |
| 4 | Theming | 2 | sidebar.tsx:139 hexes + raw rgba shadows; dark-mode tokens still dead |
| 5 | Implementation Integrity | 3 | Coherent lifecycle vocabulary (stages.ts) but leaking old names into UI URLs |

## Persona Red Flags
Alex: keyboard support lives on /review while the pipeline Review tab (now primary) has none; `p` hint shown when push unavailable; no select-all-across-pages.
Sam: sheet-choice overlay is a keyboard dead zone; tr onClick rows not focusable; no focus indicator on hand-rolled buttons; aria-current done right on tabs/rail.

## Minor Observations
Stale sidebar comment claims old PIPELINE_STAGES; indigo badge doing three jobs against an emerald CTA language; "bills cockpit" naming one-off; two voices for the same empty state; ConfirmDialog aria-label vs labelledby.

## Questions to Consider
- Should ReviewInbox BE the pipeline Review tab's renderer instead of a parallel page?
- The dashboard tells the product's biggest lie ("Approved (30d)") — which surface does a CFO screenshot?
- Is losing a PDF really more dangerous than authorizing payment of an invoice?
