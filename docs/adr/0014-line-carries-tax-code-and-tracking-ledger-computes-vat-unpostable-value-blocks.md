# A line carries its Tax code and Tracking; the ledger computes VAT from a stated Tax basis; a value the ledger can't take blocks posting

Until now the bill mappers sent each line's Account and nothing else. The ledger then chose the tax: Xero applied each account's default tax code and treated amounts as tax-exclusive, and QuickBooks Online got a gross `TotalAmt` over lines with no tax code. If a bill's line amounts included VAT, Xero would add VAT a second time. Nothing recorded the analysis ledgers support (QuickBooks Class, Location, Customer and Billable; Xero's tracking categories), so it was lost on every post (#448, owner, 2026-09-25).

So each line now carries a **Tax code** (the ledger's own purchase code, pre-filled from the ledger's default for the line's Account) and up to two **Tracking** values. Tracking is one neutral concept: QuickBooks Class is one tracking category, Xero's two active categories are two, and the ledger's own name labels each one. QuickBooks-only fields are kept where QuickBooks accepts them: **Location** on the bill, and **Customer** and **Billable** on a line. The bill states its **Tax basis** (VAT included, excluded or none), inferred from which extracted total the lines add up to and changeable by the person coding. DocuBite sends the codes and the basis, and the ledger does the VAT arithmetic. DocuBite never sends a VAT amount of its own.

A field the ledger or its plan does not offer is absent, not disabled. A value DocuBite already holds that the ledger can't take (after a provider switch, a plan downgrade or a setting turned off) is kept, shown, and fails a named Check that blocks posting until someone clears it. Two more Checks guard VAT before posting: *Tax basis unclear* and *VAT won't match the invoice*. After posting, the ledger's own tax total and any Xero `Warnings` are read back. A difference puts a warn on the posted bill, because nothing un-posts.

Supplier account rules learn the largest line's coding as one set: Account, Tax code and Tracking, plus the bill's Location. The learned Tax code pre-fills only when the line keeps the rule's Account. Customer and Billable are never learned.

## Considered options

- **Leave tax to the ledger's account defaults.** Rejected: this is how double VAT happens silently, QuickBooks outside the US needs a tax code on each line once VAT is on, and a Lesotho Xero organisation has only custom codes.
- **Send amounts excluding VAT, working VAT out in DocuBite.** Rejected: DocuBite would own the VAT arithmetic and QuickBooks' per-line rounding.
- **Named fields per ledger** (`class`, `xeroTracking1`…). Rejected: the model and glossary would fork by provider for one job, analysing spend.
- **Warn instead of block when the ledger can't take a value.** Rejected: a warning someone can post past drops the value in the ledger, and the map says data is never dropped silently.

## Consequences

- ADR 0011 stands. A correction still changes the Account only and sends each line's existing tax code back unchanged. DocuBite now sets the tax code on create, and never after posting.
- Posted bills are not back-filled when a field is added or the ledger starts offering one. They read "not set when posted", and no correction is offered. Only an Account change offers corrections.
- A change to a supplier rule's Tax code, Tracking or Location affects future bills only.
- The plan and settings are read at connect, at every sync, and again after a QuickBooks 5030: QBO `CompanyInfo.OfferingSku` and `Preferences`, and Xero `TrackingCategories` and `TaxRates` (`TaxType`, `CanApplyToExpenses`).
- With no ledger connected, none of these fields exist, and the CSV keeps the Account only.
