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

## Detector residue (report, do not chase)
App-wide four (`ai-color-palette`, `overused-font`, `layout-transition`, `dark-glow`), plus a
pre-existing (shipped by #251, unmodified by #296, just newly reachable via the Approved-origin
reject flow) `body-text-viewport-edge` flag on the terminal-status footer `<p>` in
`batch-queue.tsx` at 390px — the "Rejected {date}. Its invoices are back on Bill Pay." (and
Paid/Waiting equivalents) footer line.

```residue
ai-color-palette
overused-font
layout-transition
dark-glow
body-text-viewport-edge.*57-char
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
