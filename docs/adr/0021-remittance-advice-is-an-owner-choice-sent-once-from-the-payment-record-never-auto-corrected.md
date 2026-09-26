# Remittance advice is an Owner's choice, sent once from the Payment record through an outbox, and never corrected automatically

Payments are dormant (map #445), so the only proof that a supplier was paid is a **Payment record**: one written by Mark as paid, or later by a rail's Paid (ADR 0001, ADR 0010). **Remittance advice** is sent from that record and from nothing earlier. It is never sent on Scheduled, Sent or a Planned pay date, because none of those means the money has left (#454, 2026-09-26).

- **Who receives it.** It goes to a **Supplier contact** flagged *Gets remittance advice* (at most three per supplier). Contacts are kept in DocuBite and only Owners edit them, on Admin › Suppliers, with every change logged. The email on the ledger's vendor or contact record (QBO `Vendor.PrimaryEmailAddr`; Xero `Contact.EmailAddress` and `ContactPersons` with `IncludeInEmails`), or on an invoice, is **offered to pre-fill, never written**. This follows the spirit of ADR 0006. A contact is never pushed to the ledger.
- **Who decides.** The Owner who records the payment decides. The Mark as paid dialog carries *Send remittance advice to ‹email›*. It is on by default when the supplier has a flagged contact. A record that wasn't advised can be sent later from its record line. Nothing sends without that choice.
- **Once, through an outbox.** Each advice is a `RemittanceAdvice` queue row (the `WebhookDelivery` pattern), drained by the job worker. There is one advice per supplier, per currency, per recording action. A Payment record links to at most one advice, so a record is never advised twice. The send carries the advice id as its idempotency key.
- **Removal is never silent.** If a record is removed before its advice is sent, it drops off that advice, and an advice left empty is cancelled. An advice already sent is never corrected automatically. The removal dialog names it and offers *Send a correction to ‹email›*, off by default.

## Considered options

- **Send automatically on every Payment record.** Rejected. A record entered by hand may be a correction, a back-fill or a test. Emailing a supplier is an external act, so the person recording decides it, with the default set by whether a contact exists.
- **Sync contacts from the ledger.** Rejected. Ledger emails are often an invoicing inbox, not AP. Silent writes would also break the rule that people own supplier details (ADR 0006). Offering them to pre-fill costs one click.
- **Automatically correct a sent advice on removal.** Rejected. A second email the Owner didn't choose could confuse the supplier's AR team more than the mistake it fixes.
- **A role taxonomy on contacts (AP, sales, owner).** Rejected as unneeded. The one behaviour a contact drives is the remittance flag.

## Consequences

- When rails wake, a rail's Paid writes the same Payment record (ADR 0010), so remittance needs no change. Expense claims are excluded: the claimant sees the paid date in the app.
- A bounce reported by the email provider marks the contact **Bounced**. The contact is skipped until an Owner edits it, and it shows on the record line, on Suppliers and in Health Checks. A failed send retries with backoff, then offers Retry.
- The advice lists amounts in the Payment record's currency through the company-currency formatter (#457), and shows credits applied once Credit allocations exist (#463, ADR 0017). It carries no bank details, no link and no attachment.
