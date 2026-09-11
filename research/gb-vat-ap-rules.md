# GB VAT rules for AP controls and return workpapers (HMRC primary sources)

Research for issue #37 (map issue #35). All figures cite HMRC/legislation.gov.uk primary sources.
Verified against live gov.uk / legislation.gov.uk pages on 2026-09-11.

## (a) Valid VAT invoice requirements (input-VAT recovery gate)

Legal basis: **Regulation 14, VAT Regulations 1995 (SI 1995/2518)** —
https://www.legislation.gov.uk/uksi/1995/2518/regulation/14 — restated in
**VAT Notice 700/21 "Record keeping", section 4** —
https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021

### Full VAT invoice (Reg 14(1); Notice 700/21 §4.1)

An AP control must verify the document shows ALL of:

1. A sequential number, from one or more series, uniquely identifying the document
2. Time of supply (tax point) and date of issue (if different)
3. Supplier's name, address and **VAT registration number**
4. Customer's name and address
5. Description sufficient to identify the goods or services
6. For each description: quantity/extent, unit price, rate of VAT, and amount payable **excluding VAT**
7. Total amount payable excluding VAT
8. Rate of any cash/settlement discount offered
9. **Total amount of VAT chargeable, expressed in sterling**
10. Where applicable: margin-scheme reference (second-hand goods/art/antiques/tour operators) or the **"reverse charge"** notation (Reg 14; Notice 700/21 §4.1)

### Simplified invoice (Notice 700/21 §4.4; Reg 16A)

- Permitted only where the total charge is **£250 or less including VAT**.
- Must show: supplier name, address and VAT number; time of supply; description of the goods/services; and for each VAT rate, the **total amount payable including VAT** and the VAT rate charged.
- Customer details, unit prices and a separate VAT amount are NOT required — an AP control should accept these only up to the £250 gross ceiling.

### Modified invoice (Notice 700/21 §4.4–4.5)

- For retail supplies **over £250**, with the customer's agreement: may show **VAT-inclusive** values per line instead of VAT-exclusive, but must still show all other full-invoice particulars (including the total VAT in sterling and the VAT-exclusive total).

### Evidence rule for recovery

