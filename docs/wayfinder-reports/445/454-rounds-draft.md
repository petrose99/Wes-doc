# #454 grilling — facts and draft rounds (session 1, not yet posted)

## Facts from code (recon, 2026-09-26)
- `Supplier` prisma/schema.prisma:2761 — no email/contact field (`domain` closest). Admin › Suppliers `app/(app)/workspaces/[workspaceId]/admin/suppliers/page.tsx`; "Payment terms and bank details" panel is Owner-only (`updateSupplierPaymentsAction` settings/payments/actions.ts:78, audit `supplier.payment_terms_updated`).
- Payment record = `InvoicePayment` schema:2680 (amount, currencyCode, paidOn, method manual|batch, batchId, reference, recordedById, removedAt/ById/Reason — soft delete). Claims: `ExpenseClaimPayment`. Written by `markInvoicesPaid` models/payment-batches.ts:456 (bulk, one record per row) and `markPaymentBatchPaid` :425; removed by `removePaymentRecord` :516 / `removePaymentRecordsForDocument` :527. All actions Owner-only (payments/actions.tsx:77..). Audit events `invoice.payment_recorded`, `invoice.payment_record_removed`.
- Mark as paid dialog `components/payments/mark-paid-dialog.tsx` — date + optional reference, no method field.
- Email: Resend (`lib/email.ts:9`, from `RESEND_FROM_EMAIL` lib/config.ts:64). No bounce webhook, no outbox. Queue-row pattern: `WebhookDelivery` schema:1279 (`lib/webhook-delivery.ts`) and `IntegrationPush` schema:1356 (`lib/integration-push.ts`), drained by `app/api/internal/jobs/process/route.ts` + `worker/job-worker.ts:48`.
- Ledger: QBO `listVendors` quickbooks/client.ts:68 reads Id, DisplayName, Active only (not PrimaryEmailAddr). Xero `listContacts` xero/client.ts:47 keeps ContactID, Name, Status (not EmailAddress/ContactPersons); scope `accounting.contacts` present. Vendors sync to `AccountingEntity`, not `Supplier`.
- Roles: owner | reviewer | member (models/workspaces.ts:16).
- `buildRemittanceAdvices` lib/payments/remittance.ts:22 used by models/payment-runs.ts:85 and payment-batches.ts:245 → batch-detail.tsx:106 Remittance tab (copy text only). Never sent.
- No single company-currency formatter yet (#457 builds it). No Credit allocation model yet (#463 builds it).
- Ramp evidence: vendor gets "Payment delivered" email (business, invoice no., amount, date, memo) to the vendor profile's default contact email; batch = one email per vendor (support.ramp.com/ramp-emails-for-vendors-and-non-customers).
- CONTEXT.md already: "remittance (that is the advice sent to the supplier)" in Payment batch _Avoid_.

## Draft answers (recommendations taken; to be posted as the resolution)
1. User/goal: Owner records a payment; supplier's AR needs to know which invoices it covers. Assumption named: no user research.
2. **Supplier contact**: name (optional) + email, flag *Gets remittance advice* (≤ 3 flagged). No role taxonomy. New CONTEXT terms: Supplier contact, Remittance advice.
3. Edited by Owners only on Admin › Suppliers (same rule as the payments panel), audited.
4. Ledger/invoice emails are **offered to pre-fill, never written** (ADR 0006 spirit). QBO Vendor.PrimaryEmailAddr · Xero Contact.EmailAddress + ContactPersons(IncludeInEmails) · no ledger: typed only. Never pushed to the ledger.
5. Trigger: creation of a Payment record (manual or batch; rail Paid later writes the same record, ADR 0010). Never on Scheduled/Sent. Claims excluded (claimant sees paid date in app).
6. Owner's action at record time: Mark as paid dialog gains "Send remittance advice to ‹email›", default on when the supplier has a flagged contact; bulk says "to n of m suppliers". Later: per-record *Send remittance advice* while not yet advised. Reply-To = recording person.
7. Idempotent: `RemittanceAdvice` queue row (WebhookDelivery pattern), each InvoicePayment links to at most one advice; Resend Idempotency-Key = advice id (verify at build). One advice per supplier per currency per action.
8. Removed record: queued advice drops it (cancelled if empty); sent advice is never corrected automatically — removal dialog names it and offers "Send a correction to ‹email›", default off.
9. Content: company, supplier, paid date, reference, per invoice number/date/amount paid (+ still due on partial), credits applied (after #463), total; record's currency via #457 formatter; no bank details, no link, no attachment.
10. States: no contact (disabled checkbox with visible reason + Add contact), queued, sent, bounced (Resend webhook → contact marked Bounced, skipped until edited; shown on record line, Suppliers, Health Checks), failed (retry backoff, then Retry).
11. ADR 0021 (outbox, Owner's choice, never auto-correct, contacts never written from ledger).
12. Build tickets: (a) Supplier contacts + ledger pre-fill read (backend); (b) Contacts on Admin › Suppliers (surface); (c) Remittance advice outbox, builder, send job, bounce webhook (backend, blocked #457 #463); (d) Mark as paid option, record-line states, removal correction, Health Checks (surface, blocked c).
