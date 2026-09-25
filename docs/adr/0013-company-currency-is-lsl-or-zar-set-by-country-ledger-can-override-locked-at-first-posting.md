# The company currency is LSL or ZAR, set by country, overridable by the ledger, and locked at the first posting

DocuBite works only in Lesotho and South Africa, so a company's currency is **LSL** or **ZAR** and nothing else. A Lesotho company is LSL by default and may choose ZAR; a South African company is ZAR. USD is not a company currency anywhere, including as a fallback. The country sets the currency when the company is created. When a ledger is connected, its home currency (QuickBooks Online) or base currency (Xero) is read at connect and again before every push. If it differs, an Owner may switch the company to it. Otherwise every bill fails the Check *Ledger currency differs*, and nothing is converted to fit the ledger. An Owner can change the currency only until the company's first posted bill or first Payment batch. After that it is locked, because stored conversions, approval limits and the ledger's own books would all silently change meaning (#446, owner, 2026-09-25).

## Considered options

- **Take the currency from the ledger only.** Rejected: a company needs a currency from its first upload, and many companies connect a ledger late or never (Sage is connect-only).
- **Let the currency change freely.** Rejected: once bills are posted in one currency, changing it re-denominates books DocuBite doesn't own.
- **Backfill existing companies silently, with no notice.** Rejected: limits saved as USD numbers would change value unseen. The one-off migration moves unlocked companies to their country's currency and tells the Owner to check limits set in USD. Locked ones go to support.

## Consequences

- Switching between LSL and ZAR changes no amounts or limits, because the two are pegged 1:1. A change only re-runs conversion on documents not yet posted.
- The tax profile's currency is the currency its returns are filed in, not the company currency. No reader prefers it over the company currency.
- The country is fixed after creation; moving country means a new company.
