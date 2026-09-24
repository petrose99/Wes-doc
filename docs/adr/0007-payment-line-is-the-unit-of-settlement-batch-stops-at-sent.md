---
status: accepted, partly superseded by ADR 0009 (2026-09-23) — the file, Sent-by-person and bank-code routing no longer hold; the line, its reference, one open line and the settle entry point stand
---

# The Payment line is the unit of settlement; a batch stops at Sent

DocuBite writes bank files and never moves money, so it learns what was paid only from a Bank Statement line or from a person, and no bank portal returns a machine-readable paid/failed file (#407). Until now a whole batch was marked paid in one step, with one typed reference; a bill could sit in two live batches (the `documentId` index was never unique); and the file's reference was the invoice number, uncapped, which fits no bank's limit and is not unique. We decided (#410) that **each Payment line settles on its own**, and that the batch's own lifecycle **ends at Sent**. Each line carries a **Line reference**: `DB` plus eight characters, unique in the workspace, never reused. The reference is written first in every reference field of the file. An invoice or claim has **at most one open line**, and the database enforces this.

## The model

- **Batch:** Pending approval → Approved → Sent, or Rejected (only before Sent).
  - Any member confirms Sent. The file must have been downloaded first, and who and when are recorded.
  - Undo Sent (back to Approved) is allowed while no line has settled.
  - "Settled" is read from the batch's lines and never stored. The batch-level `paid` status and Unmark paid go.
- **Line:** Queued → Sent → Paid | Failed, or Queued → Withdrawn when its batch is rejected. The status is stored on the line.
  - Each time a row enters a batch it gets a new line. A withdrawn or failed line keeps its identity for good.
- **Open:** a line is open while Queued or Sent. A partial unique index enforces one open line per invoice and one per claim.
  - Eligibility is re-read inside the transaction that creates the batch.
- **Settling:** one entry point settles a line with an outcome, a source (`statement` | `manual`) and evidence (statement line or reason).
  - Paid by hand, Failed, Undo paid (Paid → Sent, shown as Reversed) and Returned (Paid → Failed) are Owner only, with a reason.
  - "Bank rejected the file" fails every open line at once.
  - "Mark all open lines paid" is a bulk manual settle with one date and one reason.
- **Payment record:** a Paid line writes one invoice or claim payment record in the same transaction (`method: "batch"`), with a unique link to the line, so settling twice cannot write twice.
  - Undo paid and Returned soft-remove the record with a reason.
  - ADR 0001 is unchanged: the ledger still wins.
- **Late Paid:** a statement may pay a Failed or Withdrawn line. That line settles Paid anyway, because the money left the account. The bill's newer open line then depends on its batch:
  - If its batch is not yet Sent, the batch is rejected automatically, with the "don't upload a file you already downloaded" notice.
  - If its batch is already Sent, both lines are flagged **Paid twice** for the Owner to recover.
- **References in the file:** the limit that fits every bank is 16 characters, alphanumeric plus space.
  - Where the bank has an own reference and a recipient reference, the Line reference goes in the own reference and the invoice number in the recipient reference.
  - Where the bank has one per-line field, the file writes `<Line reference> <tail of invoice number>`, cut to that bank's limit.

## The route seam

A batch stores `route: "bank_file"` and a bank-specific `format`, both chosen at submit from the payer account's bank. The payer account names its bank from a fixed list, not free text. The Line reference id is the idempotency key, and the settle entry point records its source. A later payout route would add a route value, a source value and the code that decides it; nothing more is built now (map #406 keeps live payouts out of scope, #408).

A line whose Payee account the payer bank's file can't carry never enters a batch. The case today is an LS payer account paying a ZA account: LS↔ZA EFT ended in 2024. Such a row shows a Bill Pay reason instead.

## Considered options

- **Keep batch-level Mark paid.** Rejected: banks fail single lines, and some reject a whole file for one bad line (Nedbank LS). A batch-level state can't say "3 of 5 paid, 1 failed", and one typed reference can't be matched to a statement.
- **Identity per bill, reused across batches.** Rejected: a late match on a rejected file's line could not be told apart from the new one, which hides a double payment.
- **The invoice number as the reference.** Rejected: it isn't unique, isn't always present, and is too long for Capitec (16).
- **A stored batch `settled` state.** Rejected: a second state machine that can drift from its lines.
- **A provider/plug-in interface for routes.** Rejected: there is one route. The seam is a column and a source value, sized for #408's finding.

## Consequences

- Migration:
  - Existing `paid` batches become `sent`, with their lines Paid (source `manual`, reason "Recorded before line settlement").
  - Legacy `draft` and `sent` batches become `approved`.
  - Inactive lines of rejected batches become Withdrawn.
  - Duplicate open lines are reported before the unique index is switched on.
- The legacy payment-run path (`preparePaymentRun`, `markPaymentRunSent`, reached from `(chrome)/bills`) is deleted.
- ADR 0001's derived paid state gains **Sent** at the same level as Scheduled (after the ledger and payment records, before Unpaid).
- Bill Pay's Mark as paid (method `manual`, a payment made outside DocuBite) never touches a line.
- How a statement line is judged to match a line (reference, amount, date, consolidated debits) is decided separately in "Decide how a Sent Payment line settles".
