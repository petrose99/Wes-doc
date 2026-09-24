# A Bank Statement is proof of payment outside the rail, and is never posted

A Bank Statement was postable and would have gone to the ledger as bank transactions through the API. But all three ledgers record API-created bank transactions as already-booked entries, not as lines waiting in the reconcile queue (docs/research/401-bank-feeds-lesotho-sa.md). A debit that paid a bill DocuBite had already posted would therefore book that spend twice. So a Bank Statement is never posted. Its lines reach the ledger as a statement file the ledger imports natively. The download is offered once the statement is Approved: OFX for Xero and Sage, QFX or a 3-column CSV for QuickBooks. Imported lines land in the ledger's reconcile queue and are matched there against the bills DocuBite posted. Inside DocuBite, a statement's only job is proof that an invoice or receipt was paid *outside* DocuBite. A **Statement match** pairs a debit line with a document, on exact amount only, dated from the document's date up to 60 days after it. It is never confirmed automatically. Any member who can approve documents may confirm it, and confirming marks the document Paid. It can be undone until the document goes onto a Payment line. A Statement match never touches a Payment line, because ADR 0009 leaves settlement to the rail (#403, owner, 2026-09-24).

## Considered options

- **Post statement lines as bank transactions through the API.** Rejected: it double-counts spend on bills already posted, and it presents DocuBite as a bank feed when it isn't one. Avoiding the double count would need line-to-bill payment matching on every provider, which is out of scope.
- **Keep the existing matcher (1% slack, amount alone).** Rejected, as ADR 0008 already did: a false Paid takes an unpaid invoice off Bill Pay.

## Consequences

- `bank_statement` leaves `PUSHABLE_DOC_TYPES`, and the Sage provider needs no bank-statement branch.
- An accepted match no longer marks a `LedgerTransaction` reconciled. "Reconciled" means only what the ledger reports.