- **Reg 29(2), SI 1995/2518** (https://www.legislation.gov.uk/uksi/1995/2518/regulation/29): to deduct input tax the claimant must **hold the VAT invoice** (or, for imports, customs-authenticated evidence of VAT paid). HMRC has discretion to accept alternative evidence, but a valid invoice is the default gate.
- VAT Notice 700 §10.6 (https://www.gov.uk/guidance/vat-guide-notice-700): "To reclaim VAT you've been charged as input tax, you must hold valid evidence that you have received a taxable supply."
- Practical AP checks beyond the fields: supply is to the business and for business purposes; VAT is UK VAT charged at the correct rate; supplier VAT number is valid; no duplicate claim (Reg 29(4) bars deducting the same input tax more than once).

## (b) 9-box VAT return under Making Tax Digital

Source: **VAT Notice 700/12 "How to fill in and submit your VAT Return", section 3** —
https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012

| Box | Content | Notice 700/12 § |
|---|---|---|
| 1 | VAT due in the period on sales and other outputs | 3.2 |
| 2 | VAT due in the period on acquisitions of goods made in Northern Ireland from EU member states | 3.3 |
| 3 | Total VAT due (box 1 + box 2) | 3.4 |
| 4 | VAT reclaimed in the period on purchases and other inputs (including NI acquisitions from the EU) | 3.5 |
| 5 | Net VAT to pay to HMRC or reclaim (difference of boxes 3 and 4) | 3.6 |
| 6 | Total value of sales and all other outputs excluding any VAT | 3.7 |
| 7 | Total value of purchases and all other inputs excluding any VAT | 3.8 |
| 8 | Total value of supplies of goods and related costs, excluding any VAT, from Northern Ireland to EU member states | 3.9 |
| 9 | Total value of acquisitions of goods and related costs, excluding any VAT, from EU member states into Northern Ireland | 3.10 |

Boxes 2, 8 and 9 are Northern Ireland Protocol boxes (post-1 Jan 2021); nil for GB-only traders.

MTD requirements — **VAT Notice 700/22 "Making Tax Digital for VAT"** —
https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat/vat-notice-70022-making-tax-digital-for-vat:

- Returns must be kept and submitted via **functional compatible software** using HMRC's API (§3.2).
- **Digital records** required (§3.3): designatory data (business name, principal place of business, VAT number, schemes used — §3.3.1); for each supply made: tax point, value, VAT rate (§3.3.2); for each supply received: tax point, value, input tax to be claimed (§3.3.3); summary VAT-account data — output tax, acquisition tax, reverse-charge tax, input tax, and adjustments (§3.3.5).
- **Digital links** (§3.2.1): once data is in the electronic account, any transfer/recapture/modification between software must be by digital link (formulas, API, CSV import/export etc.) — cut-and-paste does not qualify. A return workpaper must therefore derive the 9 boxes from digitally-linked records.

## (c) Registration/deregistration thresholds and rates

Thresholds (effective **1 April 2024**) — HMRC policy paper "Increasing the VAT registration threshold" —
https://www.gov.uk/government/publications/vat-increasing-the-registration-and-deregistration-thresholds/increasing-the-vat-registration-threshold — and https://www.gov.uk/vat-registration-thresholds:

- **Registration threshold: £90,000** taxable turnover in any rolling 12 months (up from £85,000). Also register if you expect to exceed £90,000 in the **next 30 days alone** (https://www.gov.uk/register-for-vat).
- **Deregistration threshold: £88,000** (up from £83,000) — may ask HMRC to cancel registration if expected taxable turnover for the next 12 months is below this (VAT Notice 700/11 §3.2 with its thresholds supplement — https://www.gov.uk/government/publications/vat-notice-70011-cancelling-your-registration/vat-notice-70011-cancelling-your-registration).

Rates — https://www.gov.uk/vat-rates:

- **Standard rate: 20%** (most goods and services; at 20% since 4 Jan 2011)
- **Reduced rate: 5%** (e.g. domestic fuel and power, children's car seats)
- **Zero rate: 0%** (e.g. most food, children's clothing)
- Exempt supplies (e.g. postage stamps, most financial and property transactions) carry no VAT and are outside the rates above.

## (d) Record retention and input-claim timing (AP-relevant)

- **Retention: at least 6 years** for all business records for VAT purposes — VAT Notice 700/21 §2.4 (https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021). Under MTD the required records must be kept, maintained and preserved **digitally** in functional compatible software (Notice 700/21 §7–10; Notice 700/22 §3).
- **When to claim input tax**: on the return for the period in which the tax became chargeable (supplier's tax point), provided the evidence is held; if the invoice arrives later, on the first return after the documentation is obtained — **Reg 29(1), SI 1995/2518**; VAT Notice 700 §10.5.
- **4-year cap**: no input-tax claim may be made **more than 4 years after the due date of the return for the period in which entitlement first arose** — **Reg 29(1A), SI 1995/2518** (https://www.legislation.gov.uk/uksi/1995/2518/regulation/29); VAT Notice 700 §10.5.
- **No double deduction**: the same input tax cannot be deducted more than once — Reg 29(4).

## AP control checklist (derived)

1. Classify document: full / simplified (≤£250 gross) / modified (>£250, VAT-inclusive) — reject simplified over £250.
2. Verify the Reg 14 field set for the class; VAT total must be in sterling.
3. Verify supplier VAT number and that UK VAT was correctly chargeable (rate check against gov.uk/vat-rates).
4. Confirm business purpose and no duplicate booking (Reg 29(4)).
5. Post the claim to the correct period (tax point) and block claims older than the Reg 29(1A) 4-year window.
6. Retain the invoice digitally for ≥6 years with digital links intact (Notices 700/21, 700/22).
