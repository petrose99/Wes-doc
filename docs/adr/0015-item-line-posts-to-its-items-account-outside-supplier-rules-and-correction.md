# An item line posts to its Item's account, outside supplier rules and account correction

ADR 0011 made every line carry one of the ledger's accounts, chosen in DocuBite (supplier rule, then Default account, then a person) and correctable on a posted bill. Item lines break both halves: a QuickBooks Online `ItemBasedExpenseLineDetail` has no `AccountRef` (the account is the Item's), and a tracked Xero item forces the line onto its inventory asset account (docs/research/ledger-bill-capabilities.md, #447). So a line is now coded to **either** an Account **or** an **Item**, never both, and an item line's Account is the Item's account, read from the ledger and shown read-only (#449, owner, 2026-09-25).

The supplier account rule and the Default account never set an item line's account, and the rule learns from the largest *account* line only; items are learned separately, as a pairing of the supplier's product code (or, with none, its description) with the Item on an approved bill. Correcting a posted bill's Accounts leaves item lines out and says why ("coded to an item — change it in ‹ledger›"); account lines keep every guarantee ADR 0011 gives them.

Where the ledger or plan can't take item lines (QuickBooks Simple Start and Essentials, or no ledger), Item is not offered. An item line DocuBite already holds (after a plan downgrade or a ledger switch) is kept, shown, and fails a blocking Check until a person re-codes it; the Check offers "Code to ‹item's account› instead", which runs only when chosen. A tracked inventory Item needs a quantity read from the document or the line fails a blocking Check; a service or non-inventory Item with no quantity posts as 1 × the amount and says so.

## Considered options

- **Item as an extra field on an account line.** Rejected: QuickBooks ignores a line account on an item line, so DocuBite would show an Account the ledger silently discards.
- **Leave item lines out of this effort.** Rejected: the map's destination names them.
- **Fuzzy-match descriptions to Items.** Rejected: a wrong guess on an inventory Item moves stock value in the ledger. Matching is learned or exact, as ADR 0011 does for accounts.

## Consequences

- Items (active and purchasable only, with type and purchase account) are synced alongside accounts, vendors and tax codes.
- Extraction reads a per-line supplier product code.
- Line match pairs a bill line and a PO line on a shared Item before description similarity, and never auto-pairs two different Items.
- An item line's Tax code pre-fills from the Item's purchase tax code; Tracking, Customer and Billable apply as on account lines (ADR 0014).
