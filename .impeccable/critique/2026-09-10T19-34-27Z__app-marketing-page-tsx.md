---
target: landing page
total_score: 24
max_score: 32
na_heuristics: 7,9
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\extracted-data-search-ai-ed0cdb\\app\\(marketing)\\page.tsx"
target_fingerprint: "sha256:d5a41deed9ad0c9b50d8220540224ce9e52e915fac111ee4393c8a92bdaf2b0f"
target_path: "C:\\Users\\ADMIN\\Downloads\\TaxHacker-main\\TaxHacker-main\\.claude\\worktrees\\extracted-data-search-ai-ed0cdb\\app\\(marketing)\\page.tsx"
timestamp: 2026-09-10T19-34-27Z
slug: app-marketing-page-tsx
---
# Impeccable Critique — DocuBite landing page (app/(marketing)/page.tsx, AP-repositioned rewrite)

Method: dual-agent (A: design-review subagent · B: detector/browser-evidence subagent)

## Design Health Score — 24/32 (Good, 75%)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No scroll-spy active state on the 7 anchor links |
| 2 | Match System / Real World | 4 | Bookkeeper vocabulary throughout; mock data behaves like real ledger data |
| 3 | User Control and Freedom | 3 | No prefers-reduced-motion guards on sweeps/count-ups/pops |
| 4 | Consistency and Standards | 3 | `dupe` red in hero vs indigo in Pipeline; indigo double-duty; nav labels ≠ section eyebrows |
| 5 | Error Prevention | 3 | Risk-reducers present; nothing misleading |
| 6 | Recognition Rather Than Recall | 2 | 16 sections; AP-loop's 7 steps re-explained across 8 more sections |
| 7 | Flexibility and Efficiency | n/a | Persuade surface; anchor nav suffices |
| 8 | Aesthetic and Minimalist Design | 2 | 70-word hero sentence naming ~9 features; ApLoop + HowItWorks both enumerate the process |
| 9 | Error Recovery | n/a | Little applies on a static persuade surface |
| 10 | Help and Documentation | 4 | FAQ is the best section on the page — concrete, non-evasive answers |
| **Total** | | **24/32** | **Good (75%)** |

## Design Specificity Verdict — Authored, convincingly

LLM assessment: the page could not be swapped onto a competitor without a rewrite. Mock UIs are the product's actual data model (INV-4471 dupe pair, receipt-cafe.heic, "January statement missing"); one recurring document cast runs Hero → FolderChecks → Pipeline → Sheets → Accounting. The visual language has a thesis — cream paper, perforation tear strip, dot-grid ledger backgrounds, marker-highlight underlines, scan-line sweep. Interaction is argumentative: the Automation animation lands its "Codes itself" badge only after the third invoice, matching the real threshold rule. One genericizing weakness: the section scaffold (eyebrow → clamp headline → paragraph → mock panel, alternating, ×16) is the standard SaaS long-scroll skeleton and its rhythm turns metronomic.

Deterministic scan: **clean — 0 findings, exit 0** across all ~22 marketing files (page, layout, 17 landing components, nav, footer, marquee, reveal). No false positives to flag.

Browser evidence: mutation preflight passed; **no overlay used**. Live-site sweep at deep scroll found 0 hidden elements (scroll-reveal suspicion cleared); console clean; 375px has no horizontal overflow. One timing artifact: entrance animations can leave demo-card bodies blank in fast captures (Accounting "Ready to push" rows). **Critical finding: live docubite.app still serves the pre-AP-repositioning page — this rewrite is not deployed.**

## Overall Impression

A genuinely authored page with the rarest quality in SaaS marketing — mock UIs that argue instead of decorate — undermined by volume (16 sections, two competing process enumerations, a 70-word hero sentence) and missing the two things a skeptical bookkeeper needs most: social proof and pricing. And none of it is live yet.

## What's Working

1. Mock UIs that demonstrate claims (61%-confidence PO "waiting for you", dupe pair, pegged Loti row).
2. Trust engineering: "DocuBite does not move money", ladder starting at "Suggest", "What still stops it", FAQ answers that read like real support history.
3. A coherent ownable visual identity (cream paper / perforation / emerald-as-verified) executed with consistent tokens across 17 files — confirmed mechanically clean by the detector.

## Priority Issues

1. **[P0] The reviewed design isn't deployed** — live site serves the old positioning. Fix: ship the branch; treat this critique as the release gate. (No impeccable command; deploy.)
2. **[P1] Hero paragraph is a 70-word single sentence naming ~9 features** (hero.tsx). Fix: cut to ≤25 words on the single promise; let ApLoop carry the enumeration. → /impeccable clarify + distill
3. **[P1] No social proof and no pricing anywhere.** Decision blockers for bookkeepers at trial time. Fix: proof strip where ReadsStrip sits; Pricing link in nav. → /impeccable shape
4. **[P2] ApLoop (7 steps) and HowItWorks (3 steps) compete** — adjacent enumerations of the same process; 7 cards wrap 4+3, breaking the "loop". Fix: map 01/02/03 onto the loop or cut; render ApLoop as an actual rail. → /impeccable distill + layout
5. **[P2] Nav: 9 choices, no mobile menu at all (anchors are hidden md:flex), labels mismatch eyebrows, no active state, and "AP loop" — the flagship — is missing.** Fix: 4–5 anchors incl. Pricing, scroll-spy, mobile menu. → /impeccable adapt + layout
6. **[P3] Status-color drift** (dupe red vs indigo; indigo double-duty) and missing prefers-reduced-motion guards. → /impeccable polish

## Persona Red Flags

**Jordan (first-timer):** "2- and 3-way matching", "bank-ready payment file", "payment-license perimeter" are jargon walls in the first screens; the plain reassurance ("you still pay from your bank like today") is hidden in collapsed FAQ item 7. Two undifferentiated CTAs.

**Riley (stress tester):** claims without receipts — no customers, no accuracy figure, no SOC2/POPIA mention for an SA audience; Comparison's "By hand" column is a strawman vs the real Dext/Hubdoc alternative; "a rate that hasn't landed blocks the push — then what?"; FAQ export answer not updated for the AP story (no Bigcapital/payment files).

**Casey (mobile, one thumb):** hero CTA lands ~3–4 viewports down at 375px; no mobile nav menu at all; play-on-scroll payoffs (up to 2.6s) never fire for a fast scroller — the argument literally doesn't land.

## Minor Observations

- "42 rows exported to Excel" (Sheets) vs "23 rows exported to CSV" (Pipeline) for the same March close.
- Hero mock carries dark-theme remnants (rgba(0,0,0,.38) shadow, border-white/10) on a cream page.
- ReadsStrip occupies the prime post-hero slot convention reserves for social proof.
- FAQ "+" markers never flip to "−" when open.
- Comparison section has no id — the best persuasion asset can't be deep-linked; #trace/#checks ids don't match section names.
- Meta description 60+ words; SERPs truncate ~25.
- Entrance animations can show blank demo-card bodies in fast/automated captures.

## Questions to Consider

1. If the product is now "AI accounts payable, end to end," why do 10 of 16 sections still tell the document-inbox story?
2. "We don't move money" is defended in prose three times — could the payment-file handoff be demonstrated (mock bank file + remittance) like every other claim?
3. What would this page lose if it were half as long? The strongest asset (Comparison) sits at position ~14 of 16 — who is the full scroll for?
