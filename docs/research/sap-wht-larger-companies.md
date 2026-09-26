# SAP, Lesotho withholding tax and supplier statements: what a larger AP team (LEC) needs from DocuBite

Research for #496 (map #497). It feeds #498 (WHT decision), #499 (WHT posting and the RSL report), #500 (SAP route) and #501 (supplier statements). Gathered 2026-09-26. This file holds facts and the questions they raise. It makes no decisions.

**How to read the marks.** **Verified** means I read the claim in the primary source linked beside it. **Unverified** means it comes from a search snippet, a secondary source, a community answer, or a page I couldn't render. **Inferred** means it's my reasoning from verified facts, not something a source says. Lesotho rates, thresholds and deadlines appear only where a primary source states them. Anything else is marked *not found in a primary source*.

**About the Lesotho sources.** RSL's site (rsl.org.ls) serves an incomplete TLS certificate chain, so the files were fetched with certificate checks turned off. Its *Tax Rates* and *Withholding Tax* pages also contain injected spam links (a Ukrainian loan site on one, a pharmacy on the other), which suggests the CMS has been tampered with. Every Lesotho fact here was therefore taken from the PDFs (the Act, the Regulations, the rulings and the guides), and the HTML pages are used only where they agree with those PDFs.

---

## Summary

1. **Lesotho WHT is a payment-time tax on the amount before VAT, and its main domestic case is narrower than "services".** Under s.157 of the Income Tax Act 1993 a person who contracts with a *resident contractor* withholds **5% of the gross amount of the payment**. It starts with the first month in which payments under the contract exceed **M3,000 in that month**. It doesn't apply to a *complying contractor*, meaning one holding an exemption certificate that is valid on the date of payment. Those certificates run for **two years** and can be withdrawn. "Contractor" means leasing vehicles, plant or equipment, construction, transportation, plus the services listed in reg. 4 of the 1994 Regulations. **verified** ([Act, consolidated to 1 April 2012](https://www.rsl.org.ls/sites/default/files/2024-05/Income%20Tax%20Act%201993%20%20Updated%20up%20to%201%20April%202012.pdf) s.3, s.157; [Income Tax Regulations 1994, LN 23](https://lesotho.eregulations.org/media/Income%20Tax%20Regulations%20to%20the%20Principal%20Law%20%20Legal%20Notice%20No%2023%20of%201994.pdf) reg. 4). RSL's web page says more broadly that WHT is "levied on supply of services … to both resident and non resident suppliers" ([RSL WHT page](https://www.rsl.org.ls/withholding-tax-0)), which is wider than the Act text I found.
2. **Payments to non-residents are withheld too, and the amount goes to RSL immediately.** The rates are 10% on a Lesotho-source services contract (s.108) and 25% on management charges, royalties, interest and dividends (s.107). The SA–Lesotho tax treaty (DTA) reduces the rate on SA technical fees to **7.5% from 27 June 2016**. Resident-contractor WHT is due **within 15 days from the end of the month** it was withheld. All other WHT is due **immediately after** it is withheld. **verified** (Act s.107–109; Regs 1994 reg. 25; [RSL technical-services guideline](https://www.rsl.org.ls/sites/default/files/2024-05/Guideline%20on%20Technical%20Services.pdf)).
3. **The payer must give the supplier a tax withholding certificate on the date of payment** (s.163(2)(b)). **RSL's own system now generates WHT certificates** once the agent has filed its monthly WHT schedule and paid, and both the agent and the payee can download them from RSL's e-TCC portal. **verified** (Act s.163; [RSL Guide on Automated WHT](https://www.rsl.org.ls/sites/default/files/2024-05/Withholding%20Tax-Guide.pdf)). This changes what "a supplier WHT certificate" in #498 should be.
4. **Neither QuickBooks Online nor Xero has native supplier WHT.** Xero's Accounting API spec (v19.0.0) never mentions withholding, a Payment has a single `Amount` of at most the amount owed, and it posts to a single `Account` (**verified**, [Xero OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml)). Both vendors' help communities recommend a *WHT payable* liability account and a negative bill line coded to it (**unverified**: community and help-centre content). Because of ADR 0001 (DocuBite never pushes payments to the ledger), **if the ledger doesn't hold the WHT, it will read a bill paid net of WHT as part-paid, and the ledger wins.** #498 and #499 have to decide this together (**inferred**).
5. **SAP.** Nango has auth-and-proxy providers for **SAP Business One (Service Layer)** and **SAP S/4HANA Cloud (OData, OAuth2 client credentials or Basic)**. It has none for ECC or on-premise S/4HANA. **verified** ([Nango providers.yaml](https://github.com/NangoHQ/nango/blob/master/packages/providers/providers.yaml), commit of 2026-09-25). S/4HANA Cloud's Supplier Invoice API carries WHT on the invoice header (type, code, base, manual amount). Its Business Partner API holds the supplier's WHT master data, including exemption certificate dates. **verified** (SAP-published Cloud SDK models). No primary source says which SAP product LEC runs.
6. **South Africa has no withholding tax on payments to resident suppliers.** SARS lists withholding only on interest and royalties paid to foreign persons (15%) and on non-resident entertainers and sportspersons (15%). **verified** ([SARS types of tax](https://www.sars.gov.za/types-of-tax/)). A ZAR company shouldn't be offered WHT in AP.

---

## Part A: SAP

### A1. Which SAP products are in play

| Claim | Mark | Source |
|---|---|---|
| LEC's AP Assistant Accountant "capture[s] supplier invoices … under the SAP system", "calculate[s] withholding tax", "prepare[s] automatic payments in SAP or EFT", and "reconcile[s] allocated individual creditors' accounts against suppliers' monthly statements". Requirements include "preferably SAP" and "fair knowledge of Lesotho Tax Laws". Closes 09 October 2026. | **unverified** (job aggregator, not LEC's own site) | [selibeng.com advert](https://selibeng.com/accounts-payable-assistant-accountant-at-lec/) |
| Which SAP product LEC runs (ECC, S/4HANA on-premise or private, S/4HANA Cloud, Business One) | **not found in a primary source** | none; searches found no LEC or SAP case study |
| Which SAP products Lesotho and SA mid-to-large companies run | **not found in a primary source** | none; SAP publishes no country install base |
| SAP Business Suite 7 (ECC) mainstream maintenance ends at the end of 2027, with optional extended maintenance to the end of 2030. SAP commits to S/4HANA until the end of 2040. | **verified** | [SAP maintenance strategy](https://support.sap.com/en/release-upgrade-maintenance/maintenance-information/maintenance-strategy/s4hana-business-suite7.html) |

**Inferred:** a utility of LEC's age and ownership (state-owned, founded 2006) is more likely on ECC or on-premise S/4HANA than on Business One or S/4HANA Cloud. Only a conversation with LEC's finance or IT team can settle it. If LEC is on ECC, it has to move off it by 2027–2030, so any ECC-specific integration built now would have a short life.

### A2. How a third party posts a supplier invoice and reads data back

**S/4HANA Cloud (public edition)**

- The Supplier Invoice OData V2 service `API_SUPPLIERINVOICE_PROCESS_SRV` has a `SupplierInvoice` entity with navigations `toSupplierInvoiceItemGlAcct` (G/L lines), `toSupplierInvoiceTax`, `toSupplierInvoiceWhldgTax` (header WHT) and `toSuplrInvcItemPurOrdRef` (PO lines), plus `release` and `cancel` functions. **verified** (SAP's own VDM, [`@sap/cloud-sdk-vdm-supplier-invoice-process-service` 2.1.0](https://www.npmjs.com/package/@sap/cloud-sdk-vdm-supplier-invoice-process-service): "OData VDM for the Supplier Invoice Process Service of SAP S/4HANA Cloud"). The package dates from 2022, so the live API may have gained fields since.
- The header WHT entity `SuplrInvcHeaderWhldgTax` has the fields `withholdingTaxType`, `withholdingTaxCode`, `withholdingTaxBaseAmount`, `manuallyEnteredWhldgTaxAmount` and `documentCurrency`. **verified** (same package).
- The API is exposed through communication scenario **SAP_COM_0057** (Supplier Invoice Integration). **unverified** (search snippet of [api.sap.com](https://api.sap.com/api/API_SUPPLIERINVOICE_PROCESS_SRV/resource/Withholding_Tax_Data); api.sap.com and help.sap.com need JavaScript or a login and couldn't be read).
- Attachments: SAP publishes an S/4HANA Cloud attachment-service model (**verified**, [`@sap/cloud-sdk-vdm-attachment-service` 2.1.0](https://www.npmjs.com/package/@sap/cloud-sdk-vdm-attachment-service)). Its service name (`API_CV_ATTACHMENT_SRV`) and how it links to a supplier invoice are **unverified**.
- Supplier master WHT (`API_BUSINESS_PARTNER`, entity `SupplierWithHoldingTax`), keyed by supplier, company code and WHT type: `isWithholdingTaxSubject`, `withholdingTaxCode`, `recipientType`, `withholdingTaxNumber`, `withholdingTaxCertificate`, `exemptionDateBegin`, `exemptionDateEnd`, `withholdingTaxExmptPercent`, `exemptionReason`. **verified** ([`@sap/cloud-sdk-vdm-business-partner-service` 2.1.0](https://www.npmjs.com/package/@sap/cloud-sdk-vdm-business-partner-service)).
- Auth: Nango's `sap-odata-oauth2-cc` gets a client-credentials token from `https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/token` and proxies to a customer-given API server. `sap-odata-basic` proxies with Basic auth. **verified** ([providers.yaml](https://github.com/NangoHQ/nango/blob/master/packages/providers/providers.yaml)). The customer's admin has to create a communication user and arrangement for the scenario. **unverified**: this is the usual S/4HANA Cloud setup, but I couldn't read SAP's page for it.
- Reading payment status back (cleared or open items): **not researched to a primary source.** It's a gap for #500.

**S/4HANA on-premise or private cloud**

- An on-premise variant of the Supplier Invoice API is listed as `OP_API_SUPPLIERINVOICE_PROCESS_SRV`. **unverified** (search-result title of [api.sap.com](https://api.sap.com/api/OP_API_SUPPLIERINVOICE_PROCESS_SRV/overview)).
- **Inferred:** the customer's IT has to activate the OData service on their Gateway and make it reachable from the internet, either through SAP BTP's Cloud Connector or a reverse proxy, and then create a technical user. Nango has no on-premise provider, but its `sap-odata-basic` proxy can target any hostname the customer exposes.

**ECC**

- The usual routes are BAPIs (`BAPI_INCOMINGINVOICE_CREATE` for logistics invoice verification, `BAPI_ACC_DOCUMENT_POST` for FI documents), or IDocs, or SOAP through SAP PI/PO. **unverified**: I couldn't reach SAP's documentation for these. **Inferred:** each needs RFC or middleware set up by the customer's SAP team. None has an internet-facing REST API or a Nango provider. See A1 on ECC's end of maintenance.

**Business One**

- Service Layer is SAP B1's REST API (OData v3/v4). `PurchaseInvoices` is the A/P invoice ("It represents a request for payment"), with actions `Cancel`, `Close` and `CreateCancellationDocument`. `Attachments2` holds files. There are `WithholdingTaxCodes`, `WithholdingTaxTypes` and `WithholdingTaxCategories` services. The reference's example base URL is `https://localhost:50000/b1s/v2/`. **verified** ([Service Layer API Reference, 10.0](https://help.sap.com/doc/056f69366b5345a386bb8149f1700c19/10.0/en-US/Service%20Layer%20API%20Reference.html)). The WHT fields on a document (how a purchase invoice carries its WHT lines) aren't in the reference's entity list: **unverified**.
- Nango's `sap-business-one` provider uses TWO_STEP auth, a `POST https://<domain>/Login` with `CompanyDB`, `UserName` and `Password`. It keeps the session cookie (about 28 minutes) and proxies to the Service Layer URL. **verified** ([providers.yaml](https://github.com/NangoHQ/nango/blob/master/packages/providers/providers.yaml); [Nango docs](https://nango.dev/docs/integrations/all/sap-business-one)). **Inferred:** an on-premise B1 install has to publish its Service Layer on a URL Nango can reach. The credentials are a named B1 user's password, not OAuth.

### A3. Nango and the cheapest honest path

- Nango's SAP providers are `sap-business-one`, `sap-odata-oauth2-cc`, `sap-odata-basic`, `sap-ariba`, `sap-concur`, `sap-concur-password`, `sap-fieldglass` and `sap-success-factors`. There are none for ECC, and none named for on-premise S/4HANA. **verified** ([providers.yaml](https://github.com/NangoHQ/nango/blob/master/packages/providers/providers.yaml)).
- Nango covers **auth and proxy only**. DocuBite would write every mapping itself, just as it does for QBO and Xero today. **Inferred**, from the provider entries, which configure auth and a proxy base URL. I didn't check whether Nango ships prebuilt SAP sync templates.
- **Inferred cheapest honest path, per product:**
  - **S/4HANA Cloud:** Nango `sap-odata-oauth2-cc` plus the Supplier Invoice and Business Partner APIs. It fits ADR 0005 (Nango owns ledger auth) and the #376 boundary as a fourth ledger. Testing needs an SAP trial or partner tenant (availability unverified).
  - **Business One:** Nango `sap-business-one` plus Service Layer. It's the cheapest to prototype, but the customer's IT has to expose Service Layer.
  - **ECC or on-premise S/4HANA:** nothing reusable, so any route is a per-customer project with their SAP team. A structured export the customer's SAP team loads themselves would be honest and cheap, but it isn't "posting".

### A4. How SAP models withholding tax

- **Verified** (from the field documentation in SAP's supplier-invoice model): "Withholding tax types classify particular features of a withholding tax including: The time at which the withholding tax is posted; The basis on which the base amount is calculated; The basis for accumulation (if applicable). Withholding tax types are to be distinguished from withholding tax codes, to which are allocated the withholding tax percentage rate … a business transaction can only be assigned one withholding tax code per withholding tax type."
- **Verified:** the supplier master holds WHT per company code and type, with a liable flag, a code, an exemption certificate number, exemption dates and an exemption percentage (A2).
- **Unverified:** SAP's extended withholding tax posts either at invoice or at payment depending on the WHT type. That matches the first quote but comes from SAP help pages I couldn't render ([Posting Supplier Invoices with Withholding Tax](https://help.sap.com/docs/SAP_S4HANA_CLOUD/b978f98fc5884ff2aeb10c8fdeb8a43b/56871d69aa6f4f91be42597bd5e7ced3.html), [Supplier Withholding Tax](https://help.sap.com/docs/SAP_S4HANA_CLOUD/3c916ef10fc240c9afc594b346ffaf77/65db3c5876ac9144e10000000a4450e5.html)).
- **Inferred mapping to DocuBite:** an SAP *WHT type* is DocuBite's category (resident contractor, non-resident services, non-resident management charge and so on) with its timing. An SAP *WHT code* is the rate. SAP's supplier WHT data is DocuBite's supplier WHT code plus exemption certificate with an expiry. Lesotho s.157 is a payment-time type. If #498 designs WHT as *category + rate + exemption with validity dates, applied at payment*, it lines up with SAP without having to be reshaped later.

---

## Part B: Lesotho withholding tax (with South Africa for contrast)

### Sources and how current they are

| Source | Date | Status |
|---|---|---|
| [Income Tax Act 1993, consolidated "Updated up to 1 April 2012"](https://www.rsl.org.ls/sites/default/files/2024-05/Income%20Tax%20Act%201993%20%20Updated%20up%20to%201%20April%202012.pdf) | amendments to 2012 | **May be out of date.** It's RSL's only published consolidation. Its Second Schedule (22%/35% personal bands) is already stale against RSL's current 20%/30% ([RSL income tax page](https://www.rsl.org.ls/income-tax)), so later Finance or Amendment Acts exist. I found no primary text of any post-2012 amendment to s.107, 108, 157, 163, 164 or 166. |
| [Income Tax Regulations 1994 (LN 23 of 1994)](https://lesotho.eregulations.org/media/Income%20Tax%20Regulations%20to%20the%20Principal%20Law%20%20Legal%20Notice%20No%2023%20of%201994.pdf) (government eRegulations portal) | 1994 | May have been amended since. |
| [RSL Public Ruling: Withholding Taxes, Issue 1](https://www.rsl.org.ls/sites/default/files/2024-05/Income%20Tax%20Public%20Ruling%20Withholding%20Taxes%20%20.pdf) (also an [earlier LRA-branded copy](https://www.rsl.org.ls/sites/default/files/2024-07/Withholding%20Tax%20Guide.pdf)) | dated April 2010; PDF created 2023 | Not binding (it says so). Its worked example uses 14% VAT, where RSL now lists 15% ([tax rates](https://www.rsl.org.ls/tax-rates)). |
| A newer "[Withholding Tax Public Ruling](https://www.rsl.org.ls/sites/default/files/2025-06/Withholding%20Tax%20Public%20Ruling_1.pdf)" (June 2025) | 2025 | **Now returns 404.** It's indexed by search engines, but its content couldn't be read. **It may supersede parts of this section. Get a copy from RSL or the customer before #498 closes.** |
| [RSL Guide on Automated WHT](https://www.rsl.org.ls/sites/default/files/2024-05/Withholding%20Tax-Guide.pdf) and an [earlier email-filing version](https://www.rsl.org.ls/sites/default/files/2024-05/Automated%20Withholding%20Tax%20Guide_0.pdf) | Sept 2023 / Feb 2023 | current process guides |
| [RSL guideline on technical services under the Lesotho–SA DTA](https://www.rsl.org.ls/sites/default/files/2024-05/Guideline%20on%20Technical%20Services.pdf) | 2018 | |
| Income Tax (Amendment of Monetary Amounts) Regulations [2020 (LN 17)](https://www.rsl.org.ls/sites/default/files/2024-05/INCOME%20TAX%20%20REGULATIONS%20NO.17%20OF%202020_3.pdf) and [2026 (LN 24)](https://www.rsl.org.ls/sites/default/files/2026-09/INCOME%20TAX%20%28AMA%29%20REGULATIONS%20No.24%20of%20%202026.%20%281%29%20%281%29_0.pdf) | 2020 / in force 1 April 2026 | Read. They change only the personal credit (s.73) and the Second Schedule band. **Neither touches WHT.** |

### B1. Which supplier payments carry WHT

**Resident suppliers: s.157, "Payments to Resident Contractors".** All **verified** in the [Act](https://www.rsl.org.ls/sites/default/files/2024-05/Income%20Tax%20Act%201993%20%20Updated%20up%20to%201%20April%202012.pdf) except where marked.

- s.157(1): "a person who contracts with a resident contractor must withhold tax on the payment to the contractor at the rate of **5% of the gross amount of the payment**."
- The **scope** is the "contractor" definition in s.3: "a person engaged in the business of leasing vehicles, plant, or equipment, or of providing construction, transportation, or any other service prescribed by regulations, under a contract, where the primary purpose of the contract is the performance of services, whether or not goods are also provided". Reg. 4 of the 1994 Regulations adds painting or decorating; installation of services or appliances (electricity supply, heating, cooking, refrigeration, insulation, air conditioning, ventilation, communications, fire or security protection); plumbing, drainage, water supply or irrigation; roofing or tiling; earthmoving or excavation; landscaping; building demolition; and site restoration. **verified** ([Regs 1994](https://lesotho.eregulations.org/media/Income%20Tax%20Regulations%20to%20the%20Principal%20Law%20%20Legal%20Notice%20No%2023%20of%201994.pdf)).
  - RSL's web page and ruling speak more broadly: "As a general rule, withholding taxes are levied on supply of services and are applicable to both resident and non resident suppliers" ([RSL WHT page](https://www.rsl.org.ls/withholding-tax-0)). The ruling lists "service fees payable to non-residents", "payments to resident contractors" (with the Act's list), passive income and entertainers ([ruling](https://www.rsl.org.ls/sites/default/files/2024-05/Income%20Tax%20Public%20Ruling%20Withholding%20Taxes%20%20.pdf)). **The Act text I have covers resident *contractors*, not every resident service provider.** Whether a Lesotho accountant, consultant or IT firm must suffer WHT is *not settled by a primary source I could read*. See the open questions.
- **Threshold**, s.157(3): "Subsection (1) applies only commencing with the first month in which payments under the contract exceed **M3,000 in that month**." The ruling paraphrases this as "where the total fee to be paid is less than M3000 no withholding tax is payable." The two readings differ: the Act counts *per contract, per month, from the first month over M3,000*.
- **Exemption**, s.157(4)–(12): no WHT on payments to a *complying contractor*, meaning "a resident contractor who has been issued with a certificate of exemption from withholding tax … which certificate is **valid at the date of payment**". The certificate "shall remain in force for **two years** from the date of issue". The Commissioner General may withdraw it with written notice. (Sub-secs. (4)–(12) were added by Act No. 10 of 1996.)
- s.157(2): no WHT on payments by an individual for their own principal residence. That's irrelevant to a company.
- Goods supplied with a service: "the cost of such goods will be aggregated with the cost of the service and the gross amount (before charging VAT) is subject to withholding tax" (ruling, **verified** as RSL guidance; not binding).
- Exclusions: "withholding taxes are not payable on utilities … electricity, water and sewage, and telephone … [nor] on rental for buildings" (ruling, **verified** as RSL guidance). I didn't find this in the Act text; it follows from the contractor definition.

**Non-resident suppliers** (Act, **verified**)

- s.108: "Withholding tax at the rate of **10%** is payable on the gross amount of a payment under a Lesotho-source services contract paid to a non-resident". This covers technical and ordinary services, but management charges fall under s.107. A "technical services contract" is "accounting, auditing, economic, financial, legal, management, engineering, architectural, surveying, or other similar professional service" (s.3).
- s.107: WHT "at the standard rate of tax" (s.3: "a rate of **25%**") on a Lesotho-source dividend, interest, royalty, natural resource payment or management charge paid to a non-resident. It's 15% where these relate to concessionary manufacturing income (s.107(3)).
- s.109: WHT under s.107 and s.108 is a **final tax** unless the non-resident elects to be assessed.
- DTA: "effective from the 27th June 2016, the WHT rate that applies on all services of a technical nature provided by residents of South Africa to Lesotho is **7.5%**" ([RSL technical-services guideline](https://www.rsl.org.ls/sites/default/files/2024-05/Guideline%20on%20Technical%20Services.pdf), **verified**). RSL's rates page lists "Resident contractors 5% · Non-Resident Contractors 10% · Non-Residents (Technical services) 7.5% (For RSA only)" ([tax rates](https://www.rsl.org.ls/tax-rates), **verified**, same numbers). The 2010 ruling's table also gives DTA rates of 10% or 15% on s.107 passive income for RSA and UK residents. **verified** as RSL guidance, but the treaty text wasn't read.
- Source: a service performed *outside* Lesotho by an SA firm isn't Lesotho-source, so no WHT applies (ruling, Example 1, **verified** as guidance).

**The base is before VAT, and VAT is charged on the same base.** "The 'gross amount' referred to in the law is the amount before inclusion of the VAT … VAT is also charged on the same 'gross amount' that is, before the deduction of the withholding tax." Example: M15,000 before VAT, WHT M1,500 (10%), VAT M2,100 (at the then-14%), so the supplier receives M15,600 (ruling, Example 6, **verified** as guidance).

**Worked example (inferred, at today's 15% VAT and 5% resident-contractor WHT).** Invoice subtotal M10,000, VAT M1,500, total M11,500. WHT is 5% × M10,000 = M500. Amount to pay is M11,500 − M500 = **M11,000**. With a M1,000 Credit allocation, the amount to pay is M10,000. Whether a credit note also reduces the WHT base is *not found in a primary source*.

### B2. When it's withheld, who pays RSL and by when, and the certificate

- **When:** at payment. s.157 speaks of "the payment", s.163 has the certificate delivered "on the date of payment", and s.168(1) says tax withheld "is treated as received by the payee at the time it was withheld". RSL's schedule asks for the "payment date (date when tax was deducted from the source)". **verified** (Act; [Automated WHT guide](https://www.rsl.org.ls/sites/default/files/2024-05/Withholding%20Tax-Guide.pdf)). **Inferred:** WHT is owed per payment, on that payment's amount, so a partial payment carries its own WHT. How to split VAT out of a partial payment isn't stated in a primary source.
- **Who:** the payer is the *withholding agent*. If it fails to withhold, it is **personally liable** for the tax (it may recover it from the payee), s.165. Tax withheld "is held in trust for the Lesotho Government", s.167. Failing to withhold, to furnish the certificate, or to remit is an offence, with a fine of up to M10,000 or up to two years (s.178, s.180). Additional tax applies under s.196. **verified**, 2012 consolidation, so the amounts may since have changed.
- **By when:** reg. 25 of the 1994 Regulations: tax withheld under s.157 must be paid "**within 15 days from the end of the month in which the tax was withheld**". In any other case (including s.107 and s.108 for non-residents) it's due "**immediately after the tax was withheld**". **verified** ([Regs 1994](https://lesotho.eregulations.org/media/Income%20Tax%20Regulations%20to%20the%20Principal%20Law%20%20Legal%20Notice%20No%2023%20of%201994.pdf)). RSL's page says the same thing loosely: "collected monthly or whenever there has been tax withheld". Some secondary sites say "14 days" or "the 15th". I have ignored them.
- **Annual statement:** within 28 days after the end of the year of assessment (the year ends 31 March, s.3), the agent files "a statement in the prescribed form specifying (a) the name and address of each payee; (b) the amounts paid or payable …; (c) the amounts of tax withheld" (s.164(2), **verified**). The prescribed form's current name and format are *not found in a primary source*.
- **How it's filed and paid today:** the agent registers for WHT with RSL. RSL provides a **WHT schedule in Excel**, filled in with "the nature of services rendered, the payee details, such as the legal name of the payee, payment date … gross amount and amount of tax deducted at source". It's uploaded through RSL's *Interim E-filing › WHT (upload schedule)* for a chosen **month and year** (the Feb 2023 version said to email it to WHTSubmission@rsl.org.ls instead). "A Payment should accompany submission" is made through M-Pesa via RSL e-payments, a commercial bank (Standard Lesotho Bank, Nedbank Lesotho, FNB) or RSL's banking hall. **verified** ([Automated WHT guide](https://www.rsl.org.ls/sites/default/files/2024-05/Withholding%20Tax-Guide.pdf)). The template's exact columns, and whether it asks for the payee's TIN, are *not found in a primary source*. The template isn't published.
- **The certificate:** by law the withholding agent "must deliver to the payee a tax withholding certificate setting out the amount of payments made and tax withheld during the year of assessment … on the date of payment" (s.163(1), (2)(b)), and the payee attaches it to their return (s.163(3)). Issuing a document "purporting to be a tax withholding certificate" **without being authorised by the withholding agent** is an offence (s.181(c)). **verified**. In practice, "once payment has been made, the system will then generate WHT certificate(s) instantly". Both the agent and the payee get them from RSL's e-TCC portal under *My WHT certificate(s)*. **verified** (Automated WHT guide).
  - **Inferred consequence for #498:** there are two different documents. (a) An **advice of tax withheld** that DocuBite sends on the payment date, alongside or inside the remittance advice (ADR 0021). It meets s.163's timing, and the company authorises it. (b) **RSL's certificate**, generated only after the monthly schedule is filed and paid. DocuBite can't produce (b). It could record that (b) exists, for example with a certificate number entered or captured later.

### B3. South Africa: no WHT on payments to resident suppliers

| Claim | Mark | Source |
|---|---|---|
| SARS's list of tax types includes only two withholding taxes, on interest and on royalties. Nothing applies to payments to resident suppliers or contractors. | **verified** (no domestic-supplier WHT is listed on the page) | [SARS types of tax](https://www.sars.gov.za/types-of-tax/) |
| Royalties to foreign persons: "final withholding tax rate of 15%", paid "before the end of the month following the month in which the royalty was paid" (WTR01) | **verified** | [SARS royalties](https://www.sars.gov.za/types-of-tax/withholding-tax-on-royalties/) |
| Interest to foreign persons: final WHT of 15% (from 1 March 2015), with the WT002 and payment due before the end of the following month | **verified** | [SARS interest](https://www.sars.gov.za/types-of-tax/withholding-tax-on-interest/) |
| Non-resident entertainers and sportspersons: 15% final, withheld by the resident payer, paid over before the end of the following month | **verified** | [SARS entertainers](https://www.sars.gov.za/individuals/tax-during-all-life-stages-and-events/tax-and-non-residents/withholding-tax-for-non-resident-entertainers-and-sportspersons/), [SARS other taxes](https://www.sars.gov.za/tax-rates/other-taxes/) |
| Withholding on property bought from a non-resident seller (s.35A) and dividends tax | **unverified** (not read); both fall outside supplier AP | |

**Inferred:** a ZAR company's AP has no WHT case except rare royalty or interest payments to non-residents, which aren't supplier invoices in DocuBite's sense. WHT should be unavailable on a ZAR company and not merely off by default. If a ZAR customer ever needs royalty WHT, that's a separate decision.

### B4. How QuickBooks Online and Xero handle WHT

| Claim | Mark | Source |
|---|---|---|
| Xero's Accounting API has no withholding concept. The OpenAPI spec (v19.0.0) never mentions "withholding". | **verified** | [Xero OpenAPI `xero_accounting.yaml`](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml) |
| A Xero `Payment` has one `Account` and an `Amount` that "Must be less than or equal to the outstanding amount owing on the invoice". Credit notes are allocated with `PUT /CreditNotes/{CreditNoteID}/Allocations`, and `/BatchPayments` exists. | **verified** | same spec |
| Xero's help article: create a WHT current-liability account, then on the contractor's bill enter the fee on line 1 and "a negative value in the withholding tax liability account on the second line". Pay the tax authority by coding the bank payment to that account. | **unverified** (Xero Central renders with JavaScript; content from its search snippet) | [Xero Central](https://central.xero.com/s/article/Account-for-withholding-tax-payments-for-contractors) |
| QBO has no native supplier WHT. An Intuit staff answer: create a liability account, enter a negative amount to it on the supplier's bill, and pay the tax agency separately. | **unverified** (Intuit community answer, not API reference) | [QuickBooks Community](https://quickbooks.intuit.com/learn-support/global/tax/how-to-record-and-pay-withholding-tax-on-supplier-s-behalf/00/398188) |
| A QBO `BillPayment` line links `Bill` and `VendorCredit` through `LinkedTxn`. QBO has no stand-alone credit-allocation call. | **unverified** here (the Intuit developer pages didn't render). ADR 0017 already relies on it. | [Intuit: manage linked transactions](https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-linked-transactions) |

**Inferred: the ADR 0001 interaction, the load-bearing point for #498 and #499.** DocuBite never pushes payments to the ledger (ADR 0001), and the ledger's word on paid state wins. The company pays the supplier net and records that payment in the ledger itself, or the rail's Paid is recorded outside the ledger. If the ledger bill still shows the gross, **the ledger will report the bill as part-paid by the WHT amount, and DocuBite will read "Partially paid"**, not the Paid that #498 wants. Something has to put the WHT against the bill in the ledger. The options DocuBite could post:

1. **A negative WHT line on the bill at posting**, coded to WHT payable. The bill posts net. This is the pattern both vendors' communities give. It recognises WHT at invoice, not at payment, so an exemption or threshold that changes between posting and paying means correcting the posted bill (compare ADR 0011's correction flow).
2. **A WHT credit at payment:** a QBO `VendorCredit` or Xero `ACCPAYCREDIT` for the WHT amount, coded to WHT payable. On Xero it's allocated to the bill with the Allocations call. On QBO it can only be applied inside a BillPayment, which is the same limitation ADR 0017 hit, so a person would apply it in QuickBooks. This keeps the tax at payment time, as the law has it.
3. **Nothing in the ledger.** Paid state then contradicts #498 until someone books the WHT by hand.

Option 2 reuses the Credit note posting and allocation machinery DocuBite already has (ADR 0017), but it would be a *ledger* credit that isn't a DocuBite Credit note. The glossary would need a name for it.

---

## Part C: Supplier statement reconciliation

**What the job is.** The advert: "Reconcile allocated individual creditors' accounts against suppliers' monthly statements" (**unverified**, aggregator copy). The rest of this part is **inferred** from standard AP practice and the facts above. I found no primary source that defines the procedure.

- A supplier's statement lists, for a period, its invoices, its credit notes and the payments it has received, with an opening and a closing balance. Reconciling means agreeing that closing balance with what the company's books say it owes the supplier, then explaining the difference as a list of **reconciling items**:
  - **On the statement but not in the company's books:** an invoice DocuBite never received, one still in review or approval (not yet owed on the company's side), or one the company disputes.
  - **In the books but not on the statement:** payments in transit (the Payment line is Sent or Paid near the cut-off), credit notes the supplier hasn't issued or has issued but the company hasn't received, and invoices dated after the statement.
  - **Amount differences:** partial payments, discounts taken, currency rounding, and in Lesotho **WHT**.
- **The Lesotho-specific item (inferred from B2):** the supplier receives the payment net of WHT. Until it holds the WHT certificate, which only exists after the company files and pays RSL's monthly schedule, its statement will often show the WHT amount as still owed. The reconciliation must be able to say "M500 withheld on DB12345678, paid to RSL on <date>, certificate <no.>". So WHT records and their certificate status become inputs to #501.
- **Follow-up:** each reconciling item gets an owner and an action. That might be requesting a copy invoice, sending the supplier the payment or WHT evidence, or chasing a credit note. It closes when it clears on a later statement or in the books. Whether month-end close requires every statement to be reconciled is a company policy, so it's for the owner or the customer to decide.

**What the code has today** (**verified** by reading this worktree):

- `supplier_statement` maps to the `other` document type (`lib/doc-types.ts`, the legacy code map).
- `lib/reconciliation/supplier-statement.ts` matches statement entries against **documents only** (`MatchCandidateDocument`: supplier, total, date, currency, invoice number). It works in two passes. The first matches when the invoice number appears as a whole token in the entry's description (confidence 0.9). The second falls back to the same amount (`amountsMatch`) and currency within 30 days (confidence 0.6). It has no candidates for **Payment records, Credit notes, Credit allocations or WHT**, it doesn't read an entry's direction (debit or credit), and nothing calls it except its tests.
- **Inferred gaps for #501:** a statement's payment line equals the **net** paid (gross − WHT − credit). It should match a **Payment record** (ADR 0001), not an invoice total. Otherwise, with WHT, the amount fallback won't match at all, or will match the wrong document. Credit lines need to match Credit notes (ADR 0017). The matcher's "suggest, never assume" posture already fits ADR 0008's rule for bank statements.

---

## 1. What #498–#501 need, answered

**#498: WHT on the supplier, the invoice and the Payment line**

- *Where it's set:* on the supplier, as a **category** (resident contractor under s.157, non-resident services under s.108, non-resident management charge, royalty or interest under s.107, or none). A **rate** follows from the category (5% / 10% / 25%, or 7.5% for SA technical services under the DTA). A supplier can also hold an **exemption certificate** with its number, issue date and expiry, where expiry = issue + 2 years (s.157(8)), and it can be withdrawn earlier. Whether a supplier is a "contractor" depends on the service (s.3 and reg. 4), so a line-level override is justified, for example a transport firm also selling goods. Line-level (ruling on goods incidental to a service) and the SAP analogue (WHT per supplier, company code and type) both support "the supplier gives the default, the invoice or line can override". (Facts verified; the design is inferred.)
- *When it's taken:* **at payment** (s.157, s.163, s.168; RSL schedule "payment date (date when tax was deducted)"). Before payment, an invoice can only show *expected* WHT.
- *Exemption checked at the payment date*, not the invoice date ("valid at the date of payment", s.157(5)).
- *Base:* the amount **excluding VAT** (ruling, Example 6). Amount to pay = total incl. VAT − WHT − credit. The ticket's "gross − WHT − credit" works only if "gross" means the VAT-inclusive total, while WHT is computed on the VAT-exclusive amount.
- *Threshold:* from the first month in which payments **under the contract** exceed M3,000 in that month (s.157(3)). DocuBite has no "contract". The supplier is the nearest proxy. See the open questions.
- *Certificate:* s.163 requires the agent to deliver a certificate on the payment date. RSL generates the official certificate after the monthly filing and payment. DocuBite's document is therefore an **advice of tax withheld sent with the Payment record** (ADR 0021's moment), and RSL's certificate is a later fact DocuBite can record.
- *Checks:* a supplier with category *resident contractor* and no exemption certificate on file means WHT applies. An exemption past its expiry **on the payment date** means WHT applies. A payment to a non-resident supplier with no category is flagged. A ZAR company has no WHT. The agent is personally liable for tax it fails to withhold (s.165), so a missing category on a Lesotho service supplier should be at least a warn.

**#499: posting and the RSL report**

- *Posting:* neither ledger has native WHT, and both communities use a WHT payable liability account. Because of ADR 0001, **the ledger must carry the WHT against the bill or the bill reads part-paid** (B4). The three options are listed in B4. The WHT payable account is picked like a Default account (ADR 0011). A missing account fails a blocking Check.
- *Report:* RSL's monthly WHT schedule wants, per payee: nature of services, legal name, payment date, gross amount and tax deducted, for a chosen month and year. It's uploaded as Excel on RSL's interim e-filing. The annual s.164 statement wants each payee's name and address, amounts paid or payable and tax withheld, within 28 days of 31 March. Get the template's exact columns from RSL or a customer.
- *Deadlines:* resident-contractor WHT is due within 15 days after the month ends. Non-resident WHT is due immediately after withholding (reg. 25). So "per period" is monthly for s.157, and per payment for s.107 and s.108.
- *Paying RSL:* by bank, M-Pesa or RSL's hall, with the payment made alongside the schedule and proof sent to receipts@rsl.org.ls. Nothing in the sources gives a machine-to-machine filing API (*not found in a primary source*). Filing is a person's job, and DocuBite can prepare the file.

**#500: the SAP route**

- Products: unknown for LEC. ECC ends mainstream maintenance in 2027. S/4HANA Cloud and Business One have Nango providers. ECC and on-premise S/4HANA have none.
- Routes: S/4HANA Cloud uses `API_SUPPLIERINVOICE_PROCESS_SRV` with header WHT and `API_BUSINESS_PARTNER` supplier WHT (both verified), attachments through the attachment service (partly verified), and SAP_COM_0057 (unverified). B1 uses Service Layer `PurchaseInvoices` and `Attachments2` (verified). ECC uses BAPI or IDoc (unverified).
- IT must enable: for S/4HANA Cloud, a communication arrangement and user. For on-premise S/4HANA, Gateway activation plus internet exposure. For B1, an exposed Service Layer. For ECC, RFC or middleware.
- Testable without a customer: nothing end-to-end was verified. SAP trial tenants are unverified.
- WHT fit: SAP's *type + code + supplier exemption dates* matches the model in the #498 answer above (A4).

**#501: supplier statements**

- A statement's lines must be matched against invoices, Credit notes and Credit allocations, **Payment records (net)**, and **WHT withheld with its RSL certificate status**. The current matcher only knows documents and gross totals (Part C).
- WHT is a standing reconciling item until the supplier has the RSL certificate (inferred).

## 2. Decision tickets or changes the findings imply

1. **Amend ADR 0001, or record that it holds, for WHT.** Decide how the ledger comes to carry the WHT so that a bill paid net reads Paid. This belongs in #499, but it blocks #498's "it is **Paid**, not part-paid".
2. **Glossary terms** (`CONTEXT.md`): *WHT category*, *WHT exemption certificate* (with expiry), *Tax withheld* (on the Payment record), *Advice of tax withheld* as distinct from *RSL WHT certificate*, *WHT payable account*, and *Withholding agent* (the company). Also avoid calling DocuBite's own document "the certificate", given s.181(c) and RSL's own certificate.
3. **Decide the resident-services scope:** does DocuBite offer WHT only for s.157 contractors, as the Act text reads, or for all resident services, as RSL's web page reads? This needs the 2025 ruling or an accountant (see open questions).
4. **Decide the threshold proxy:** per supplier per month, per Purchase Order, or never automatic (a person ticks it).
5. **Payer accounts and rails:** non-resident WHT is due *immediately*, so a rail's Paid on a non-resident Payment line creates an RSL obligation the same day. That's a Check or reminder, not just a monthly report.
6. **#501 matcher change:** add Payment records, Credit notes and allocations, and WHT as candidates; read the entry's direction; match payments on the net amount.
7. **ZAR companies:** hide WHT entirely (Company currency or country decides, ADR 0013).

## 3. What argues against the larger-company segment

- **The only evidence is one job advert**, read on an aggregator. It shows a team whose *system of record is SAP*: invoices are captured "under the SAP system" and paid by "automatic payments in SAP or EFT". DocuBite's Bill Pay and approval would compete with SAP's own processes, not fill a gap. Its capture and checks would sit *in front of* SAP, which needs a connector that doesn't exist for the likely product (ECC or on-premise S/4HANA, inferred).
- **Each SAP install is a project.** There's no Nango provider for ECC or on-premise S/4HANA, and on-premise access needs the customer's IT to expose Gateway, RFC or Service Layer. There's no test path without a customer. The advert's reporting line ("Reports to: Accounts Payable Accountant") suggests a team of several people, a buyer (finance or IT, state-owned) with procurement rules DocuBite hasn't met (inferred).
- **WHT doesn't need the segment.** Any Lesotho company that pays a builder, transporter, plant-hire firm or SA consultant is a withholding agent. The owner's decision to build WHT stands on the SME base alone, so WHT isn't evidence for larger companies.
- **What would disprove the segment:** LEC, or two or three similar Lesotho organisations (for example WASCO or LHDA; not researched), saying they wouldn't move capture or approvals out of SAP, or that their IT won't expose an API. Also, finding that they already use an SAP add-on or scanning product for AP capture (not researched).

## 4. Open questions only the owner or a customer can answer

1. **The June 2025 RSL Withholding Tax Public Ruling:** can the owner get a copy from RSL or a customer? It may change the scope, rates or process described here.
2. **Resident services:** does RSL expect WHT on resident *non-contractor* services such as accountants, IT and consultants? The Act I found says contractors only. RSL's web page says services generally. A Lesotho accountant (or LEC's AP team) should confirm what they actually withhold.
3. **The "contract" for the M3,000 threshold:** how do customers apply it? Per supplier, per purchase order, per month? Do they withhold on every payment once a supplier has crossed it?
4. **RSL's WHT schedule template:** its exact columns (TIN? nature-of-service codes?). A customer who files can share one.
5. **Exemption certificates:** how do customers verify them? Can RSL's e-TCC portal confirm one, and should DocuBite ask for the certificate file?
6. **Partial payments:** how do customers split VAT out when a payment covers part of an invoice? Does a Credit allocation reduce the WHT base?
7. **Foreign-currency invoices** (a ZAR invoice to an LSL company): at what rate is WHT converted, and does the supplier receive ZAR net of an LSL-computed WHT?
8. **LEC:** which SAP product and release? Would their AP team use DocuBite *before* SAP, and would their IT expose an API?
9. **Ledger posting of WHT (B4):** is the owner willing for DocuBite to post a WHT credit (option 2) or a bill line (option 1)? Or should ADR 0001's "never push payments" also cover WHT?
10. **Month-end close:** does the owner want "every statement reconciled" as a close checklist item, or just a report?
