# A credit is a Credit allocation, never a Payment record; QuickBooks credit is applied in the ledger at payment time

DocuBite had no credit notes. A supplier's credit arrived as an invoice with a negative total: `remainingDue` read it as nothing owed, Bill Pay could never batch it, and both bill mappers would post a negative Bill (#451, owner, 2026-09-25). The owner's rule from ADRs 0007 and 0010 stands: the Payment line is the unit of *money* settlement, so a credit can never be a negative Payment line.

So a **Credit note** is its own document type in the Invoices destination, with a positive amount (the type carries the direction), reviewed, approved and posted like an invoice. Applying it writes a **Credit allocation** — credit note, invoice of the same supplier, amount — which is neither a Payment record nor a Payment line. An invoice's amount due is its total less its Payment records less its Credit allocations; the part of a credit note not allocated is **Supplier credit**. ADR 0001's precedence is unchanged (the ledger wins, then DocuBite's own records, then Scheduled/Sent, then Unpaid), but the derived state gains **Credited**: an invoice covered by credit alone never reads Paid, because no money moved.

Xero allocates for real: after both documents are posted, each allocation is its own idempotent queue row (`PUT CreditNotes/{id}/Allocations`), shown separately from the credit's post. QuickBooks Online has no allocation call — a VendorCredit is linked to a bill only inside a `BillPayment`, which ADR 0001 forbids this path to push. So on QBO DocuBite posts the VendorCredit, keeps the allocation on its side, and says so on the invoice (*Credit applied in DocuBite · apply it in QuickBooks when you pay*); QBO's own Pay Bills offers open credits, and once the ledger sync shows the bill's balance dropped, the ledger's answer wins.

## Considered options

- **Credit as a Payment record (`method: credit`).** Rejected: "Paid (recorded)" would claim money moved when none did, which is the question ADR 0001 exists to answer honestly.
- **Credit only as a deduction on Bill Pay's Amount to pay.** Rejected: it ties credit to paying, so an invoice covered wholly by credit could never close without a batch, and payments are dormant.
- **Push a zero-amount QBO BillPayment linking the Bill and the VendorCredit.** Deferred, not rejected: it needs an ADR 0001 amendment and proof that QBO accepts a zero `TotalAmt` without a bank account (unverified in docs/research/ledger-bill-capabilities.md). It waits with pushing Payment records to the ledger.
- **A negative-total Invoice or an `isCredit` flag.** Rejected: that is how the sign crept into checks and paid-state maths; a real type lets posting pick VendorCredit or ACCPAYCREDIT and checks tell the two apart.

## Consequences

- An allocation is refused while its invoice has an open Payment line (ADR 0007's one-open-line invariant); a void of a credit note with allocations is refused likewise.
- Changing or removing an allocation after the credit note is approved, and voiding a credit note, are Owner-only with a reason and an audit event, like removing a Payment record.
- A proposed allocation comes only from an exact match of the invoice number the credit cites against an open invoice of the same supplier — never a fuzzy match (as ADR 0015 for items).
- A QBO plan without VendorCredit (Simple Start) fails a blocking Check; an Invoice with a negative total fails a Check offering Move to credit note; existing negative-total invoices are reported and flagged, never converted automatically.
