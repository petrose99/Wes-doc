---
target: "Finance screen as the ledger / payment-run hand-off — journey evidence for #239, map #226"
total_score: 14
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/(chrome)/finance/page.tsx"
target_fingerprint: "sha256:2305a58e206dd73bd619a536a1a3b3c8d4d1f6100aec79eca9122968a64501a1"
target_path: /home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/(chrome)/finance/page.tsx
timestamp: 2026-09-15T22-25-51Z
slug: paces-workspaceid-chrome-finance-page-tsx-b434ebb2
---
Method: dual-agent (A: general-purpose design-review subagent, Playwright screenshots at 1440/390 viewport + full page; the running deployment has `BIGCAPITAL_ENABLED` unset so the route renders the workspace not-found, scored as rendered plus a code read of `components/accounting/accounting-dashboard.tsx` · B: general-purpose detector subagent — static + in-page `detect.js` at both widths). Mode: Operate. Journey evidence for #239 (map #226): scored as the Invoices → Finance ledger hand-off and the payment-run seam.

## Design Health Score — 14/40

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 1 | Push result is a transient `feedback` line; on full success the Ready-to-push card unmounts with the outcome (`accounting-dashboard.tsx:315`); "Push queued" (`:273`) names no place to watch |
| 2 | Match System / Real World | 1 | Confirm copy calls Bigcapital an "external ledger record" (`:410`) while CONTEXT.md defines it as the Built-in ledger; 404 copy "isn't here any more" describes a feature gate as a removal |
| 3 | User Control and Freedom | 2 | Itemised ConfirmDialog before push (good); no undo/void after push; no way to un-prepare a payment run |
| 4 | Consistency and Standards | 1 | One destination named five ways: "Push to Finance" (`:266`), "Pushed to accounting" (`:275`), "Open ledger" (`page.tsx:57`), "isolated accounting organization" (`:131`), `revalidatePath(…/accounting)` (`integration-push-actions.ts:155`, stale) |
| 5 | Error Prevention | 1 | Payment-run eligibility (`(queue)/invoices/page.tsx:54`) has no approval gate — an "In review" overdue invoice is payable; push requires `stage: "approved"` (`models/documents.ts:371`). Two rules for "what do I pay" |
| 6 | Recognition Rather Than Recall | 2 | Per-row account name appears only after clicking to load accounts (`:367-376`) |
| 7 | Flexibility and Efficiency | 3 | Push all, per-row push, per-row override, keyboard-reachable; overrides unpersisted (`:239`) |
| 8 | Aesthetic and Minimalist | 2 | Roadmap lede ("More integrations coming", `page.tsx:47`) and Accounts/Vendors entity strip above the work list |
| 9 | Error Recovery | 0 | Failed row says "retry" with no cause — server returns `{status:"failed"}` without `error` (`integration-push-actions.ts:147`); no link to the document (`:355-361`); approved docs failing `normalizeBillFromDocument` silently dropped (`documents.ts:387-389`) |
| 10 | Help and Documentation | 1 | Non-owners told they cannot manage the connection, not what they can do (push is member-level, `integration-push-actions.ts:137`) |

## Design Specificity Verdict
Generic. Cards with a coloured top bar, emerald primary, slate table; nothing carries the queue language (Mark, state pills, aging) across the hand-off.

## Detector evidence (Assessment B)
Static: 0. In-page: 6 @1440 · 5 @390, all repo-baseline false positives (0 real). Note: the in-page pass ran against the rendered route; with the ledger flag off that is the not-found boundary inside the shell.

## What's Working
- Confirm dialogs itemise filename, account, amount before any financial write (Server-confirmed action; `:406-426`).
- `aria-busy`, `role="status"/"alert"` live regions (`:135, :337`).
- Per-item results kept for failed rows (Partial outcome, `:358-360`); Retry label swaps in.
- Payment-run confirm says "No money moves" and shows an eligibility strip (`invoice-queue.tsx:206-212`).

## Priority Issues
- **P0** Payment run can include unapproved invoices; approval and payment eligibility disagree.
- **P0** Failed push carries no reason and no route to the document.
- **P1** Push outcome not durable on screen; "queued" has no Operation status home.
- **P1** Vocabulary drift Finance / accounting / ledger / external; 404 copy misdescribes the gate.
- **P2** Ready-to-push table at 390: five columns, Push button scrolls off (`:341`).
- **P2** Roadmap copy and entity counts outrank the work list.

## Persona Red Flags (bookkeeper closing the week)
- Approves 12, Finance shows 9, nothing explains the 3.
- Pushes all, 2 fail, message says retry not why; cannot click through to fix.
- Back on the queue, rows do not say "pushed": Synced comes from the ledger payment sync (`models/bills.ts:139`), not the push.
- Payment run is a CSV download; nothing lists runs, so "did I already pay this" has no answer next week.

## Hand-off defects (journey evidence)
1. No context carried from the queue (no Mark, aging, due, approval pill); "9 vs 12" unexplained.
2. Duplicate, conflicting answers to "what do I pay".
3. No way back to a failed document.
4. Payment run has no home after download.
5. Outcome not persisted.
6. In this deployment the hand-off dead-ends at a 404 that reads as a removal.

## Questions to Consider
- Is Finance on the daily route at all once Bill Pay (#229) exists (Q5 on #239)?
