# Lesotho VAT — AP controls and return workpaper rules (ticket #43)

Primary sources: Lesotho Value Added Tax Act, No. 9 of 2001 ("the Act", [full text PDF](https://lesotho.eregulations.org/media/VAT%20ACT%20-%202001.pdf)); Revenue Services Lesotho (RSL) pages and published guides on rsl.org.ls. Secondary corroboration is explicitly flagged. Researched 2026-09-11.

Currency: Lesotho loti (LSL / M), pegged 1:1 to the South African rand; ZAR is legal tender in Lesotho.

## (a) Tax-invoice validity — what an AP control must check before input VAT is claimable

Statutory basis: s.24 and Schedule III of the Act; input-credit gate in s.23(4).

- **Input VAT may not be claimed until the tax period in which the vendor holds** (s.23(4)):
  - a value added tax invoice (for local supplies), or
  - a bill of entry or other document prescribed under the Customs and Excise Act 1982 (for imports),
  evidencing the input tax payable or paid. Exception (s.23(5)): Commissioner may allow a credit without an invoice only if the vendor took all reasonable steps, the failure wasn't the vendor's fault, and the amount is correct — not a control to rely on.
- **A "value added tax invoice" is an invoice containing the Schedule III particulars** (s.24(8)). Schedule III, para 1 — the AP checklist:
  1. the words **"value added tax invoice"** in a prominent place;
  2. commercial name, address, place of business, and **taxpayer identification number (TIN) of the supplier**;
  3. commercial name, address, place of business, and **TIN of the recipient vendor** (i.e. our entity — a tax invoice is only issued vendor-to-vendor, s.24(1));
  4. **individualised (unique) invoice number** and **date of issue**;
  5. **description of the goods/services** and the **date of supply**;
  6. **quantity or volume** supplied;
  7. either (i) a statement that the consideration includes VAT and the **rate** charged (tax-inclusive style), or (ii) the **VAT amount, the consideration, and the tax-inclusive total** separately.
- **Original required**: the supplier issues an original at the time of supply and retains a copy (s.24(1)-(2)); if the original is lost, only a copy **clearly marked "copy"** is acceptable (s.24(9)).
- **Missing invoice remediation window**: a vendor who didn't receive a tax invoice must request one within **60 days of the supply**; the supplier must comply within **14 days** (s.24(3),(5),(6)).
- **Credit/debit notes** (s.25, Schedule III paras 2–3): must say "credit note"/"debit note" prominently, identify both parties (name/address/TIN), date of issue, reason, the supply it relates to, and show original taxable value, corrected value, the difference, and the VAT on the difference. Request window: 60 days from the triggering event; supplier must respond within 14 days (s.25(4)-(5)).
- RSL's VAT-12 return notes restate the invoice checklist (date, supplier trading name/address/VAT number, recipient's name/address/VAT number, details incl. quantity, amount charged plus tax) — [VAT-12 form, note 2](http://www.rsl.org.ls/sites/default/files/2024-07/VALUE%20ADDED%20TAX%20RETURN.pdf).
- **E-invoicing**: Lesotho went live with mandatory e-invoicing on 1 Aug 2026 (digital signature, EBS certificate identifier, QR code) — secondary sources ([sharedserviceslink](https://sharedserviceslink.com/news/lesotho-confirms-1st-august-e-invoicing-go-live), [vatupdate](https://www.vatupdate.com/2026/06/19/briefing-document-podcast-e-invoicing-e-reporting-in-lesotho/)); verify scope against RSL before hard-coding.

## (b) VAT return structure — what a return workpaper must produce

Statutory basis: s.27 (return per tax period, prescribed form, within 20 days of period end); "tax period" = one calendar month (s.3 definition). Form: **VAT-12** ([RSL PDF](http://www.rsl.org.ls/sites/default/files/2024-07/VALUE%20ADDED%20TAX%20RETURN.pdf)), filed with a **Standardized VAT Schedule** attached.

Header: reference, accounting method (invoice/cash), TIN, VAT number, tax period (month/year), legal name, physical/postal address, district.

Outputs (each with Amount and VAT columns):
1. Total taxable sales at **15%** (excl. VAT)
2. Total taxable sales at **10%** (excl. VAT)
3a. Local zero-rated sales (0%) — zero-rated goods per the Act's schedule
3b. Exports (0%)
4. Total exempt sales
5. Total taxable sales / output VAT (1+2+3a+3b)
6. Value of total sales (4+5)

Inputs:
7a. Local purchases of goods; 7b. Local purchases of services
8a. Imported goods (deferred payment/IVCF); 8b. Imported services (deferred payment/IVCF)
8c. Imported goods (other); 8d. Imported services (other)
9. Total purchases / input VAT (7a+7b+8a+8b+8c+8d)

Tax calculation:
10. **Deductible input VAT** (local + import VAT qualifying for credit; VAT attributable to exempt supplies excluded)
11. Net VAT payable/refundable (5 − 10)
12. VAT refundable (if 11 negative) — refund tick-box claim; refunds offset other liabilities first (s.46(3)); regular repayment traders (e.g. exporters) may apply in writing for per-period immediate refunds (s.46(4)); others claim quarterly (VAT-12 note 4)
13. VAT payable (if 11 positive)

Declaration: name, signature, status (director/owner/nominated person), date, contact. Filing and payment both due by the **20th of the month following the tax period** (s.27(1); [RSL VAT page](https://www.rsl.org.ls/value-added-tax-vat)). Late filing/payment attracts additional tax at **3% per month** or part thereof (ss.54–55).

## (c) Registration thresholds and rates

- **Rates** are set by regulation, max four rates including a zero rate (s.19(3)); exports are zero-rated by the Act itself (s.19(2)). Current rates per RSL ([tax-rates](https://www.rsl.org.ls/tax-rates), [VAT page](https://www.rsl.org.ls/value-added-tax-vat)):
  - **15%** — standard (other goods and services)
  - **15%** — telecommunications (historically a separate lower rate; now aligned with standard)
  - **10%** — electricity
  - **0%** — exports and basic commodities (zero-rated schedule)
  - Exempt (s.6(2)): public postal, passenger road transport, medical/dental, financial, insurance and education services; unimproved land; leases of manufacturing premises; water.
- **Registration threshold**: set by ministerial Gazette notice (s.17(2)). Currently **M 2,000,000 annual taxable turnover** ([RSL VAT page](https://www.rsl.org.ls/value-added-tax-vat)); secondary sources give the effective date as **25 April 2025** (previously M850,000) ([Mayet & Associates tax guide, secondary](https://zmayetlaw.co.ls/lesotho-tax-guide-effective-1-april-2025/)). Registration must be applied for within 14 days of the end of any 12-month period in which the threshold was exceeded, or prospectively where it is expected to be exceeded (s.17(1)); associates' supplies are aggregated (s.17(4)(c)). **Auctioneers** must register regardless of turnover (s.17(6)); public authorities carrying on an enterprise likewise (s.17(3)). Voluntary registration available at the Commissioner's discretion (s.17(5)).

## (d) Record retention and input-claim timing (AP-relevant)

- **Records to keep in Lesotho, in Sesotho or English** (s.48(1)-(2)): original tax invoices/credit notes/debit notes received; copies of all issued; customs documentation for imports and exports; other prescribed records; plus up-to-date books of account enabling audit and financial-position determination.
- **Retention period**: "for as long as they remain material in the administration of this Act" (s.48(3)) — no fixed year count in the Act; RSL's practical guidance is in "Tax Guide on Keeping Records and Accounts – VAT 104" (linked from the RSL VAT page); secondary summaries commonly state ~5 years. Failure to keep records: additional tax up to double the VAT payable (s.56) and criminal penalties (s.64).
- **Input-claim timing**:
  - Invoice (accrual) basis (s.20): the credit **arises** on the date the goods/services are supplied to or imported by the vendor (s.23(3)(a)(i)) but **may not be claimed until the period the vendor holds the tax invoice / customs bill of entry** (s.23(4)).
  - Cash basis (s.21, services-dominant vendors on approval): credit arises when the tax is paid (s.23(3)(a)(ii)); input tax claimed in the period payment is made (s.21(3)(b)).
  - **Purpose test** (s.23(1)-(2)): credit only for inputs used in making taxable supplies (manufacturing inputs, construction-services inputs, or goods/services for re-supply in substantially the same state), apportioned for mixed use; no credit for input VAT attributable to exempt supplies (VAT-12 note 3), certain second-hand goods (s.23(6)(a)) and anything denied by Regulations (s.23(8)).
  - **Pre-registration inputs**: claimable only for acquisitions within 2 months before registration, and the claim must be made within 2 months after registration (s.23(1)(b) proviso).
  - **Bad-debt relief** on the output side: credit when a debt is written off, at the later of write-off or 12 months after the period the VAT was paid (s.26(3)).

## (e) ZA interplay — SACU, rand/loti parity, imports from South Africa

Primary source: RSL "Guide on Payment of Import VAT on Goods Purchased from RSA" ([PDF](https://www.rsl.org.ls/sites/default/files/2026-04/Guide%20on%20payment%20of%20import%20VAT%20on%20goods%20purchased%20from%20South%20Africa.pdf)); Act ss.5(b), 7(1)(b), 13, 16 (VAT on taxable imports, payable by the importer, on CIF-based value).

- **Every import from ZA is a taxable import** unless exempt (s.13); the importer pays import VAT (s.7(1)(b)). Import VAT is then claimable as input tax with the customs bill of entry (SAD500 etc.) as evidence (s.23(4)(b); VAT-12 lines 8a–8d).
- **RSL–SARS arrangement**: because of the government-to-government arrangement, a **valid RSA tax invoice showing SA VAT at 15% can itself be tendered at the border as the method of paying Lesotho import VAT** — SARS refunds the SA VAT over to RSL (per RSL guide and [SARS VAT News 22](https://www.sars.gov.za/wp-content/uploads/Docs/VATNews/LAPD-IntR-VATN-Arc-2013-22-VATNews-22-September-2003.pdf)). Other payment methods: deferred payment, or cash/EFT/POS (cash cap M20,000).
- **Valid RSA tax invoice for this purpose** (RSL guide, s.5): from a SA VAT-registered vendor (**10-digit VAT number starting with 4**); **original**, not copy/scan; the words "Tax/VAT Invoice"; unique invoice number; invoice date; **within 90 days** from purchase date to import date; VAT at 15% shown or computable.
- **Supporting documents** (RSL guide, s.6): supplier and purchaser addresses on the invoice; **SARS Exporter/Importer code**; proof of payment (mandatory where value exceeds M10,000); SARS-endorsed invoice; customs release docs (SAD500, TRD1, CN2); trader's licence and tax clearance for traders; authorization letter if a third party collects; registration certificate + import-VAT receipt for registrable goods (e.g. vehicles).
- **No Importer/Exporter code ⇒ the tax-invoice method is refused** and VAT is due in cash at the border (RSL guide s.7, s.13). Lesotho traders without SARS registration can use direct export (seller delivers into Lesotho, importer pays RSL directly) or appoint a SA "registered agent" (DA 185/DA 185D forms; ~10 working days; free) (RSL guide s.14).
- **Parity note**: loti is pegged 1:1 to the rand and SA and Lesotho standard rates are both 15%, so the invoice-as-payment route normally leaves no rate differential; the Act converts foreign-currency amounts to Maloti at the ruling exchange rate (s.83 area, "converted at the exchange rate applying between the currency and Maloti"). Electricity's 10% Lesotho rate is a domestic-supply rate, not an import differential.
- **AP control implications**: for ZA purchases, capture the SA supplier's VAT number (10 digits, leading 4), invoice date vs import date (90-day rule), SAD500/border receipt reference, and whether VAT was settled via the invoice arrangement or paid at the border — that determines whether the ZA invoice or the customs receipt is the input-tax evidence on the VAT-12.

## Source index

- VAT Act 2001 (Act No. 9 of 2001), full text: https://lesotho.eregulations.org/media/VAT%20ACT%20-%202001.pdf — ss.5–7 (imposition, exemptions, liability), 13–16 (imports, values), 17–18 (registration), 19 (rates), 20–22 (accounting methods), 23 (input credits), 24–25 + Schedule III (invoices, credit/debit notes), 26 (bad debts), 27 (returns), 46–47 (refunds), 48–51 (records), 54–56, 64 (penalties).
- RSL VAT overview: https://www.rsl.org.ls/value-added-tax-vat
- RSL tax rates: https://www.rsl.org.ls/tax-rates
- RSL VAT-12 return form + notes: http://www.rsl.org.ls/sites/default/files/2024-07/VALUE%20ADDED%20TAX%20RETURN.pdf
- RSL Guide on payment of import VAT on goods purchased from RSA: https://www.rsl.org.ls/sites/default/files/2026-04/Guide%20on%20payment%20of%20import%20VAT%20on%20goods%20purchased%20from%20South%20Africa.pdf
- SARS VAT News 22 (Lesotho border refunds): https://www.sars.gov.za/wp-content/uploads/Docs/VATNews/LAPD-IntR-VATN-Arc-2013-22-VATNews-22-September-2003.pdf
- Secondary (flagged as such): Mayet & Associates Lesotho Tax Guide (threshold effective 25 Apr 2025): https://zmayetlaw.co.ls/lesotho-tax-guide-effective-1-april-2025/; sharedserviceslink / vatupdate (e-invoicing go-live).
