---
status: accepted
---

# An invoice's paid state is derived, ledger first, then DocuBite's own payment records

DocuBite prepares payment files and never moves money, so "paid" was only ever a fact the ledger sync reported (`models/ledger-payments.ts`); a workspace without a connected ledger could never mark anything paid, and a downloaded payment file left no trace on the invoice (#229, map #226). We decided that Mark as paid and a paid payment batch write **payment records** (an amount, a date, a method, an optional reference) on DocuBite's side, and that the invoice's paid state is **derived** at read time: the ledger's confirmation wins when it exists; otherwise the sum of payment records against the amount due decides Paid, Partially paid or Unpaid, and membership of a pending or approved batch reads as Scheduled. Payment records are never pushed to the ledger by this path — ledger placement stays the Finance push's job — so a record and a ledger line can disagree, and the row must say which source it is reading.

## Considered options

- **Store `paidAt` on the Document.** Rejected: no partial payments, no reversal trail, and it would silently overwrite the ledger's answer.
- **Only trust the ledger.** Rejected: most workspaces in the sandbox have no ledger connected, and a batch that was uploaded to the bank would still read Unpaid the following week ("did I already pay this?" had no answer, Finance critique 14/40).
- **Push a payment to the ledger on Mark as paid.** Rejected for this map: approval never publishes (#227) and the ledger hand-off is #248's decision.

## Consequences

- `BillRow.paymentStatus` grows a `source: "ledger" | "recorded"` alongside the derived state, and the queue pill says "Paid (recorded)" when the ledger has not confirmed.
- Removing a payment record needs a reason and an audit event; nothing else can flip Paid back to Unpaid.
- The ledger sync overriding a recorded payment is a counter-metric worth watching (measure, #229 Q17).

## Amendment (#410, ADR 0007)

Batches now settle per Payment line. A line whose batch was Sent and that hasn't settled reads **Sent**, at the same level as Scheduled: after the ledger and payment records, before Unpaid. The precedence above is unchanged. A Paid line writes its payment record; the batch no longer does.
