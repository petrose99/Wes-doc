# US jurisdiction pack shape: what replaces VAT (issue #38)

Research ticket #38 of map #35. Verified against primary sources (irs.gov, cdtfa.ca.gov, comptroller.texas.gov, floridarevenue.com, tax.ny.gov, bea.gov) on 2026-09-11.

**Summary.** The US pack is not "VAT with different rates." Its AP-side compliance objects are (1) a federal *information-return* layer — W-9 collection, 1099-NEC/MISC thresholds (now $2,000 for post-2025 tax years), 24% backup withholding — that tracks *vendors*, not tax amounts on invoices; and (2) a *sales/use tax* layer where tax paid to vendors is a cost (never a recoverable input credit), untaxed purchases create a self-assessed **use-tax accrual liability**, and buyers issue exemption/resale certificates to sellers. Recommendation for the first state pack: **California**. The structural divergence list in (d) is the schema input.

---

## (a) Federal AP obligations (IRS)

### W-9 collection
Form W-9 is how a payer obtains a vendor's correct Taxpayer Identification Number before payment; anyone required to file an information return may request it. The pack should treat "valid W-9 on file" as the vendor-onboarding control (the analogue of "valid VAT number" in ZA/GB packs).
Source: https://www.irs.gov/forms-pubs/about-form-w-9

### 1099-NEC / 1099-MISC thresholds (2026 instructions, rev. 12/2026)
- **General threshold: $2,000.** "For tax years beginning after 2025, the minimum threshold amount for reporting certain payments … increased to $2,000 and may be adjusted for inflation beginning in calendar year 2027." (Previously $600 — the pack schema must carry the threshold as data per tax year, inflation-indexed from 2027.)
- Lower thresholds survive for specific boxes: royalties and broker substitute payments **$10**; fishing-boat proceeds any amount; attorney **gross proceeds $600** (1099-MISC box 10).
- **Due dates:** 1099-NEC due **January 31**; 1099-MISC due Feb 28 (paper) / Mar 31 (electronic).
- **Corporate-payee exemption:** payments to corporations (incl. LLCs taxed as C/S corps) are generally not reportable — *except* attorney fees and gross proceeds, medical/health-care payments, fish purchases, and substitute payments. So the pack needs a per-vendor entity-type flag plus category-level overrides.
- **1099-K carve-out:** payments made by credit/payment card or third-party network "must be reported on Form 1099-K … and are not subject to reporting on Form 1099-MISC or Form 1099-NEC" — payment *method* changes reportability, so the pack must see how a bill was paid.
Source: https://www.irs.gov/instructions/i1099mec

### Backup withholding
Rate: **24%**. Triggered when a payee fails to furnish a correct TIN (BWH-B) or after an IRS underreporting notice (BWH-C); applies to 1099-NEC/MISC payments among others. The pack needs a vendor state machine: no W-9 → withhold 24% or don't pay.
Source: https://www.irs.gov/businesses/small-businesses-self-employed/backup-withholding

### E-file mandate
**10 or more** information returns (aggregated) must be filed electronically, effective tax year 2023; IRS IRIS is the free channel.
Source: https://www.irs.gov/filing/e-file-information-returns

## (b) Sales/use tax on the AP side

