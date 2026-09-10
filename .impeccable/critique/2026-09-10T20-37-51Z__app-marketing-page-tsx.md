---
target: live landing page (run 2)
total_score: 25
max_score: 32
na_heuristics: 7,9
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\extracted-data-search-ai-ed0cdb\\app\\(marketing)\\page.tsx"
target_fingerprint: "sha256:e075fd3356ea5499acf5d2d2dc9dc232008f3949ff23eb59fc1812b671020ae2"
target_path: "C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\extracted-data-search-ai-ed0cdb\\app\\(marketing)\\page.tsx"
timestamp: 2026-09-10T20-37-51Z
slug: app-marketing-page-tsx
---
# Impeccable Critique — DocuBite landing page, run 2 (post six-pass sweep, live at docubite.app)

Method: dual-agent (A: design-review subagent · B: detector/browser-evidence subagent). Live site == source (commit e2c148b deployed).

## Design Health Score — 25/32 (Good, 78%) — up from 24/32

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Scroll-spy works, but anchor clicks clip section headlines under the sticky header |
| 2 | Match System / Real World | 3 | "ERP", "idempotency", unexplained "SA + CMA" remain |
| 3 | User Control and Freedom | 3 | No traps; long page has few escape hatches |
| 4 | Consistency and Standards | 4 | Dupe = red everywhere; chips consistent hero→pipeline; CTA pair identical in all placements |
| 5 | Error Prevention | 3 | Reassurance under CTAs + "does not move money" preempt the big misreadings |
| 6 | Recognition Rather Than Recall | 3 | 3-act ↔ 7-step mapping works; "Your part is three of them" headline forces recall of an unseen referent |
| 7 | Flexibility and Efficiency | n/a | Persuade surface |
| 8 | Aesthetic and Minimalist Design | 3 | Hero excellent now; still 18 sections / ~10 viewport-heights of deep-dive |
| 9 | Error Recovery | n/a | Static persuade surface |
| 10 | Help and Documentation | 3 | FAQ substantive; CTA subtexts a genuinely good pattern |
| **Total** | | **25/32** | **Good (78%)** |

## Fix verification (previous run's issues)
- Hero density mobile: FIXED — 20-word paragraph, CTA 0.49 viewport-heights down at 375px (B measured 396px top)
- Mobile nav: FIXED — hamburger works, 5 links + Sign in, closes on tap (B verified via aria-expanded + visible links)
- Nav trim + scroll-spy: FIXED — exactly 5 links, active state verified live (font-weight 600 swap)
- ApLoop/HowItWorks duplication: FIXED — 3-act summary + numbered rail scaffolding works
- FAQ +/−: FIXED (verified open state swaps glyphs)
- Dupe red + shadow + Comparison id: FIXED
- Detector: [] across all 22 marketing files; zero console errors; no overflow at 375px; no blank sections; /pricing renders

## Priority Issues (fresh)
1. **[P1] Anchor targets clip under the sticky header** — scroll-margin-top: 0 on #ap-loop/#extraction/#automation/#faq/#how; the ~64px sticky header decapitates every section headline on every nav click, and scroll-spy nav made anchors the primary navigation. Fix: scroll-mt-20 on anchored sections.
2. **[P1] Pricing nav link leads to a page with no prices** — "we'll show you the plan that matches your volume" converts the highest-intent click into a bait-and-switch feeling. Fix: publish a from-price or volume bands, or relabel the link.
3. **[P2] "Your part is three of them" headline is a riddle** — "them" = the seven steps, which appear below. Fix: "The whole loop, in three acts", sub-line carries the 3-of-7.
4. **[P2] Proof strip acronyms unexplained** — "SA + CMA out of the box" is the page's first regional mention. Fix: "South Africa + neighbours, no bank switch", or swap the card.
5. **[P3] Residual jargon + smallprint stacking** — "idempotency" → "a retry never posts twice"; hero smallprint is two topics/three lines with a mobile orphan ("storage.").

## Persona verification
- Jordan: mobile menu FIXED, CTA position FIXED; "ERP" and "CMA" still opaque; NEW: first nav click lands on a clipped headline.
- Riley: pricing page is the kill shot; "fraud checks other tools miss" ×2 unsubstantiated; "keys managed for you" names no auditor; zero customers/numbers/humans page-wide.
- Casey: header targets 36px (under 44px comfort) and menu button sits beside the CTA; orphaned "storage." line at 375px; 7-step rail long but scannable.

## Minor observations
- 7-col desktop ApLoop cards ~140px wide; "Check" copy wraps 9 lines, ragged baselines.
- Hero mock "Documents 7" badge indigo vs emerald accent elsewhere.
- InlineTrialCta references "the report" four sections before it's introduced.
- Final TrialCta drops the "you still pay from your own bank" reassurance at the last decision moment.
- Reveal animations show blank white cards at fast desktop scroll between Provenance and FolderChecks.

## Questions to consider
1. If pricing isn't real yet, why does it hold one of five nav slots?
2. The page shows the product eleven times and a human zero times — when the first customer quote exists, which mock gets deleted to make room?
