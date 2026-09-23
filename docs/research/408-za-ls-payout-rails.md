# Live payout rails in South Africa & Lesotho — facts for a future "payment route"

Ticket: [#408](https://github.com/petrose99/Wes-doc/issues/408), a research child of map [#406](https://github.com/petrose99/Wes-doc/issues/406) "Paying suppliers safely". This document is facts only, taken from primary sources where they could be reached (vendor developer docs, SARB directives in the Government Gazette, PASA registers, the Lesotho Payment Systems Bill, and Central Bank of Lesotho pages). Search-engine summaries and secondary pages are marked as such. It is **not** a recommendation to build. On map #406, live payouts are out of scope: DocuBite moves no money, and the payment "routing layer" has one route, a bank file the customer uploads.

Every claim is marked **confirmed** (read on the primary source), **inferred** (reasoned from confirmed facts, or taken from a secondary source), or **not found**.

## Question

For a future effort, what would it take for DocuBite to execute supplier payments itself in ZA and LS? The options are Stitch payouts, Peach Payments payouts, PayShap (through which banks or PSPs), M-Pesa Lesotho B2C, EcoCash Lesotho, bank host-to-host, and the SADC TCIB instant scheme. For each: API availability, licensing or sponsor-bank requirement (who holds the funds, and whether DocuBite would be a TPPP under SARB/PASA rules or need a licence under CBL rules in Lesotho), onboarding for a small SaaS, pricing shape, and whether it returns real-time status. Then: what does this mean for the shape of the payment-route seam?

## Summary / Answer

**Stitch and Peach are the only rails a small SaaS could realistically call soon, and both work in South Africa only.** Both have documented payout APIs with per-line status webhooks. Both are prefunded: the payer's money must first sit in a float held by the PSP. Both PSPs are themselves PASA-registered TPPPs sponsored by several banks. If DocuBite held one pooled float and paid suppliers on its customers' behalf, it would be a *payer service provider* under SARB Directive 1 of 2007. That means a sponsoring bank, PASA registration and agency agreements. If instead each customer holds its own Stitch or Peach account, and DocuBite only sends that customer's instructions with that customer's credentials, DocuBite never "accepts money". That keeps it out of TPPP scope. However, it processes payment instructions for two or more persons, which is the textbook **System Operator** under Directive 2 of 2007. PASA says System Operator authorisation applies above 10,000 transactions or R10 million a month.

**PayShap is not something DocuBite can reach directly.** It is a bank-participant rail. A business reaches it through its bank's channels, or through a PSP that routes to it (Stitch lists RPP, the PayShap rail, as one of its rails).

**Lesotho has no payout API DocuBite could use without the customer's own licensed provider account.** M-Pesa Lesotho exposes B2C on Vodafone's M-Pesa OpenAPI (market `vodacomLES`), but only to a KYC'd M-Pesa business account. EcoCash Lesotho publishes no API at all, only a shop-counter bulk-payment product. The Payment Systems Bill 2025 requires anyone providing payment services in Lesotho to hold a CBL licence and to be a Lesotho-incorporated company.

**Host-to-host is an enterprise, per-customer bank integration.** It uses ISO 20022 `pain.001` out and `pain.002` status back, over SFTP and similar transports. It is a transport for the bank-file route, not a new kind of route.

**TCIB is live in the CMA only for FNB/RMB-to-FNB/RMB payments, inside FNB's own channels.** It is a scheme for banks and authorised non-banks, not an API a SaaS calls.

**What this means for the seam:** the "payment route" should be a per-Payment-line executor chosen per payer account, with the following properties:

- **Execution:** it is asynchronous and returns per-line outcomes.
- **Idempotency:** it is keyed by the Payment line's stable identity, which becomes the PSP's nonce or conversation ID.
- **Settlement sources:** outcomes are recorded from several sources (statement match, results file, webhook, manual), with the source kept.
- **Destinations:** the destination is polymorphic (bank account or mobile wallet).
- **Credentials:** credentials belong to the workspace and are never pooled.
- **Outcomes can be revised:** a Paid line can later be reversed or returned.
- **Pre-flight step:** routes may add funding and balance checks that the file route does not need.

Section 5 gives the detail.

---

## 1. Rail by rail

### 1.1 Stitch payouts (ZA)

| Aspect | Finding | Status | Source |
|---|---|---|---|
| API | GraphQL at `https://api.stitch.money/graphql`. Disbursement is a mutation with amount, destination account, `nonce` and beneficiary reference. It needs a client token with the `client_disbursement` scope. | confirmed | [Stitch Docs — Disbursements](https://docs.stitch.money/payment-products/payouts/disbursements) |
| Country | "Disbursements are currently only available to South African customers." | confirmed | same |
| Funds | "A float account is required." Stitch also offers a "Stitch Float Facility" for payouts that exceed the balance. | confirmed | same; [stitch.money/payouts](https://stitch.money/payouts) |
| Rails / speed | `INSTANT` ("may incur additional costs") or `DEFAULT` (same-day, rolls to the next business day after cut-off). The marketing page names SDV, RTC and RPP (RPP is the PayShap rail) with "automatic fallbacks", 24/7/365. The docs note that "not all beneficiary banks support RTC". | confirmed | [Disbursements](https://docs.stitch.money/payment-products/payouts/disbursements); [Payouts overview](https://docs.stitch.money/payment-products/payouts/introduction); [stitch.money/payouts](https://stitch.money/payouts) |
| Idempotency | "If a request is made with the same `nonce`, it will be rejected with an error." | confirmed | Disbursements |
| Status | States: `DisbursementPending` → `Submitted` → `Completed`, or `Error` / `Paused` / `Cancelled` / `Reversed`. A webhook fires on each transition after Pending. | confirmed | Disbursements |
| Account verification | "Verification of the recipient's bank account is **not** done as part of this request." A separate BAVS product exists. | confirmed | Disbursements; stitch.money/payouts |
| Licensing | Stitch Money (Pty) Ltd is on the PASA TPPP register (July 2026), sponsored by Absa, Capitec, FirstRand, GoTyme, Investec, Nedbank and Standard Bank. It is also on the PASA System Operator list. | confirmed | [PASA TPPP list Jul 2026](https://authorisation.pasa.org.za/wp-content/uploads/2026/07/Public-list-TPPP-July-2026.pdf); [PASA SO list Jul 2026](https://authorisation.pasa.org.za/wp-content/uploads/2026/07/Public-list-SO-July-2026.pdf) |
| Onboarding | Commercial onboarding goes through Stitch sales and support ("contact support@stitch.money"). No self-serve sign-up for disbursements was found. | inferred | Disbursements |
| Pricing | Not published for disbursements. The only public figures (R2 standard, R10 instant per payout) are for *Stitch Express* merchant settlements to the merchant's own bank, a different product. | not found (for disbursements) | [Stitch Express help](https://help-express.stitch.money/en/articles/8182293-what-processing-fees-do-i-pay), secondary for this purpose |

### 1.2 Peach Payments payouts (ZA)

| Aspect | Finding | Status | Source |
|---|---|---|---|
| API | REST at `https://payouts.peachpayments.com` (sandbox: `sandbox-payouts.…`). Create payout (one call can carry an array of recipients), query payout, balance, and bank-account verification. There is also a CSV upload in the dashboard. | confirmed | [Peach Payouts API](https://developer.peachpayments.com/docs/payouts-api-1); [Peach Payouts product page](https://www.peachpayments.com/products/payouts/) |
| Country | South Africa only ("23+" SA banks listed). | confirmed | [Payouts (developer)](https://developer.peachpayments.com/docs/peach-payouts) |
| Funds | Prepaid float. You deposit by RTC or EFT against a unique reference, and deposits are processed every two hours. The float can be prefunded "using your settlements account". Before any payout, "you should send Peach Payments a source of funds document". | confirmed | [Payouts (developer)](https://developer.peachpayments.com/docs/peach-payouts); product page |
| Speed / limits | "Instant payouts at any time of the day". RTC processing limits are R5M daytime (Mon–Fri 00:01–16:00) and R250K overnight and weekends. Bank verification runs 03:00–23:00 only. Real-time clearance payouts launched on 19 Aug 2025, with funds "within 90 seconds". | confirmed | same; [Peach RTC announcement](https://www.peachpayments.com/scale/peach-payments-announces-real-time-clearance-payouts/) |
| Status | Webhooks: Processing, Successful, Failed. Retries for 30 days with exponential backoff. Optional IP allowlist on payout creation. | confirmed | [Payouts API](https://developer.peachpayments.com/docs/payouts-api-1) |
| Idempotency | No idempotency key or nonce is described on the overview page. | not found | Payouts API overview |
| Licensing | Peach Payment Services (Pty) Ltd is on the PASA TPPP register, sponsored by Absa, Capitec, GoTyme, Investec and Nedbank. | confirmed | PASA TPPP list Jul 2026 |
| Onboarding | Credentials (client ID, secret, merchant ID) come from the Peach Dashboard, so the customer needs a Peach merchant account. Payouts appear as a feature of the Growth and Enterprise plans. | confirmed / inferred | Payouts API; [Peach fees](https://www.peachpayments.com/fees/) |
| Pricing | R3.20 ex VAT per EFT payout, no monthly fee, failed payouts charged. This comes from a search snippet of a login-gated support article. The RTC payouts are "roughly half the previous fee". The public fees page does not list a payout fee. | inferred (not read on the page) | [Peach support article](https://support.peachpayments.com/support/solutions/articles/47001191093-peach-payouts-example-scenario-how-it-works) (login-gated); RTC announcement |

### 1.3 PayShap (ZA)

| Aspect | Finding | Status | Source |
|---|---|---|---|
| What it is | A real-time interbank rail operated by BankservAfrica (now PayInc) with PASA and BASA. It is 24/7 and pays by account number or ShapID proxy. | confirmed (secondary) | [PayInc — Wikipedia](https://en.wikipedia.org/wiki/PayInc); payinc.co.za returned HTTP 403 |
| Participants | Absa, African Bank, Al Baraka, Capitec, Discovery, FNB, HBZ, Investec, Nedbank, OM Bank, Standard Bank, TymeBank. | inferred (search synthesis, not a PayInc page) | [Netcash PayShap](https://netcash.co.za/blog/accelerate-your-business-with-payshap-embracing-instant-payments-and-cost-efficiency/) |
| Limit | Raised from R3,000 to R50,000 in October 2024. Each bank may set a lower limit. | confirmed (secondary) | [Electrum](https://blog.electrum.co.za/what-increased-payshap-limits-mean-for-established-rails); [TechCentral](https://techcentral.co.za/payshap-payment-limit-raised-to-r50-000/254663/) |
| API for a SaaS | No public PayShap API exists for non-participants. Businesses reach it through their bank's channels (e.g. Standard Bank "PayShap Request for Corporates"), or through a PSP: Stitch routes over RPP, and Netcash offers PayShap creditor batches by file upload. | confirmed (Stitch, Standard Bank, Netcash pages); "no direct API" is inferred | [Standard Bank PayShap Request for Corporates](https://corporateandinvestment.standardbank.com/cib/global/who-we-are/about-us/news/standard-bank-pioneers-realtime-payment-requests-for-businesses-with-launch-of-payshap-request-for-corporates); [Netcash creditor payments](https://netcash.co.za/blog/how-businesses-can-use-payshap-for-payroll-creditor-payments/) |
| Licensing | The PASA TPPP register has a "Rapid Payments" activity column, so a non-bank touching PayShap on behalf of others registers through a sponsor bank. | confirmed (column exists); applicability inferred | PASA TPPP list Jul 2026 |
| Pricing | Set per bank, roughly R1–R50 by amount band. | inferred (secondary) | Netcash creditor payments |

### 1.4 M-Pesa Lesotho B2C

| Aspect | Finding | Status | Source |
|---|---|---|---|
| API | Vodafone M-Pesa OpenAPI. Market context `vodacomLES`, currency LSL. B2C is `POST /{sandbox\|openapi}/ipg/v2/vodacomLES/b2cPayment/` with an RSA-encrypted session key. There is a transaction status query, and async mode with a callback. | inferred (third-party SDK docs; the portal did not render) | [go-vodacom-sdk](https://pkg.go.dev/github.com/abubakar508/go-vodacom-sdk/mpesa); [openapiportal.m-pesa.com](https://openapiportal.m-pesa.com/) |
| Destination | An M-Pesa wallet (MSISDN), not a bank account. | confirmed (B2C definition) | same |
| Onboarding | The organisation needs an M-Pesa Business account (apply at Vodacom), full KYC and a signed Services Agreement, then sign-up on the Open API portal, sandbox testing, and a Vodafone review before going live. | confirmed | [M-Pesa business onboarding — Lesotho](https://business.m-pesa.com/vodacom-lesotho/business-onboarding-lesotho/); [M-Pesa developers](https://business.m-pesa.com/developers/) |
| Who holds funds | The business's own M-Pesa business account, issued by VCL Financial Services (Pty) Ltd, a CBL-licensed mobile money issuer. | confirmed (issuer licence); the account model is inferred | [CBL — mobile money issuers](https://centralbank.org.ls/other-financial-institutions-2/wpbdp_category/mobile-money-issuers-in-lesotho/) |
| Pricing | No B2C tariff is published. | not found | — |

### 1.5 EcoCash Lesotho

| Aspect | Finding | Status | Source |
|---|---|---|---|
| Product | "Any organization … can make bulk transfers of money to recipients using the EcoCash platform". Recipients are mobile numbers. You apply at an Econet shop or by calling 100. | confirmed | [ETL — EcoCash for Business](https://www.etl.co.ls/ecocash-business) |
| API | None published for Lesotho. The EcoCash developer portal that exists is Zimbabwe's. | not found (LS) | same; [developers.ecocash.co.zw](https://developers.ecocash.co.zw/) |
| Issuer | Sasai Econet Financial Services (Pty) Ltd, a CBL-licensed mobile money issuer. | confirmed | CBL mobile money issuers |
| Pricing / status | Not published. | not found | — |

### 1.6 Bank host-to-host (ZA; LS partial)

| Aspect | Finding | Status | Source |
|---|---|---|---|
| Standard Bank | "An automated, two-way data transfer service … direct, system-to-system integration between your ERP system and the bank". It supports SWIFT MX/MT and proprietary formats over Direct Secure Plus, SFTP, AS2 or EBICS, with "automated transactional status feedback reports" and unpaid reports. It covers 19 African markets through a South African hub; Lesotho is not named. | confirmed | [Standard Bank Host to Host](https://businessonline.standardbank.com/bolafrica/businessonline/products-and-services/channel-services/host-to-host-corporate-swift) |
| FNB | Publishes an ISO 20022 layout for "Organisational clients doing Bulk Domestic EFT Payments": `pain.001.001.03` in, `pain.002.001.03` status report back. | confirmed | [FNB Payments ISO File Layout (SA, Nov 2020)](https://www.online.fnb.co.za/rhelp_0_15/OBE_SA_Downloads/Downloads/Payments/Payment_ISO_File_Format_SA.pdf) |
| Absa | Absa Access host-to-host carries payments and collections files from the customer's ERP, with statements, notifications and account-holder verification. | inferred (search synthesis of Absa CIB pages) | [Absa CIB digital channels](https://cib.absa.africa/corporate-banking/digital-channels/) |
| Investec (bank API variant) | Programmable Banking: `POST /za/pb/v1/accounts/{id}/paymultiple`, up to 50 payments per call. OAuth client credentials are created by the *main account holder*. The beneficiary must already exist and "You must have made a payment to the beneficiary via Investec Online before making a payment … via the API." Available to private and private-business clients. | confirmed (developer portal); endpoint path inferred (Postman snippet) | [Investec developer — individuals](https://developer.investec.com/individuals); [Postman — Beneficiary Payment](https://www.postman.com/investec-open-api/programmable-banking/request/26868804-66e7b38a-86f7-49b2-9977-4b0ea2c696a6) |
| Who holds funds | The customer's own bank account. No float is involved. | inferred | — |
| Onboarding | Per customer and per bank: corporate channel agreements, connectivity set-up and certificates. Aimed at ERP-scale clients, not SMEs. | inferred | pages above |
| Pricing | Negotiated. | not found | — |

### 1.7 SADC TCIB

| Aspect | Finding | Status | Source |
|---|---|---|---|
| What it is | Low-value credit transfers "cleared on an immediate basis", settled on a deferred basis. It covers "all SADC currencies as well as the USD". | confirmed | [SADC Banking Association — Introduction to TCIB](https://sadcbanking.org/what-we-do/introduction-to-tcib/) |
| Participation | Banks and non-banks may participate. "Non-banks need a partner settlement bank", and participants must "advise your regulator of your intent to join". Onboarding contact is TCIBonboarding@bankservafrica.com. | confirmed | same |
| LS status | FNB (6 Nov 2024) was the first bank live in the CMA. Its customers in Lesotho, Eswatini, Namibia and South Africa can send to "other FNB and RMB clients' bank account" through FNB Global Payments (app or online). Other banks were "working on joining". | confirmed (trade press quoting FNB) | [IT-Online, FNB TCIB](https://it-online.co.za/2024/11/06/fast-inexpensive-cross-border-payments-with-fnbs-tcib/) |
| API for a SaaS | None. It is a scheme you join as a participant, not an API. | inferred | — |
| Live participant list | No current official list was reachable (the World Bank FASTT page returned HTTP 403 and the PayInc site returned HTTP 403). | not found | [World Bank FASTT — TCIB](https://fastpayments.worldbank.org/node/374) |

---

## 2. South Africa: when would DocuBite need registration?

**SARB Directive 1 of 2007 (Payments to Third Persons)** covers anyone who "accepts money or the proceeds of payment instructions, as a regular feature of that person's business, from a payer to make payment on behalf of that payer to multiple beneficiaries". That is a *payer service provider*, and the directive's own example is "the payment of salaries on behalf of employers to employees". Such a person must be appointed as agent of each payer, keep records for five years, and "inform its banker … who, in turn, must inform the payment system management body". **Status: confirmed.** Source: [SARB Directive 1 of 2007, GG 30261](https://authorisation.pasa.org.za/wp-content/uploads/2024/07/SARB-Directive-1-of-2007-Third-Party-Payments-Providers.pdf).

**PASA's reading of Directive 1:** you must register if your "regular business is to … pay multiple parties for a payer". Registration goes through a sponsoring bank, takes 21 working days, and PASA charges no fee. **Status: confirmed.** Source: [PASA TPPP registration](https://authorisation.pasa.org.za/so-and-tppp/tppp-registration/).

**SARB Directive 2 of 2007 (System Operators)** governs "services it provides to any two or more persons in respect of payment instructions, including the delivery to and/or receipt of payment instructions from a bank". The persons served explicitly include "clients of banks". A system operator must only act on the instructions of the account holder "and not pay such funds from or transfer such funds to its own account". Persons processing instructions "on their own behalf" are not system operators. **Status: confirmed.** Source: [SARB Directive 2 of 2007](https://authorisation.pasa.org.za/wp-content/uploads/2024/07/SARB-Directive-2-of-2007-for-System-Operators.pdf).

**PASA's threshold for System Operators:** authorisation applies if you "process payment instructions for two or more clients" and exceed 10,000 transactions a month or R10 million a month. **Status: confirmed.** Source: [PASA SO and TPPP](https://authorisation.pasa.org.za/).

**What this means for DocuBite (inferred; not legal advice):**

| Model | DocuBite's position |
|---|---|
| Today: DocuBite generates a file and the customer uploads it | DocuBite delivers no instruction to a bank, so it is neither a TPPP nor a SO. |
| Each workspace connects its **own** Stitch/Peach account or bank API, and DocuBite calls with that workspace's credentials | DocuBite accepts no money, so it is not a TPPP. It does deliver payment instructions for 2+ clients, so it is **System Operator** territory once above PASA's volume threshold. |
| DocuBite holds **one pooled float** at a PSP and pays suppliers for all customers | DocuBite is a **payer service provider (TPPP)**. It needs a sponsoring bank, PASA registration and agency agreements with every customer, and possibly SO authorisation too. |

**Regime in flux.** SARB published a draft activity-based "Directive in respect of specific payment activities" on 3 March 2025, with revised drafts in November 2025 (comments were due 5 Dec 2025). It names third-party payments, payment initiation, e-money, acquiring, scheme operation and remittance as authorised activities. The NPS Bill was not yet tabled as of Sept 2025. **Status:** confirmed (dates); whether the final text keeps or replaces Directives 1 and 2 was not found. Sources: [Bowmans](https://bowmanslaw.com/insights/the-south-african-reserve-bank-has-recently-published-a-draft-activity-based-authorisation-framework-for-participants-banks-and-non-banks-in-the-national-payment-system/); [ENS — Draft Directive](https://www.ensafrica.com/news/detail/10384/new-rules-for-payment-providers-what-you-need); [ENS — November draft](https://www.ensafrica.com/news/detail/11080/sarbs-november-draft-authorisation-framework-); [ENS — NPS Bill](https://www.ensafrica.com/news/detail/10690/when-will-south-africas-nps-bill-come-into-fo). A future effort must re-check this. "Payment initiation" as a named activity could capture model (2).

## 3. Lesotho: CBL rules

**Payment Systems Bill 2025** (National Assembly amendments, 30 July 2025):

- **§6(1):** "A person shall not provide payment services or operate the payment systems unless he is in possession of a license issued by the Central Bank."
- **§6(4):** no licence is granted "unless he is an incorporated company under the laws of Lesotho". Banks are exempt.
- **Definition:** "payment services" means "services enabling … execution of money transfers and payment transactions, and any other service that Central Bank may prescribe".
- **§40:** unlicensed provision is an offence, with imprisonment applying to directors of a legal person.

**Status: confirmed** (Bill text). Whether it has been enacted and gazetted was **not found**. Source: [Payment Systems Bill 2025](https://nationalassembly.parliament.ls/wp-content/uploads/2026/05/PAYMENT-SYSTEMS-BILL-National-Assemly-Amendments-30July-2025.pdf).

**In force today:** the Payment Systems Act 2014 and the Payment Systems (Issuers of Electronic Payment Instruments) Regulations 2017. **Status: confirmed** (named by CBL). Source: [CBL — Payment Systems](https://centralbank.org.ls/payment-systems-2/).

**Licensed mobile money issuers:** Chaperone Ltd, Lesotho PostBank, Smartel Money Ltd, VCL Financial Services (M-Pesa) and Sasai Econet Financial Services (EcoCash). **Status: confirmed.** Source: [CBL register](https://centralbank.org.ls/other-financial-institutions-2/wpbdp_category/mobile-money-issuers-in-lesotho/).

**LeSwitch** (the national interoperable switch) and a planned fintech regulatory sandbox, listed as an "immediate priority", are both named in CBL's FSDS II 2025–2030. **Status: confirmed.** Source: [FSDS II](https://centralbank.org.ls/wp-content/uploads/2025-2030-Financial-Sector-Development-Strategic-Plan-II-LR-Singles-17-November-2025.pdf).

**What this means (inferred):** DocuBite could not hold a Lesotho payment-services licence without a Lesotho company. The only Lesotho payout path is the customer's own M-Pesa business account (or a bank H2H channel) driven with the customer's credentials. Whether a technical integrator doing that is "providing payment services" is not addressed in the Bill. That question goes to Lesotho counsel or the CBL sandbox.

## 4. Comparison

| Rail | Callable API for DocuBite | Who holds funds | DocuBite licensing exposure | Small-SaaS onboarding | Pricing shape | Real-time status |
|---|---|---|---|---|---|---|
| Stitch payouts | Yes (GraphQL) | Stitch float (Stitch is a TPPP) | SO (per-workspace accounts) or TPPP (pooled float) | Sales-led; ZA only | Per payout; instant costs more; not published | Webhooks per state, incl. Reversed |
| Peach payouts | Yes (REST + CSV) | Peach float (Peach is a TPPP) | same | Merchant account + source-of-funds document; ZA only | ~R3.20/payout (unverified); RTC cheaper | Webhooks: Processing / Successful / Failed |
| PayShap | No, only through a bank or PSP | Payer's bank account | via the PSP or bank used | n/a | Per-bank fee bands | Seconds, but only visible through the PSP or bank |
| M-Pesa LS B2C | Yes (OpenAPI, `vodacomLES`) | Customer's M-Pesa business account | CBL question (see §3) | Vodacom KYC + agreement + review; customer-owned | not found | Sync or async callback + status query |
| EcoCash LS | No | Customer's EcoCash account | — | Shop counter | not found | not found |
| Host-to-host | File/SFTP (per bank); Investec REST | Customer's bank account | SO | Enterprise, per bank | Negotiated | `pain.002` / status reports, batch cadence |
| TCIB | No (scheme) | Participant banks | Participant rules | n/a | "lower-cost" (FNB), not quantified | < 60 s clearing, within FNB channels |

## 5. What this means for the "payment route" seam

Today the seam has one route: DocuBite builds a bank file (`lib/payments/za-eft-csv.ts`, per-bank generators to come), a person uploads it and confirms **Sent**, and each Payment line becomes **Paid** or **Failed** from a matched statement line, the bank's results file, or manual mark-paid. The facts above suggest the following, so that a payout route can be added later without rework. These are inferences from the evidence, not decisions.

1. **Route per payer account, credentials per workspace.** Every legally light model (§2 model 2, §3) needs the *customer's own* PSP, wallet or bank account and credentials. The route should hang off the Payer account (a bank-file account today; a Stitch/Peach/M-Pesa connection later), stored as sealed workspace secrets. It should never be a DocuBite-level account. A pooled DocuBite float is the one design that turns DocuBite into a TPPP.
2. **The Payment line's stable identity is the idempotency key.** Stitch rejects a repeated `nonce`. M-Pesa carries a third-party conversation ID. The map's "stable identity so nothing is paid twice" should be the value every route passes outward, and the file route should carry it in the line reference too.
3. **Outcomes are per line, asynchronous, and tagged by source.** Stitch and Peach report per payout through webhooks, `pain.002` reports per transaction, and the file route settles from statement match, results file or manual. One settlement entry point should take `(lineId, outcome, source, externalRef, at)`, with source one of statement / results-file / webhook / manual. It should not be a batch-level status.
4. **Outcomes can be revised.** Stitch has `DisbursementReversed`, and bank results files carry later unpaids. Paid should be able to move to Failed or Reversed through a recorded event, and the Payment record (ADR 0001) should be reversible with a reason, as it already is for manual removal.
5. **"Sent" is route-specific.** For the file route, Sent is a person confirming the upload. For an API route, Sent is the PSP accepting the instruction (Stitch `Submitted`, Peach `Processing`). The batch lifecycle holds if Sent means "handed to the rail". The route decides who asserts it.
6. **Routes may have a pre-flight the file route lacks.** API routes need a funded float and a balance check (Peach has a balance endpoint), and sometimes a first-payment rule (Investec requires one online payment to a beneficiary before API payments). Leave a hook for route-specific readiness problems next to the existing `fileProblems` ("Fix bank details").
7. **Payee destinations are not always bank accounts.** M-Pesa and EcoCash pay an MSISDN. If LS payouts are ever wanted, the Payee destination should be typed (bank account | mobile wallet), and the **Bank details change** hold should cover any payout destination, not only bank fields.
8. **Route eligibility depends on country and currency.** Stitch and Peach are ZA/ZAR only; M-Pesa `vodacomLES` is LSL; TCIB is cross-border. A route should declare the (country, currency, destination type) it accepts, so an LS payer account never offers a ZA-only route.
9. **Host-to-host is a transport for the file route.** It is `pain.001` out and `pain.002` back. If results-file intake on this map parses a per-line status report, a later H2H delivery reuses it unchanged.

## Not found / open for a future effort

- Stitch disbursement pricing; M-Pesa LS B2C tariff; any EcoCash LS API or tariff; negotiated H2H pricing.
- Whether Peach payouts accept an idempotency key.
- The current official TCIB and PayShap participant lists (PayInc and World Bank pages returned HTTP 403).
- Whether Lesotho's Payment Systems Bill 2025 has been enacted, and whether a technical integrator driving a customer's own M-Pesa account needs a CBL licence.
- Whether SARB's final payment-activities directive treats "payment initiation" by software acting on a customer's own PSP account as an authorised activity. This decides whether §2 model 2 needs authorisation below PASA's SO threshold.
