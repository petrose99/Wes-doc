# A line's Account is the ledger's account; supplier rules replace category mappings; posted Accounts are correctable

Charting planned to guess "category → account mappings" at connect time. But DocuBite's categories are free text and a fresh company has none, so a bulk guess on day one would have nothing to map. The document-first tools (Dext, Hubdoc, AutoEntry) learn coding per supplier as documents are coded (docs/research, #400). So once a ledger is connected, each document line carries one of the ledger's own accounts (the **Account**), pre-filled from the supplier's usual account (learned when one of the supplier's documents is approved) or else from the **Default account**. Only the Default is guessed at connect, by exact match on the provider's standard catch-all name, never by a scored match, and it stays marked Guessed until an Owner confirms it. The category → account mapping table survives only to translate categories written before the connection.

"Nothing un-posts" still holds, but a posted bill's Accounts can now be corrected from DocuBite where the ledger allows it (#402, owner, 2026-09-24). A correction changes the account only: the line's existing tax type is always sent back unchanged, so no VAT figure moves. DocuBite follows the ledger's own locks (closing or lock date, paid or allocated, VAT return filed) and invents none of its own. A bill the ledger will refuse is shown with the ledger's reason and a way into the ledger, never hidden. Bills are corrected only when the Owner ticks them; none are pre-ticked.

## Considered options

- **Keep category → account mappings, guessed in bulk at connect.** Rejected: the category key is empty on day one, and the mapping layer is invisible to the person coding.
- **Fix future posts only, or list the posted bills to fix by hand in the ledger.** Rejected by the owner in favour of updating the ledger where it allows. All three providers accept a change to a line's account on an existing bill (docs/research/ledger-bill-account-update.md).

## Consequences

- The bill mappers post an account per line, not one per document.
- Post eligibility becomes "every line has an Account".
- Xero and QuickBooks updates must resend every line (Xero deletes lines that are left out; QuickBooks sets missing fields to null).
- Before building Sage correction, confirm which Sage API reaches a South African business.
- Tax codes and Tracking are now set on create, and supplier rules learn them with the Account (ADR 0014). A correction still sends each line's existing tax code back unchanged.
- An item line posts to its Item's account, not one chosen here; supplier rules and account correction leave it out (ADR 0015).