- **Sales tax paid to vendors is a cost.** There is no input-credit mechanism anywhere in US sales tax; tax charged on a purchase invoice is expensed/capitalized with the item. Nothing on the purchase side reduces the company's own sales-tax remittance.
- **Use-tax accrual.** When a taxable purchase arrives untaxed (typically an out-of-state vendor), the *buyer* self-assesses use tax at its local rate and remits it. CA: use tax is owed on purchases made "without tax from a business located outside the state," at the same rate as sales tax, reported "on the sales and use tax return in the period when you first used, stored, or consumed the item" (https://www.cdtfa.ca.gov/taxes-and-fees/use-tax.htm). FL: "Use tax is due on the use or consumption of taxable goods or services when sales tax was not paid at the time of purchase" (https://floridarevenue.com/taxes/taxesfees/Pages/sales_tax.aspx). TX treats use tax the same way (https://comptroller.texas.gov/taxes/sales/). For an AP product this is the key control: *every untaxed invoice line needs a taxable-or-exempt decision, and taxable ones post to a use-tax accrual account.*
- **Exemption / resale certificates flow buyer → seller.** A purchaser buying for resale issues a resale certificate to the vendor to buy tax-free — CA form **CDTFA-230**, which the purchaser issues and which must describe the property by list or general description (https://www.cdtfa.ca.gov/formspubs/pub103/). TX uses Form 01-339 (Sales and Use Tax Resale/Exemption Certificate, comptroller.texas.gov); NY publishes its exemption-certificate set at https://www.tax.ny.gov/bus/st/exemption_certificates.htm. The AP pack must store certificates the company has *issued* (and, on the AR side, certificates *received* from customers, with good-faith validation).

## (c) First state pack: recommendation

| | CA | TX | FL | NY |
|---|---|---|---|---|
| Economy (BEA rank, current-$ GDP) | 1st | 2nd | 4th | 3rd |
| State rate | 7.25% (incl. 1.25% local base) | 6.25% | 6% | 4% |
| Local layer | district taxes 0.10–2.00%+ | up to 2% (8.25% cap) | county surtax (DR-15DSS) | county/city + 0.375% MCTD |
| Timely-filer discount | none found | 0.5% (+1.25% prepay) | 2.5% of first $1,200, cap $30 | none found |
| Economic nexus | $500k | $500k (safe harbor) | $100k | $500k **and** >100 sales |

Sources: rates & discounts — https://www.cdtfa.ca.gov/taxes-and-fees/sut-rates-description.htm, https://comptroller.texas.gov/taxes/sales/, https://floridarevenue.com/taxes/taxesfees/Pages/sales_tax.aspx, https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/st/sales_tax_rates_additional_sales_taxes_and_fees.htm (TB-ST-825); nexus — https://www.cdtfa.ca.gov/industry/wayfair.htm (AB 147, $500,000, eff. 2019-04-01), https://comptroller.texas.gov/taxes/sales/remote-sellers.php ($500,000 preceding 12 months; optional single local use-tax rate 1.75%), https://floridarevenue.com/taxes/taxesfees/Pages/sales_tax.aspx ($100,000 prior calendar year), https://www.tax.ny.gov/pubs_and_bulls/publications/sales/nexus.htm ($500,000 and >100 sales in preceding four quarters); economy rank — https://www.bea.gov/data/gdp/gdp-state (specific 2024 dollar figures not extracted from the BEA release PDF; rank order used instead).

**Recommendation: California.**
1. Largest market by a wide margin (BEA rank 1) and the largest count of small businesses among the four.
2. Its complexity is *representative but tractable*: one administering agency (CDTFA), one return covering state + district taxes, no home-rule cities (unlike CO/AL/LA, and unlike NY's dual state/local certificate quirks). Building CA forces the schema to handle multi-layer rates (7.25% base + 0.10–2.00% districts), district-level sourcing, use-tax accrual, and resale certificates — everything later states need — without the genuinely pathological cases.
3. The product's existing memory/market work already validates against US invoices; CA is where the most prospective customers and their vendors sit.
4. FL would be the *simplest* build (6% + capped surtax, generous collection allowance) but is the smallest of the four economies and its $100k nexus quirk matters mostly on the AR side; TX is a close second (single 8.25% cap, 0.5% vendor discount is a nice worksheet feature) and should be pack #2; NY is the worst first choice — lowest state rate but the most fragmented local base plus MCTD, with a two-part nexus test.

## (d) Structural divergences from a VAT pack (ZA/GB) — schema requirements

1. **No input-tax recovery.** VAT packs have `input_tax_credit` (asset, recoverable). US: tax on purchases is **cost** — the field must be nullable/absent, and the AP coding path must not offer a "claim input tax" state.
2. **Use-tax accrual object.** US purchases can *create* a liability (self-assessed use tax) instead of an asset. The pack needs a `self_assessed_tax` liability concept keyed to untaxed-but-taxable purchase lines. VAT's closest analogue is reverse-charge on imported services, but US use tax applies to *goods generally*, at destination local rates.
3. **Vendor information returns as first-class compliance calendar.** VAT has no per-vendor annual reporting. US: 1099-NEC (Jan 31) / 1099-MISC per calendar year, with per-year thresholds ($2,000 post-2025, inflation-indexed 2027+), per-box thresholds ($10 royalties, $600 attorney gross proceeds), entity-type exemptions, payment-method exclusions (card/TPSO → 1099-K), and a 10-return e-file mandate. Schema: `information_returns[]` with threshold tables *per tax year*.
4. **Vendor document = W-9 (about the vendor), not tax invoice (about the transaction).** ZA/GB validity checks are per-invoice (supplier VAT number, tax amount shown). US checks are per-vendor (W-9 on file, TIN match), and the failure mode is **24% backup withholding** at payment time — a payment-run control, not an invoice control.
5. **Certificates flow buyer → seller.** VAT: seller issues a compliant tax invoice. US: buyer issues resale/exemption certificates (CDTFA-230, TX 01-339, NY ST-120 family); the pack stores issued and received certificates with expiry/good-faith metadata.
6. **Multi-level, location-sourced rates.** VAT: one national rate set. US: state + county + city + district rates resolved by sourcing rules (origin/destination varies by state; TX even offers remote sellers a flat 1.75% single local rate election). Schema: rate lookup keyed by jurisdiction stack + sourcing rule, not a scalar.
7. **Per-state registration and nexus.** One VAT registration per country vs. a nexus test per state (physical + economic: $500k CA/TX/NY, $100k FL, NY adds a 100-transaction prong). Schema: `nexus_profile[]` per state with threshold + lookback definitions.
8. **Per-state returns, frequencies, and vendor discounts.** One VAT return vs. one return per registered state, with state-set frequencies (FL: monthly/quarterly/semiannual/annual by collections; TX: monthly/quarterly/yearly) and state-specific timely-filing discounts (TX 0.5% + 1.25% prepay; FL 2.5% capped $30 for e-filers) that are literal worksheet line items.
9. **Two separate compliance calendars.** Sales/use filings run on the state's period cycle; information returns run on a fixed calendar-year cycle (W-9 at onboarding → 1099 by Jan 31 → e-file if ≥10). A shared pack schema should model `compliance_cycles[]` rather than assuming one periodic tax return per jurisdiction.

**Shared-schema takeaway:** make "tax on purchases" a polymorphic outcome — `recoverable_credit` (VAT) | `cost` (US taxed) | `self_assessed_liability` (US use tax) — make vendor-level document requirements and annual information returns first-class, and make rates/registrations/returns arrays keyed by sub-jurisdiction rather than scalars.

## Sources

- IRS, Instructions for Forms 1099-MISC and 1099-NEC — https://www.irs.gov/instructions/i1099mec
- IRS, Backup withholding — https://www.irs.gov/businesses/small-businesses-self-employed/backup-withholding
- IRS, About Form W-9 — https://www.irs.gov/forms-pubs/about-form-w-9
- IRS, E-file information returns — https://www.irs.gov/filing/e-file-information-returns
- CDTFA, Sales & use tax rates description — https://www.cdtfa.ca.gov/taxes-and-fees/sut-rates-description.htm
- CDTFA, Use tax — https://www.cdtfa.ca.gov/taxes-and-fees/use-tax.htm
- CDTFA, Pub 103 Sales for Resale (CDTFA-230) — https://www.cdtfa.ca.gov/formspubs/pub103/
- CDTFA, Wayfair/AB 147 — https://www.cdtfa.ca.gov/industry/wayfair.htm
- Texas Comptroller, Sales and use tax — https://comptroller.texas.gov/taxes/sales/
- Texas Comptroller, Remote sellers — https://comptroller.texas.gov/taxes/sales/remote-sellers.php
- Florida DOR, Sales and use tax — https://floridarevenue.com/taxes/taxesfees/Pages/sales_tax.aspx
- NY Tax Dept, TB-ST-825 rates — https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/st/sales_tax_rates_additional_sales_taxes_and_fees.htm
- NY Tax Dept, Nexus (no physical presence) — https://www.tax.ny.gov/pubs_and_bulls/publications/sales/nexus.htm
- NY Tax Dept, Exemption certificates — https://www.tax.ny.gov/bus/st/exemption_certificates.htm
- BEA, GDP by state — https://www.bea.gov/data/gdp/gdp-state
