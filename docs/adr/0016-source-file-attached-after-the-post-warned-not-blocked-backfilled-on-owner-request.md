# The source file is attached after the post, as its own idempotent job; a file the ledger can't take warns and never blocks; back-fill only on an Owner's request

A posted bill in QuickBooks Online or Xero carried none of its evidence: the PDF or photo stayed in DocuBite, and an auditor opening the bill in the ledger found nothing behind it (#450, owner, 2026-09-25). Both ledgers take a file on a bill, but only once the bill exists (QBO `upload` then `POST /attachable`; Xero `PUT Invoices/{id}/Attachments/{FileName}`), and their limits are narrower than DocuBite's: Xero takes up to 10 MB a file and 10 files a bill, and QBO refuses WEBP and HEIC (docs/research/ledger-bill-capabilities.md, #447).

So after a post succeeds, DocuBite **attaches the bill's Source file** as a separate queue row, keyed to the post, with its own attempts, backoff and the ledger's attachment id. It is never attached twice: the file name is fixed at the start, and each attempt lists the bill's attachments and skips a match before it uploads. A split child attaches only its own pages, cut into a new PDF; the rest of its parent never enters this bill. HEIC and WEBP are converted to JPEG for the attach only; the stored source is untouched. Auth or missing-scope errors pause the row without spending an attempt; invalid, oversize or over-count files fail permanently with that reason; anything else retries, and a person who may Post can press Retry attaching on a retryable failure.

A Source file the ledger can't take is known before posting, and it raises a **warn** Check, not a blocking one: the bill posts, the file stays in DocuBite, and the posted bill says it was not attached and why. Bills posted before this change get their files only when an Owner runs the one-time back-fill from Admin › Integrations; nothing is back-filled per bill.

## Considered options

- **Attach inside the post attempt.** Rejected: a failed attach would either fail a bill that already exists in the ledger or retry its create.
- **Block posting when the ledger can't take the file**, as ADR 0014 blocks a value the ledger can't take. Rejected: ADR 0014 protects coded data the ledger would lose; the source file is evidence DocuBite keeps either way, and the person can't make a 14 MB PDF smaller inside DocuBite, so a block would hold a payable bill for nothing they can fix.
- **Attach the split parent's whole file.** Rejected: it puts other suppliers' invoices inside this bill.
- **Back-fill every posted bill automatically, or offer it per bill.** Rejected: it changes posted records without anyone deciding to, and a per-bill offer turns a one-time catch-up into routine work.
- **A workspace switch to turn attaching off.** Rejected for now: nobody asked, and it adds a state every post must honour; adding it later needs no migration.

## Consequences

- Xero connections need the `accounting.attachments` scope; a connection that lacks it waits (its attach rows paused) and the bill says the source file waits for Xero to be reconnected.
- The Nango proxy call gains a raw-binary variant (Xero) and a multipart or upload-then-link path (QBO).
- There is no supporting-document concept: one Source file per bill.
- ADR 0014 stands unchanged; this ADR covers only the file.
