# Goods received is a DocuBite record, from a confirmed delivery note or a person's entry; the 3-way Check holds, it doesn't stop

The owner's standing rule is that DocuBite doesn't do what the ledger doesn't support. On 3-way match they chose to break it (#453 Q7, 2026-09-25, superseding the rejected ADR 0019). Neither QBO nor Xero exposes goods received through its API: Xero has no received quantity, and QBO's 2026 in-app Item Receipts can't be created through the API. Every competitor offering 3-way on those ledgers (Ramp, Zahara, Procurify, Lightyear) records receiving in its own product (#472). So **Goods received** is a DocuBite record: a per-PO-line quantity that is never posted, and the screen says so ("Recorded in DocuBite. Not sent to QuickBooks").

A goods-received entry comes from one of two sources, and it names which:
- a **Delivery note**, captured like any document and suggested against the PO its number cites. Its quantities count only once a person confirms them.
- a person's own entry, where there's no paper.

The **3-way match** applies only to suppliers an Owner marks **Goods received required**; the switch is off by default. For each matched line, the quantity invoiced across all invoices is compared against goods received × (1 + the workspace quantity tolerance). Beyond that, the Check **Not yet received** fails and holds approval and posting, overridable in Override Mode with a reason. Recording goods received later re-runs the Check on unposted invoices. Nothing approves itself (ADR 0018).

## Considered options

- **Keep no goods received (ADR 0019).** Rejected by the owner: 3-way is a competitive baseline (Ramp, Zahara), and the one rule-compatible route, reading QBO Item Receipts, has an unverified API and would be QBO-only.
- **Hand entry only, as competitors do.** Rejected: DocuBite already extracts delivery notes. Reading the paper is the one thing it can do that they don't, and hand entry stays for when there's no paper.
- **A hard block.** Rejected: an invoice billed on dispatch, or a delivery note that's lost, would dead-end. A warning only was rejected too: that's a control nobody enforces.
- **A company-wide switch or a per-PO switch.** Rejected: service suppliers never deliver, and deciding per PO is a choice nobody makes reliably.

## Consequences

- An expense **Receipt** is never proof of delivery. The match-variance gate's receipt-as-GRN branch and the header-level `lib/matching/three-way.ts` are removed (#471).
- A company that also records Item Receipts in QBO has two receiving records. DocuBite doesn't reconcile them. Reading QBO's Item Receipts waits on a sandbox test.
- Recording, editing or removing goods received is open to Reviewers and Owners, and every change records who, when and the source. The switch is Owner-only and logged.
