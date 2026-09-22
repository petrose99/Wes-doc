---
status: accepted
---

# An approved Expense claim is paid through Bill Pay; the Claimant's bank details live on the membership, not in the vendor master

Approving an Expense claim records that its Claimant is owed a frozen amount (#247), and until now nothing in DocuBite could pay it: Bill Pay and Payment batches (#229, #251) only knew invoices, and the reimbursement happened somewhere else with no trace (#277, map #226). We decided that an approved claim is a **Bill Pay row whose payee is a person**, batched in the same Payment batch and the same payment file as supplier bills (one payer account, one currency, one file), and that the Claimant's bank details are stored **on their `WorkspaceMember` row** — masked in the UI, written only into the file, editable by the member and any owner, audited. A claim's paid state is derived from its own payment records only (ADR 0001 without the ledger source), and the claim's status vocabulary is untouched.

## Considered options

- **Leave reimbursement outside DocuBite** with a *Mark as reimbursed* action on the claim. Rejected: the workspace already knows it owes the money and already produces a payment file; a second, manual path for the same fact is a dead end for the Claimant and a second grammar for the payer.
- **Represent the Claimant as a `Supplier` of kind "person"** and reuse the supplier bank fields. Rejected: the vendor master feeds invoice matching, supplier statements and ledger posting; a person in it becomes a vendor everywhere, and one workspace's staff would appear as suppliers in reports.
- **Bank details on `User`**, shared across workspaces. Rejected: one company's payment details for a person would follow them into every other workspace they join; each workspace should hold only what it pays.
- **Claims only in their own batch.** Rejected: the invariant is payer account + currency, not payee kind; a separate batch doubles approvals for no reason the bank file needs.

## Consequences

- `PaymentRunItem` gains a nullable `expenseClaimId` (exactly one of `documentId` / `expenseClaimId` set; the double-batching unique moves with it) and a new `ExpenseClaimPayment` record mirrors `InvoicePayment`.
- Bill Pay's first column is *Payee*, and a claim row renders "—" for terms and never a discount or a countdown; Amount to pay is read-only at the frozen total (no partial reimbursement).
- Removing a member's bank details does not alter rows already in a batch; the file is built from the details at export time.
