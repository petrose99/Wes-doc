---
target: automation section
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\marketing-ui-audio-review-e977c4\\app\\(app)\\workspaces\\[workspaceId]\\automation"
timestamp: 2026-09-11T07-48-16Z
slug: app-app-workspaces-workspaceid-automation
---
# Design Critique — Automation section

Method: dual-agent (A: design-review agent · B: detector agent). Detector: 0 findings (exit 0). Browser overlay skipped: environment constraint.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Read-side status excellent; Settings never shows current effect of the numbers being edited |
| 2 | Match System / Real World | 4 | Best-in-class AP copy — "Codes itself", "Cold start", match-kind translations |
| 3 | User Control and Freedom | 2 | No undo anywhere; Pin-as-rule irreversible in-UI; no dirty-state/unsaved guard on Settings |
| 4 | Consistency and Standards | 2 | Approvals tab breaks the ledger design system; mixed button systems |
| 5 | Error Prevention | 2 | Free-typed 0–1 decimals accept "90"; bands can overlap/invert; empty stage names submit |
| 6 | Recognition Rather Than Recall | 3 | "Confidence bar 0.85" scale and band precedence held in memory |
| 7 | Flexibility and Efficiency | 2 | No search/sort on unbounded Vendors sheet, no bulk pin, no metric click-throughs |
| 8 | Aesthetic and Minimalist Design | 4 | One-figure-per-screen discipline, panels-as-rules |
| 9 | Error Recovery | 2 | Raw machine strings reach users: supplier_required, pin_failed, raw Error.message |
| 10 | Help and Documentation | 4 | Inline mechanism-teaching notes; only the two riskiest numbers unexplained |
| **Total** | | **28/40** | **Good** |

## Design Specificity Verdict

Authored, decisively. Stated visual thesis ("read as a ledger rather than a dashboard") enforced by a 188-line primitive system (Figure/Panel/LedgerRow/Pill in components/automation/automation-ui.tsx), semantic color as vocabulary, un-reusable domain copy. The one deserter: the Approvals tab, whose workflow form predates the ledger language.

Deterministic scan: clean — 0 findings across automation routes and components/automation.

## Priority Issues

1. [P0] Touchless activation has no guardrail — switching autonomy to Touchless saves with checkbox weight; add confirm/preview using getAutomationMetrics ("~N docs/month would publish untouched at 0.90"). → /impeccable harden
2. [P1] Raw error codes reach users (supplier_required, pin_failed, raw Error.message) — map to sentences at the client boundary. → /impeccable clarify
3. [P1] Free-typed 0–1 decimals invite magnitude errors ("90" for 0.90); bands overlap/invert unvalidated — clamp/validate before submit, inline field errors. → /impeccable harden
4. [P2] Approvals tab breaks the design system and overloads its form (per-member chip row unbounded; one box asks 5 things) — rebuild on ledger primitives, per-stage disclosure, combobox past ~5 members. → /impeccable polish + distill
5. [P2] "Pin as rule" fire-and-forget with silent duplication — detect existing rule, "Pinned ✓ — view rule" state. → /impeccable harden

## Persona Red Flags

Alex: no search/sort/pagination on Vendors; dead metrics (Blocked in Review 14 links nowhere, reviewCount fetched then voided); no dirty indicator/unsaved guard on Settings; workflow toggle silent (no optimistic update/toast).
Sam: AutomationTabs missing aria-current/aria-label; ladder blurbs not aria-describedby; approver chips missing aria-pressed; Labels missing htmlFor/for; th missing scope="col"; toast-only outcomes possibly unannounced.

## Cognitive Load

Moderate, concentrated in write paths: approval stage row multi-tasks 5 controls in one box; unbounded approver chips; amount bands require mental "first match wins" simulation with no reorder or rendered resolution; Settings stacks 6 regions, no hero, no progressive disclosure; opacity-55 dimmed-yet-editable ambiguity.

## Emotional Journey

Peak: Overview hero (72% published themselves) + trust ladder. End: weak — generic toast on the most consequential save. Valley: highest-stakes writes (Touchless, Pin) carry the least ceremony. Delete confirm done right, minus "FK is set-null" engineer-speak.

## Minor Observations

- getWorkspaceCapabilities called twice in approvals/page.tsx
- "≥ 10000" threshold chip unformatted/currency-less
- Unreachable Empty branch in Matches confidence panel
- Hard-coded hexes; #f1f5f9 is slate-100 spelled two ways
- Settings tab 404s for non-owners while its link still renders

## Questions to Consider

- Why is reviewCount fetched and voided on every page while "Blocked in Review" links nowhere?
- Trust ladder is read-only — what would promote/demote from the ladder unlock?
- Autonomy track metaphor only holds at sm:+ — robust, or breakpoint-lucky?
