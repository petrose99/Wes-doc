---
target: my ui (core app screens)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\marketing-ui-audio-review-e977c4\\app\\(app)\\workspaces"
timestamp: 2026-09-10T18-16-30Z
slug: app-app-workspaces
---
# Impeccable Critique — DocuBite core app UI (app/(app)/workspaces)

Method: dual-agent (A: design review · B: detector/browser evidence). Browser overlay skipped: dev stack unavailable in session; detector CLI ran (exit 2, 17 findings, most verified false positives).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Pushed" to accounting gives no receipt/link |
| 2 | Match System / Real World | 3 | Nav labels drift: "Extraction"→/pipeline, /review titled "Automation" |
| 3 | User Control and Freedom | 3 | Bulk approve/reject has no undo; single-row does |
| 4 | Consistency and Standards | 2 | Three button systems; two modal systems (ad-hoc overlay lacks role/Esc/trap) |
| 5 | Error Prevention | 3 | Selects commit on change (assignee, startWorkflow) with no confirm |
| 6 | Recognition Rather Than Recall | 3 | Cryptic check chips ("Gap") meaning only in hover tooltip |
| 7 | Flexibility and Efficiency | 3 | j/k/e/p only in review queue; no keyboard bulk-select |
| 8 | Aesthetic and Minimalist Design | 2 | Dashboard shows the same 3 numbers twice; arbitrary px values everywhere |
| 9 | Error Recovery | 3 | Errors only in transient toasts, no persistent row marker |
| 10 | Help and Documentation | 2 | No in-context help for readiness/blockers/thresholds/"touchless" |
| **Total** | | **27/40** | **Acceptable (borderline Good)** |

## Design Specificity Verdict
Authored, unevenly (3/4). Deliberate token rationale (emerald primary, muted destructive, globals.css:15–37), a real Automation design language (ledger metaphor, Figure component, automation-ui.tsx:5–29), AP-specific micro-decisions (review table shows supplier/total not filename). But the review-queue detail pane and settings fall back to un-tokenized utility soup and hand-rolled buttons. Detector: 17 warnings (14 gray-on-color, 2 border-accent-on-rounded, 1 gradient-text); verified ~15 false positives; only real hit is the deliberate gradient in components/ui/colored-text.tsx:11 plus 2–3 borderline tinted-chip contrast polish items.

## Priority Issues
1. [P0] Bulk approve/reject unconfirmed and irreversible — review-inbox.tsx:292–296, 246–275. Approving N bills for payment is one unguarded click; deletes get confirmation but this doesn't. Fix: ConfirmDialog with count+total, add undo mirroring single-row toast. (/impeccable harden)
2. [P1] Component-system fragmentation → invisible keyboard focus — review-inbox.tsx:294–453, bulk-action-bar.tsx:72–129, page.tsx:187. Hand-rolled buttons lack the DS focus ring; ad-hoc sheet-choice modal lacks role="dialog"/Esc/focus trap. Fix: use Button and dialog.tsx everywhere. (/impeccable polish + harden)
3. [P1] Naming drift — sidebar.tsx:100 "Extraction"→/pipeline; review/page.tsx:44 H1 "Automation"; "Sheets"→/files; review badge on the Automation rail item. One name per surface across rail, URL, H1. (/impeccable clarify)
4. [P2] "Pushed to accounting" dead-end — review-inbox.tsx:450–454. No destination/external ID/link after the money-adjacent success. Reuse push-to-accounting-card inline. (/impeccable clarify)
5. [P2] Dashboard self-duplication — page.tsx:111–142. Same three counts as stat cards then as step cards. Keep the step row, drop the cards. (/impeccable distill)

## Audit Health Score (technical)

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | Focus invisible on hand-rolled controls; dialogs lack traps; slate-400 body text ~3.0:1; color-only ConfidenceDot |
| 2 | Performance | 3 | Solid optimistic UI; detail-pane skeleton churn on every j/k keystroke |
| 3 | Responsive Design | 2 | Icon buttons ~22–26px; hover-only (opacity-0 group-hover) actions unusable on touch |
| 4 | Theming | 2 | Token layer exists but shell/screens hardcode hexes; dark-mode tokens dead weight; bg-cream-100 custom token risk |
| 5 | Implementation Integrity | 3 | Coherent authored system; detector findings mostly false positives; drift isolated to review pane/settings |
| **Total** | | **12/20** | **Acceptable** |

## Persona Red Flags
Alex (power user): no keyboard bulk-select (no x/space); pipeline table has zero shortcuts while /review has j/k/e/p; no r-to-reject; selects fire on change; select-all only spans loaded rows.
Sam (keyboard/AT): tr onClick rows not focusable, no announcements; sheet-choice overlay tabs out into the page; ConfirmDialog lacks aria-describedby and focus restore; text-[10px] indigo confidence line; no skip link.

## Minor Observations
Dark mode tokens unused; --sidebar-* tokens ignored by the actual sidebar; "≥ 500" threshold chip has no currency; 12+ one-off font sizes on the dashboard; copy voice and prefers-reduced-motion handling are genuine strengths.

## Questions to Consider
- Why doesn't the review queue — the screen a clerk lives in — get the Automation ledger treatment?
- The app confirms deleting one document but not approving fifty for payment: whose risk is being optimized?
- How many rail nouns (Dashboard/Extraction/Pipeline/Automation/Review/Bills/Sheets/Files/Library) can one AP workflow sustain?
