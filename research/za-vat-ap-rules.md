# ZA VAT rules for AP controls and the VAT201 workpaper

Research ticket [#36](https://github.com/petrose99/docubite/issues/36), part of map #35.
Primary sources only: VAT Act 89 of 1991, SARS VAT404 Guide for Vendors, SARS VAT201
completion guide, and sars.gov.za pages. Verified 2026-09-11.

> **Currency of the data:** the VAT registration thresholds changed on **1 April 2026**
> (Budget 2026). Figures below give both the old and new values because 5-year lookback
> claims will straddle the change.

## (a) Tax-invoice validity — what an AP control must check (VAT Act s 20)

Input tax may not be deducted unless the vendor holds a valid tax invoice (VAT Act
s 16(2)(a)). Validity is defined by s 20. SARS's requirements page:
<https://www.sars.gov.za/businesses-and-employers/government/tax-invoices/>.

### Full tax invoice — consideration **above R5,000** (s 20(4))

All of the following must be present:

1. The words **"Tax Invoice", "VAT Invoice" or "Invoice"** (s 20(4)(a)).
2. **Supplier's** name, address and **VAT registration number** (s 20(4)(b)).
3. **Recipient's** name, address and, if the recipient is a registered vendor, the
   recipient's **VAT registration number** (s 20(4)(c)).
4. An **individual serialised number** and the **date** of issue (s 20(4)(d)).
5. An **accurate description** of the goods or services (s 20(4)(e)).
6. The **quantity or volume** supplied (s 20(4)(e)).
7. The **value of the supply, the amount of VAT charged and the consideration** — either
   VAT shown separately, or a statement that the consideration includes VAT and the rate
   applied (s 20(4)(f)–(g)).

Source: SARS tax-invoices page (elements listed verbatim, "as of 8 January 2016") and
VAT Act s 20(4).

### Abridged tax invoice — consideration **R5,000 or less** (s 20(5))

An abridged tax invoice is acceptable. Reduced element set (s 20(5); VAT404 Guide for
Vendors, Issue 15, ch. 13 — <https://www.sars.gov.za/wp-content/uploads/Ops/Guides/Legal-Pub-Guide-VAT404-VAT-404-Guide-for-Vendors.pdf>):

1. The words "Tax Invoice", "VAT Invoice" or "Invoice".
2. Supplier's name, address and VAT registration number.
3. Serial number and date of issue.
4. Description of the goods/services.
5. Value + VAT (separately, or VAT-inclusive statement with rate).

**Not required** on an abridged invoice: recipient details and quantity/volume. An AP
control should therefore branch on consideration > R5,000 vs ≤ R5,000.

### Supplies of **R50 or less** (s 20(6))

No tax invoice is required, but a record such as a **till slip or sales docket showing
the VAT charged** must be held to support the deduction. Source: SARS tax-invoices page.

### Other s 20 checks relevant to AP

- **21-day rule:** the supplier must issue the tax invoice within **21 days** of the
  supply (s 20(1); confirmed on the SARS tax-invoices page).
- **Currency:** amounts must be in **the currency of the Republic (ZAR)**; the proviso
  to s 20(4)(g) lifts this only for supplies charged with tax under s 11 (zero-rated).
- **Electronic invoices:** conditions (recipient consent, secure transmission,
  retention) live in VAT404 ch. 13; SARS's Aug 2026 VAT Modernisation consultation
  paper signals a move to structured e-invoicing —
  <https://www.sars.gov.za/wp-content/uploads/VAT-Modernisation-Consultation-Paper-August-2026.pdf>.
  Do not hard-code e-invoice conditions without checking VAT404 directly.
- **One invoice per supply:** only one tax invoice may be issued per taxable supply;
  a lost original is replaced by a **copy** marked "copy tax invoice" (s 20(1) proviso;
  VAT404 ch. 13).

## (b) VAT201 return field structure (return workpaper output)

Source: SARS "Guide for Completing the VAT201 Declaration" (**GEN-ELEC-04-G01**,
effective 12 May 2025)
<https://www.sars.gov.za/gen-elec-04-g01-guide-for-completing-the-value-added-tax-vat201-declaration-external-guide/>
and <https://www.sars.gov.za/guide-to-completing-the-value-added-tax-vat201-return/>.
(An older 2018 rate-change FAQ shows a pre-2018 layout with 1A = accommodation; the
current guide — 1A = capital goods, 5–9 = accommodation — governs.)

### Part A — Output tax (supplies)

| Field | Captures |
|---|---|
| 1 | Standard-rate supplies (excl. capital goods and accommodation), VAT-inclusive |
| 1A | Standard-rate supplies of **capital** goods/services |
| 2 | Zero-rate supplies (excl. exported goods) |
| 2A | Zero-rate **exported** goods (customs code required) |
| 3 | Exempt supplies and non-supplies |
| 4 / 4A | Output tax auto-calculated from 1 / 1A at the tax fraction 15/115 |
| 5–9 | Commercial accommodation: >28 days (5, ×60% → 6), ≤28 days (7), sum (8), VAT at 15% (9) |
| 10 / 11 | Change-in-use and second-hand-goods export adjustments and resulting output tax |
| 12 | Other and imported services (incl. debit/credit notes, debt recovery) |
| **13** | **Total output tax** = 4 + 4A + 9 + 11 + 12 |

### Part B — Input tax (what the AP workpaper feeds)

| Field | Captures |
|---|---|
| 14 | Input VAT on **capital** goods/services acquired |
| 14A | Input VAT on **imported** capital goods (customs code required) |
| 15 | Input VAT on other (non-capital) goods/services |
| 15A | Input VAT on imported non-capital goods (customs code required) |
| 16 | Change-in-use input-tax adjustments |
| 17 | Bad debts (invoice-basis vendors only) |
| 18 | Other adjustments (credit/debit notes, change of accounting basis) |
| **19** | **Total input tax** = 14 + 14A + 15 + 15A + 16 + 17 + 18 |

### Net

| Field | Captures |
|---|---|
| **20** | VAT payable / (refundable) = field 13 − field 19 |
| 21–37 | Diesel refund scheme blocks (where applicable) |
| 38 | Final amount payable/refundable after diesel deductions |

Workpaper implication: the AP subledger must split claimable input VAT four ways
(capital vs other × domestic vs imported) to populate 14/14A/15/15A.

## (c) Registration thresholds and rates

| Item | Value | Primary source |
|---|---|---|
| Standard rate | **15%** (s 7(1)). The announced increase to 15.5% (1 May 2025) and 16% (1 Apr 2026) was **reversed** by clause 13 of the Bill introduced 24 Apr 2025 — rate remains 15%. | <https://www.sars.gov.za/types-of-tax/value-added-tax/> |
| Zero rate | 0% on the s 11 list (exports, certain foodstuffs, etc.); documentary proof required (s 11(3)) | VAT Act s 11; SARS VAT page above |
| Compulsory registration | Taxable supplies > **R1 million** in a 12-month period (s 23(1)); **from 1 Apr 2026: > R2.3 million** | <https://www.sars.gov.za/faq/what-is-the-new-threshold-for-vat-registration/>; Budget 2026 FAQ <https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/> |
| Voluntary registration | Taxable supplies > **R50,000** per annum (s 23(3)); **from 1 Apr 2026: R120,000** | same sources |
| Tax fraction | 15/115 (used by VAT201 fields 4/4A) | VAT201 completion guide |

## (d) Record retention and input-claim timing

- **Retention: 5 years.** Vendors must keep tax invoices for supplies made and
  received, bills of entry, and proper accounting records for **5 years** (VAT Act s 55
  read with Tax Administration Act 28 of 2011 s 29). Source:
  <https://www.sars.gov.za/types-of-tax/value-added-tax/obligations-of-a-vat-vendor/>
  and <https://www.sars.gov.za/client-segments/record-keeping/>.
- **Late claims allowed up to 5 years.** Input tax not deducted in the period of supply
  may be deducted in a later tax period, limited to **5 years** from the date the tax
  invoice should have been issued (VAT Act s 16(3) proviso (i)). An AP control can
  therefore hold an invoice pending correction without forfeiting the claim, but must
  age it against the 5-year clock.
- **Timing of entitlement:** deduction is claimable in the period the vendor **holds the
  valid tax invoice** (s 16(2)(a)) — an invalid invoice must be fixed (reissued by the
  supplier) before field 14/15 inclusion.
- **Return deadline:** VAT201 due by the **25th** (manual) or the **last business day**
  of the month following the tax period (eFiling). Source: obligations-of-a-vat-vendor
  page above.
- **Accounting basis:** default is the **invoice basis** (s 15(1)); the Commissioner
  may allow a **payments basis** for e.g. natural persons/unincorporated bodies with
  taxable supplies ≤ **R2.5 million** (s 15(2)) — such vendors deduct input tax only to
  the extent payment is made, and s 15(2A) forces invoice-basis treatment for
  individual supplies of **R100,000 or more**. VAT201 field 17 (bad debts) applies to
  invoice-basis vendors only (VAT201 guide).

## Verification notes / gaps

- All web figures verified against sars.gov.za on 2026-09-11.
- The ZAR-currency requirement and the copy-invoice rule are cited to the Act/VAT404;
  the SARS summary web page does not restate them.
- VAT404 Issue 15 PDF was located but not parsed page-by-page; section 20 element lists
  were cross-checked against SARS's tax-invoices web page instead. Page-level VAT404
  pin cites can be added when the pack schema needs them.
