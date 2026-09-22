---
target: "Payments destination — Bill Pay + Payment Batches (#251, map #226), new UI after the fix batches"
total_score: 34
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/ubuntu/Dev/Wes-doc/components/payments/bill-pay-queue.tsx"
target_path: /home/ubuntu/Dev/Wes-doc/components/payments/bill-pay-queue.tsx
timestamp: 2026-09-16T03-50-00Z
slug: components-payments-bill-pay-queue-tsx
---
Method: dual-agent for Assessment A (general-purpose design-review subagent, read-only, screenshots at 1440/390: Bill Pay list · pane · Create batch dialog · receipt · Batches list · pane · Approve confirm · Reject · Mark paid · paid · un-marked). ⚠️ Assessment B ran single-context (the autopilot driver denies sub-agents Bash): static `impeccable detect --json` over `components/payments`, `(queue)/payments`, `components/settings/payments-settings.tsx` → `[]`; in-page `detect.js` via headless Chromium against the running dev server (seed `scripts/dev/seed-bill-pay.ts`). Mode: Operate. Two rounds: 27/40 → fixes → **34/40**.

## Design Health Score (confirming round)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 4 | Decided override + pane refresh; dated waiting copy; "Not downloaded yet" fact; download stamps on focus |
| 2 | Match System / Real World | 4 | en-ZA money/dates, "no money moves" at every step, "2/10 net 30" terms, split rule said before the write |
| 3 | User Control and Freedom | 3 | Reversal reachable (Remove payment records… on batches and rows); residual: `from=` on the last hops and ReasonDialog reset — fixed after the round |
| 4 | Consistency and Standards | 3 | One verb for the act; "Reject…" vs "Approve" ellipsis settled by the shell convention (… = needs more input); facet labels aligned to the band after the round |
| 5 | Error Prevention | 4 | Un-downloaded-file warning on Mark paid; scheduled rows excluded with a count; cents-validated amount; discount-expiry countdown on pending batches and in the Approve confirm |
| 6 | Recognition Rather Than Recall | 3 | Subtitles carry state; Approve confirm recaps; "default" tag now explained |
| 7 | Flexibility and Efficiency | 3 | Bulk bar with counts, per-row pane actions, deep links, aging buckets click-to-filter |
| 8 | Aesthetic and Minimalist Design | 3 | Currency column stays (#229 Q10 decided it); Approve confirm broken into lines after the round |
| 9 | Error Recovery | 4 | Every refusal inline with role=alert; honest network copy; receipts name left-out rows with reasons |
| 10 | Help and Documentation | 3 | File explainer under the batch facts; eligibility copy per row |
| **Total** | | **34/40** | **Good** |

## In-page detector (before → after, real findings only; residual 5 is app-wide: rail switcher gradient ×2, Inter share, body `transition: height`, `#ffba00` glow)

| Surface | 1440 | 390 |
|---|---|---|
| Bill Pay list | 5 → 5 | 5 → 5 |
| Bill Pay pane open | 6 → 5 | 6 → 5 |
| Create batch dialog | 9 → 5 | — (no bulk below md) |
| Mark as paid dialog / receipt | 5 / 5 | — |
| Payment Batches list | 5 → 5 | 5 → 5 |
| Payment Batches pane open | 5 → 5 | 6 → 5 |
| Batch Mark paid dialog / paid pane | 6 → 5 / 6 → 5 | — |
| Settings › Payments | 8 → 6 (residual + rail switcher `text-overflow`, shell) | 7 → 5 |

Fixed along the way: cramped `<a>` in Button asChild (py), nested-card rings → border-y, dialog description line length, flush border-y padding, sonner success contrast 4.3:1 → emerald-800.

## Strengths
- The `decisions`/`serverRows` identity override: row, subtitle and footer agree the instant the server says yes, no optimistic UI, self-clearing on fresh rows.
- Every refusal path is honest and local — row subtitle, dialog "Left out", receipt — and the scheduled case links to the batch that holds the invoice.

## Findings that contain a decision (ticketed on close)
- Scheduled rows are selectable-then-excluded; should they be unselectable for batching? → #276
- A single owner can submit, self-approve and mark paid alone; annotation vs a speed bump before the first real bank file → #278
