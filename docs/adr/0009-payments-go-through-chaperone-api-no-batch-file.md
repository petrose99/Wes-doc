---
status: accepted
---

# Payments go through Chaperone's API from each workspace's own account; there is no batch-file model

ADRs 0007 and 0008 had DocuBite write a bank file for the customer to upload. DocuBite would learn the outcome only from a Bank Statement line or from a person, because no bank portal returns a machine-readable paid/failed file (#407). That meant a lot of matching work for a model that never confirms in real time. The owner decided (2026-09-23, map #421) to drop the file model entirely. **An approved Payment batch pays through a rail's API**. The first and only rail at launch is **Chaperone**, which is licensed by the Central Bank of Lesotho for digital payments and is the payer of record, so DocuBite needs no licence of its own. Each workspace pays from **its own Chaperone merchant account**, whose credentials DocuBite keeps sealed. DocuBite never holds or pools customer funds.

## Consequences

- One pay-supplier seam: the payment ID is the Payment line's Line reference (the idempotency key), and a router picks the rail by the payer account. A rail is wired only if it can submit, return a reference straight away, report status (webhook first, polling as backup) and confirm settlement.
- **Sent** means the rail accepted the line and returned its reference. It is recorded automatically and cannot be undone. **Paid** and **Failed** come from the rail's report, or from an Owner by hand with a reason.
- ADR 0008 is superseded: statement lines settle nothing, and the Batch reference and Settlement suggestion go. ADR 0007's file, Sent-by-person and bank-code routing are superseded; its line model stands.
- The generic ZA EFT CSV is deleted. South Africa is not enabled until a ZA rail joins the seam. ZA workspaces keep Bill Pay and Mark as paid by hand.
- Accepted trade-off: no offline fallback. A destination Chaperone can't reach can't be paid from DocuBite.

## Considered

- *Keep the file as a fallback.* Rejected: it keeps all the statement-matching work for a path that never confirms.
- *One DocuBite-held Chaperone account that customers pre-fund.* Rejected: DocuBite would hold customer money, which is a different legal position.
