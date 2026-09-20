# Area primer — Payments

Shipped by #251 (Payments queue). Reject-on-Approved + tightened self-approval note is #296.
Decisions live on #226. Same `QueueScreen` shell family as Approvals/PO rows (see
`docs/agents/areas/approvals.md` for the shared primitives — `QueueScreen`, `DetailPane`,
`ReasonDialog`, `ConfirmDialog`).

## Routes
`app/(app)/workspaces/[workspaceId]/(queue)/payments/` — desktop-only (excluded from the phone
tab bar, #251).

## Primitives
- `components/payments/batch-queue.tsx` — bulk bar (list view) and per-row status footers
  (Approved/Pending/Paid/Waiting/Rejected). Reject and Approve share the app's `ReasonDialog` /
  `ConfirmDialog`; no bespoke dialog forked for either origin.
- `components/payments/batch-detail.tsx` — the pane; owns the self-approval note and the audit
  trail line rendering (`describeAuditDetail`).
- `models/payment-batches.ts` — `rejectPaymentBatch`/`loadForDecision`. Reject accepts batches in
  `pending` **or** `approved` status; rejecting an Approved batch (self- or peer-approved) writes
  an audit detail carrying `fromStatus`, rendered as "(from Approved)" by `describeAuditDetail`.
  Rejecting a `paid` batch throws with no writes (terminal state, one shared guard, not per-caller).

## #296: Reject on Approved + tightened self-approval note
- Reject… button added to the Approved-status bar in `batch-queue.tsx`, owner-only
  (`{isOwner && <Button…>}`), reusing the single `rejectPaymentBatchAction` call site shared with
  the Pending-origin Reject button — no second action wired.
- Self-approval note ("…you can still reject it until it is marked paid") is one 130-char string,
  single-sourced, present byte-identical in both `batch-queue.tsx` and `batch-detail.tsx` — do not
  let a future edit fork it.
- `rejectPaymentBatch`'s `fromStatus`/`exportedAt` audit-detail fields are additive; any new
  caller of `loadForDecision` should expect those fields present when the batch was rejected from
  Approved.

## #331: claim rows on Bill Pay
`components/payments/bill-pay-queue.tsx` widened to `BillPayRow = BillPayBillRow |
BillPayClaimRow` (`models/bill-pay.ts`) — accessor helpers (`rowId`/`rowPayeeName`/`rowDue`/
`rowAmount`/`rowScheduled`) read either kind, never a per-column ternary. A claim row's detail
pane routes to the existing `getExpenseClaimDetailAction` → `ExpenseClaimDetail` (read-only),
not a second loader; its paid state (`DocumentClaimFacts.paidState`/`paidAt`/`paidBy` in
`lib/claims/facts.ts`) is the same derivation the row reads, shared with `claim-card.tsx`'s
Status line and `ApprovalTimeline`'s "Paid" entry — one source, never forked. Batching a claim
row (mixed-selection `createPaymentBatches`, the Reimbursements group) is out of #331's scope,
spawned as #347; the row/bulk-bar name the gap in place rather than hiding it. `BillPayClaimRow`
has no `payFrom` (no `BillPayPreference` for an `ExpenseClaim`) — the Pay From cell renders "—"
for a claim row, a disclosed model gap, not a fake value.

`claim-card.tsx`'s "unpaid" status line branches on `DocumentClaimFacts.paymentEligibility`
(`lib/claims/facts.ts`, populated by `buildClaimFacts` for approved claims) — the same
`claimPaymentEligibility` check `BillPayClaimRow.eligibility` (`models/bill-pay.ts`) already ran
for the row subtitle, one function. Ineligible prints `CLAIM_ELIGIBILITY_COPY[reason]` (amber,
e.g. "Needs bank details") instead of "Ready to pay" (emerald) — fixes a self-contradiction
(status line vs. CTA) only visible once the seed-approval-event fix below made the line render.

## #347: mixed bill/claim batching
`createPaymentBatches` (`models/payment-batches.ts`) now takes the full `BillPayRow` union —
one batch can hold both `PaymentRunItem`s. `getPaymentBatch` splits `BatchLine`s into `suppliers`
(bill-only, grouped by payee, unchanged from #251) and a `reimbursements` group appended *after*
every supplier group, never interleaved — the claim cluster is always last. `PaymentBatchRow`
carries `billCount` (doc-only, narrowed) and `claimCount`; `lib/payments/batch-counts.ts`'
`describeBatchCounts(billCount, claimCount)` is the one string for "how many lines, of which
kind" — read by the batch queue's Lines column (renamed from "Bills"), row summary, both confirm
dialogs' recap, the pane header, and the create-batch dialog's receipt/footer. A bill-only batch
renders byte-identical to the pre-#347 "n bills" text; a claim gets its own noun only once one is
present. Claims have no per-row Pay From override (`BillPayClaimRow` has no `payFrom`, #331) —
`create-batch-dialog.tsx`'s `defaultPayerAccount` prop is the only account a claim line can pay
from, disclosed on the batch, not the queue row. Claim line dates use "Approved"
(`formatPaymentDate(line.approvedAt)`), never "Due" — claims have no deadline (#331 precedent).
Capture recipe: extend `round296.mjs` with a states arg for "mixed batch open" / "claim-only
batch open" (claim-only: suppliers list renders nothing, no empty "This batch holds no lines"
message — that's reserved for a truly empty batch).

## Detector residue (report, do not chase)
App-wide four (`ai-color-palette`, `overused-font`, `layout-transition`, `dark-glow`), plus a
pre-existing (shipped by #251, unmodified by #296, just newly reachable via the Approved-origin
reject flow) `body-text-viewport-edge` flag on the terminal-status footer `<p>` in
`batch-queue.tsx` at 390px — the "Rejected {date}. Its invoices are back on Bill Pay." (and
Paid/Waiting equivalents) footer line. #331 adds three more, all pre-existing and named in
`queue-shell.md`/`detail-pane.md` for other queues: `clipped-overflow-container` (queue-shell
scroll scaffolding), `em-dash-overuse` (queue's "—" empty-cell placeholder), `text-overflow`
(pane-title `h2` truncate at 390px).

```residue
ai-color-palette
overused-font
layout-transition
dark-glow
body-text-viewport-edge.*57-char
em-dash-overuse
clipped-overflow-container.*md:overflow-hidden
text-overflow.*h2.*truncate
```

## Seed, dev server, capture
Same dev workspace/DB/server recipe as Approvals (`docs/agents/areas/approvals.md`). Capture:
`docs/wayfinder-reports/226/logs/scratch-296/round296.mjs <tag>` (5 states × 1440/390). Gate with
`scripts/wayfinder-autopilot/gate.mjs <shots> --baseline <prior> --residue-file residue.txt`.
At 390px the pane itself renders `role="dialog"` (full-screen sheet) alongside any confirm
dialog — a `[role=dialog], [role=alertdialog]` locator matches 2 elements there; use `.last()` for
the confirm dialog's text content and expect `<= 1` dialogs remaining after Escape (the pane stays
open, only the confirm dialog closes).

## Conventions the bar checks
"Reject…" opens `ReasonDialog` with a required reason; the Approve-confirm sentence states the
consequence in one line above the footer, not duplicated as a dialog subtitle. Keyboard: Escape
closes the innermost dialog only; focus returns sensibly after close.
