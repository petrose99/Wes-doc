---
status: accepted
---

# Bank details are saved only by people, a change holds the Payee until an Owner decides it, and a batch snapshots the details at submit

Changing a supplier's bank details is where supplier-payment fraud happens: an invoice or email arrives saying "we've changed banks". DocuBite does not verify bank accounts (no AVS, no call-back workflow; the Owner confirms with the supplier, map #406), so its control is narrower: it notices a change and makes an Owner decide it. We decided (#409) that **bank details are only ever saved by a person**, and that extraction may compare and pre-fill but never write. A **Bank details change** (bank, branch code or account number) **holds the Payee** until another Owner acknowledges or rejects it, and a Payment batch **stores each line's bank details at submit** so the file always pays the account that was approved. The details on an invoice that differ from those on file fail the existing blocking `bank_detail_change` Check. That Check is widened from IBAN only to the account and branch code too.

## Considered options

- **Keep learning bank details from invoices** (the first-sight IBAN save in `models/document-checks.ts`, the per-document IBAN overwrite in `lib/suppliers/alias.ts`). Rejected: the overwrite let one fraudulent invoice replace the details the Check compares against, with no audit. Even the first-sight save means a document, not a person, chose where money goes.
- **Warn-only invoice Check.** Rejected: it would loosen a control that already blocks approval. The reviewer's way through is to update the supplier's details, which starts the hold.
- **Read bank details live when the file is downloaded** (today's `instructionsFor`, and ADR 0003's "built from the details at export time"). Rejected: an edit after approval silently changed the account in an approved file. Snapshotting makes the approved account and the paid account the same fact. A change rejects any pending or approved batch holding the Payee instead.
- **Require proof** (a Bank confirmation letter) to acknowledge. Rejected by the owner: confirming the account is the Owner's responsibility. The letter is an optional attachment that pre-fills and is shown at the decision, never a requirement and never a "verified" mark.

## Consequences

- The IBAN writes in `models/document-checks.ts` and `lib/suppliers/alias.ts` are removed. `Supplier.iban` stays only as a matching key, never used as payable bank details.
- The five copies of `details.account ?? details.iban ?? supplier.iban` collapse to one reader of the acknowledged details.
- Bank details carry versions: the acknowledged details, an optional pending change with who made it, the decision (acknowledged or rejected, by whom and when, self-acknowledged when the sole Owner decides their own change), and an optional Bank confirmation file per version. The same applies to a Claimant's membership details (ADR 0003), where a change is to the account number or branch code.
- Bill Pay gains an eligibility reason for a held Payee, and `PaymentRunItem` gains the snapshotted bank details. ADR 0003's export-time consequence is superseded for new batches.
