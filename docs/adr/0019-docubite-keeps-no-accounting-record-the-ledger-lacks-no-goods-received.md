# DocuBite keeps no accounting record the ledger has no home for; there is no goods received and no 3-way match

**Status: proposed** (owner, 2026-09-25). This waits on #472, which asks how Ramp, Zahara and Vic.ai get goods received on QBO and Xero. It becomes accepted, or is reversed, on #453's Q7.

The Ramp Bill Pay map (#445) set out to build a 3-way match: PO · goods received · bill. Neither ledger DocuBite posts to has a home for goods received. QuickBooks Online has Purchase Orders but no receiving object (the Item Receipt is QuickBooks Desktop only; online, receiving *is* the Bill), and Xero's Purchase Orders carry only a billed status. A goods-received quantity kept in DocuBite would make DocuBite a second system of record: stock-desk data with nowhere to go, which someone keeps current by hand. The owner ruled it out (#453, 2026-09-25): **DocuBite doesn't do what the ledger doesn't support.**

The rule is about **records**, not **Checks**. DocuBite never creates an accounting record (a receipt of goods, a stock movement, a quantity on hand) that neither ledger can hold. A Check that runs before posting may still read documents DocuBite has captured. So the Purchase Order document, the 2-way line match and *Fully invoiced* stay: they compare what the supplier sent against itself, and they create nothing the ledger lacks.

## Considered options

- **Goods received from a delivery note or entered by hand, used only by the Check and never posted.** Rejected: it's still a record with no ledger home. Every partial delivery and correction would live only in DocuBite.
- **Absolute: DocuBite holds nothing the ledger lacks, POs included.** Rejected: it would reverse the shipped PO matching, which reads documents rather than keeping records.
- **Read receiving data from the ledger.** Not possible: neither ledger has any.

## Consequences

- The match-variance gate's "3-way" branch goes. It treated an expense **Receipt** matched to an invoice as proof of delivery, which it is not. The unused header-level `lib/matching/three-way.ts` goes with it. The gate compares the invoice to its PO only.
- *Delivery note* stays a secondary type, found in Search only. It never feeds a Check.
- Product and marketing copy that promises 3-way matching is corrected, not left standing.
- A future feature that needs a record the ledger lacks, such as quantity on hand, meets this ADR first. Either the ledger gains a home for it, or the owner reopens this decision.
