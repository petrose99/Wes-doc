# Chaperone's bank connection, and Nedbank's own payment API

Ticket: [#427](https://github.com/petrose99/Wes-doc/issues/427), a research child of map [#421](https://github.com/petrose99/Wes-doc/issues/421) ("Payment execution: Chaperone (Lesotho) rail behind a pay-supplier seam"). It blocks [#425](https://github.com/petrose99/Wes-doc/issues/425).

**The question as retargeted by the owner (2026-09-23).** The builder of DSS Pay Connect told the owner "there is one for Nedbank". The owner reads this as **Chaperone's own API for paying other banks, with Nedbank as one bank already connected**. Nedbank's own developer API is not the question. The main question is therefore: can Chaperone pay a **bank account** at Nedbank Lesotho, Standard Lesotho Bank, FNB Lesotho or Lesotho PostBank, through an API DocuBite could call? §5 keeps what was found about Nedbank's own API, briefly.

This file builds on two earlier findings and does not repeat them:

- [#422](https://github.com/petrose99/Wes-doc/issues/422), `docs/research/chaperone-api-supplier-payouts.md` on branch `research/chaperone-api`. It covers the Chaperone API: auth, the wallet disbursement, status, money and the sandbox.
- [#408](https://github.com/petrose99/Wes-doc/issues/408), `docs/research/408-za-ls-payout-rails.md` on branch `research/408-za-ls-payout-rails`. It covers SARB Directives 1 and 2, the PASA System Operator threshold and the CBL rules.

Read on 2026-09-23. Each claim is marked **confirmed** (read on a primary source), **inferred** (reasoned from confirmed facts or seen only in secondary sources) or **unknown, ask Chaperone / ask Nedbank** (not published anywhere reachable).

## Verdict

**Can Chaperone pay a Lesotho bank account through an API? Unconfirmed, and there is no evidence that it can.**

- **The published spec says no.** The only spec Chaperone publishes is `cpayments.json` v1.1. The Swagger UI's `urls` list names only that one document. Its one payout call, `wallet-topup-advance`, reaches C-Pay, M-Pesa, EcoCash, MyWallet and Khetsi, and nothing else. There is no bank code, account number or branch field anywhere in it. (confirmed)
- **No public source says otherwise.** No press release, blog post, product page or third-party integration mentions a Chaperone payout to a bank account, and none mentions a Chaperone–Nedbank link. Chaperone's own developer page lists three APIs: payment processing, bill payment and VAS. "Bank transfers" appears only as a way to **accept** money. (confirmed absent)
- **The closest real thing is a bank's wallet, not a bank account.** `khetsi` is **Lesotho PostBank's** mobile wallet. Chaperone can already pay it, but a Khetsi wallet is not a PostBank account. Nedbank Lesotho's own wallet, **MobiMoney**, is not in Chaperone's operator list. (confirmed)
- **There is a plausible mechanism, but only by inference.** Since 2021, LeSwitch (Lesotho's national switch, whose participants include Nedbank Lesotho) has carried instant payments between banks and mobile money. The disbursement status model in Chaperone's spec (`PaymentSwitchResponseModel`: `issuertrxref`, `acquirertrxref`, `walletdestination`) looks like a switch response. If Chaperone is a LeSwitch participant, a wallet-to-bank credit is technically possible. No source names Chaperone as a participant, and no source describes a Chaperone bank payout. (inferred)

**Lesotho at launch: no.** Chaperone is not a bank-account rail for Lesotho Payees at launch. The only exception would be if Chaperone confirms in writing, before #425 is decided, a bank payout that passes the four-part test in its sandbox. Nedbank's own API is not a Lesotho rail either (§5). A Payee with only a bank account stays unpayable through DocuBite at launch. That is the owner's accepted "no offline fallback" trade-off.

## Sources

| # | Source | What it is |
|---|---|---|
| C1 | <https://cpay-uat-env.chaperone.co.ls:5100/chaperone/api/v1.1/cpayments.json> | Chaperone's API reference: OpenAPI 3.0.1, v1.1, 38 paths. Its sha256 is `668101d0…11c6a2f8`, **the same bytes #422 read**, so the spec has not changed since. |
| C2 | <https://cpay-uat-env.chaperone.co.ls:5100/api/index.html> | The Swagger UI. Its `configObject.urls` lists exactly one document, `/chaperone/api/v1.1/cpayments.json` ("Chaperone Payments API"). |
| C3 | <https://chaperone.co.ls/developers/>, `/payment-gateway/`, `/about-us/`, `/how-is-mobile-money-transforming-lives-in-lesotho/` (13 Oct 2025) | Chaperone's marketing and blog. |
| C4 | GitHub code search for `cpay-uat-env`, `wallet-topup-advance`, `cpaypayments` and `chaperone.co.ls` | Third-party integrations. The two real ones are `molefigog/Musik` `app/Services/CpayService.php` and `KNkoe/lesbeats-app` `lib/services/payment.dart`. They call only payment, confirm, getchecksum, transaction-status and wallet-topup-advance. Neither has a bank method. |
| L1 | [Standard Lesotho Bank: LeSwitch press release](https://www.standardlesothobank.co.ls/lesotho/personal/About-us/press-releases/press-release-lesotho-national-payment-switch-leswitch) | The CBL "in collaboration with the banking sector … and other payments service providers". Fast-payments pilot Oct 2022, official launch 20 Mar 2024. Domestic only. Chaperone is not named. |
| L2 | [Public Eye, "LeSwitch expands to POS transactions" (5 Aug 2025)](https://publiceyenews.com/2025/08/05/leswitch-expands-to-pos-transactions-2/) | "In 2021, LeSwitch introduced instant payments between banks and mobile money platforms, enabling seamless transactions between services such as Mpesa and Khetsi." Secondary: press. |
| L3 | [PayLogic: LeSwitch goes live (7 Jan 2025)](https://pay-logic.com/leswitch-lesothos-interoperable-national-payment-switch-goes-live/) | The switch vendor's announcement. It names no participants. |
| L4 | [Lesotho PostBank: Digital banking](https://www.lpb.co.ls/digital-banking/); PostBank's Khetsi launch post | "KHETSI is a Lesotho PostBank wallet that can be used on any mobile network." |
| L5 | [Nedbank Lesotho: banking](https://www.nedbank.co.ls/personal/bank.html) | Nedbank MobiMoney, a cellphone-number wallet. |
| N1 | <https://apim.nedbank.co.za/static/docs/payments-token> … `payments-submissionstatus`, `payments-auth`, `payments-postman`, `payments-testcases` | Nedbank API Marketplace, Payments API step-by-step docs. |
| N2 | <https://apim.nedbank.co.za/node/1897> | The "Nedbank Payment Initiation API 3.1.11" product page: endpoints, and a plan that is "Free", 100 calls an hour. |
| N3 | `…/themes/NedbankAPIM/images/payments_postman.json`; `…/attachments/EFT API test cases for Sandbox and QA.pdf` | Nedbank's Postman collection and sandbox test cases. |
| N4 | [apim.nedbank.africa: Instant EFT](https://apim.nedbank.africa/find-the-right-api/instant-eft-api.html) | Returns HTTP 403 to automated fetches. Its search-engine snippet reads "available in South Africa, Namibia, Lesotho and eSwatini". **Not read on the page.** |

**Not searched, on purpose.** Other ports, spec versions (v1.0, v2) and unlinked paths on Chaperone's UAT host were not probed. That would be enumerating a third party's servers, not reading what it publishes. Anything unpublished has to come from Chaperone. #422 already read the API Hub bundle (its S2) and found no bank route.

**Not found.** "DSS Pay Connect" has no public footprint: web searches for it return nothing relevant. What exactly the builder meant can only come from them.

## 1. What exists

| Fact | Status | Source |
|---|---|---|
| Chaperone publishes one API spec, v1.1 (38 paths: Airtime, Disbursements, Electricity, Insurance, Internal, PayBills, Payments, System, ValueAddedServices). The Swagger UI offers no other spec. | confirmed | C1, C2 |
| No endpoint, parameter or schema in it mentions a bank, EFT, account number (except bill accounts, below), branch, SWIFT or any named bank. | confirmed (absent) | C1 |
| `PayBills` has `bills/validate` and `bills/pay` taking `accountNumber` + `productId`. These pay a **biller** account (utility, insurer) chosen from a product catalogue (`paybills/products?category=`). They are not a way to pay an arbitrary bank account. | confirmed (shape); inferred (billers only). Whether any product in the catalogue is a bank credit is **unknown, ask Chaperone** (the catalogue needs credentials). | C1 |
| `wallet-topup-advance` operators: null/`CPAY`, `mpesa`, `ecocash`, `mywallet`, `khetsi`. There is no bank operator and no "Nedbank" or "MobiMoney" code. | confirmed | C1 |
| `khetsi` is Lesotho PostBank's wallet. `mywallet` is "My Wallet Lesotho" (SmartelMoney, a fintech, not a bank). | confirmed (Khetsi, from PostBank); inferred (MyWallet, from its Play Store listing) | L4 |
| Chaperone's developer page lists a Payment Processing API, a Bill Payment API and a VAS Payment API. There is no payout or bank API. | confirmed | C3 |
| Chaperone's milestones: "integrating with national payment systems" (2022), a cross-border payments licence (2024), "full certification for the BankServ Africa (PayInc) TCIB SADC remittances platform" (2025). There is no bank-payout product. | confirmed (self-reported) | C3 about-us |
| The press says LeSwitch has carried bank ↔ mobile-money instant payments since 2021, naming M-Pesa and Khetsi. Its bank participants are FNB Lesotho, Lesotho PostBank, Nedbank Lesotho and Standard Lesotho Bank. | confirmed (SLB release for the switch); secondary for the bank ↔ wallet detail | L1, L2 |
| Whether Chaperone/C-Pay is a LeSwitch participant | **unknown, ask Chaperone.** No source names it. | L1–L3 |
| A Chaperone or Nedbank press release announcing a bank link or partnership between them | not found | web search |
| Live or pilot | Not applicable: no bank-payout product is published. | — |

## 2. Payment initiation to a bank account

There is none in the published API. The following are **unknown, ask Chaperone**: whether a private or roadmap endpoint exists; which banks it would reach (Nedbank, SLB, FNB, PostBank); whether it goes over LeSwitch (instant) or the Lesotho ACH/EFT clearing (next day); and whether it is single or bulk. #422 already confirmed there is no bulk API, and Bulk Pay pays C-Pay numbers only.

## 3. Consent and auth

For a hypothetical bank payout: **unknown, ask Chaperone**. The inference is that it would use the same per-merchant `{apiKey, clientCode, secret}` and HMAC checksum as every other Chaperone call (#422 §1). No per-payment approval step exists at Chaperone for API disbursements: the merchant's key authorises the debit from its prefunded balance. Bulk Pay's portal is different, with an operator and an authoriser. This fits the map's rule that DocuBite's Owner approval is the gate.

## 4. The four-part rail test

| Step | Chaperone to a bank account | Chaperone to a wallet (for comparison, #422) |
|---|---|---|
| Submit | fails: no endpoint | passes, one line per call |
| Reference returned straight away | not applicable | passes (`cPayTransactionId`, `ACCEPTED`) |
| Status (webhook or poll) | not applicable | passes (unsigned callback plus poll) |
| Settlement confirmation | not applicable | partial: `SUCCESS`/`PROCESSED`, but `REVERSED` exists |

**Destination fields** a bank payout would need: bank or institution code, branch code (Lesotho banks use one), account number, account holder name, and possibly account type. None is in the spec. That list is inferred from DocuBite's Payee model and #406's EFT file, not from Chaperone.

## 5. Nedbank's own Payment API (secondary: not the question, recorded once)

**It is a consumer pay-by-bank ("Instant EFT") product, South Africa only in its docs, and it is not a supplier-payout rail.**

| Fact | Status | Source |
|---|---|---|
| Product: the **Nedbank Payments API** / "Nedbank Payment Initiation API 3.1.11" on the **API Marketplace** (`apim.nedbank.co.za`, an IBM API Connect portal). It follows the UK Open Banking v3.1 PISP shape: `/open-banking/v3.1/pisp/domestic-payment-consents` → `/domestic-payments`. The product lists file, scheduled, standing-order and international endpoints, but the step-by-step docs cover **domestic single payments only**. | confirmed | N1, N2 |
| Flow: a light token (client credentials) → create a consent (`CreditorAccount`, amount, reference ≤ 30 characters, `x-idempotency-key`) → redirect the **payer** to Nedbank (`SCARedirectURL`) to log in with Nedbank ID or approve in-app ("ApproveIt") → an auth code → a heavy token → submit → `DomesticPaymentId`. **Every payment needs the payer's own interactive approval at Nedbank.** A consent is single-use (`INTENT_HAS_BEEN_USED_BEFORE`). | confirmed | N1 `payments-intent`, `payments-auth`, `payments-tokenheavy`, `payments-submission` |
| Purpose: "Instant EFT". The sample `PaymentContextCode` is `EcommerceMerchantInitiatedPayment` and the `PaymentPurposeCode` is `EPAY`. It is positioned as "a secure alternative to … screen scraping" for e-commerce. The creditor is the merchant, and the payer is the shopper. | confirmed | N1, [Payments API overview](https://apim.nedbank.co.za/static/payment) |
| Currency: every sample is `ZAR`, and every sandbox limit is in rand (R20,000 payment limit, R996.28 balance). No LSL appears. | confirmed | N1, N3 |
| Status: `GET /domestic-payments/{id}` returns `AcceptedSettlementCompleted` and similar. It is pull only: no webhook is documented. | confirmed (pull); confirmed absent (webhook) | N1 `payments-submissionstatus` |
| Sandbox: `api.nedbank.co.za/apimarket/sandbox/…` with test Nedbank ID users and a Postman collection. The plan is "Free", 100 calls an hour. Production needs a subscription approved by Nedbank. Refunds need a client certificate issued by the API Marketplace team. | confirmed | N2, N3, N1 `payments-initiate-refund` |
| Lesotho availability: only the 403-blocked `apim.nedbank.africa` snippet claims "Lesotho". Nothing in the docs supports it (ZAR, ZA addresses). | **unknown, ask Nedbank** | N4 |
| Four-part test, as a supplier rail: submit passes but needs the Owner at Nedbank for **each** line; a reference comes back straight away; status is poll only; settlement status exists. It fails the map's model, because DocuBite's Owner approval cannot be what calls pay-supplier. | inferred | above |
| Regulation (ZA): initiating payments from a customer's account for many clients is #408's System Operator case (PASA authorisation above 10,000 transactions or R10m a month), and possibly the draft SARB "payment initiation" activity. Nedbank's own onboarding terms for third parties are not published. | inferred from #408; **ask Nedbank** | #408 §2 |

Nedbank's Business Transactions API (reconciliation) and Account Verification Services API also exist on the Marketplace. Neither pays anyone. A corporate host-to-host route (ISO 20022 `pain.001`) is #408's host-to-host case, and the batch-file model is out of scope on #421.

## 6. Regulation

- **Through Chaperone (Lesotho):** unchanged from the map. Chaperone is the payer of record and holds the CBL licence; DocuBite only instructs it. A bank payout through Chaperone would change nothing here. (settled at charting)
- **Nedbank's own API in ZA:** see §5, last row. It is not relevant to Lesotho at launch.

## 7. Sandbox and onboarding

- **Chaperone:** the sandbox is self-service (#422). A bank destination cannot be tested in it, because none exists in the spec.
- **Nedbank:** covered in §5.

## Questions for Chaperone (add to #423)

1. **Bank payouts.** Can the API pay a **bank account** at Nedbank Lesotho, Standard Lesotho Bank, FNB Lesotho or Lesotho PostBank? If yes: the endpoint, the spec version, the destination fields, and whether it is live or a pilot. If no: is it on a roadmap, with a date?
2. **"The one for Nedbank".** A practitioner (the builder of DSS Pay Connect) said Chaperone has a connection for Nedbank. What is it: a bank-account credit, Nedbank MobiMoney as a wallet operator, a funding (collection) link, or a settlement account?
3. **LeSwitch.** Is Chaperone/C-Pay a LeSwitch participant? Does a C-Pay → bank-account credit go over LeSwitch (instant) or over EFT clearing? What is the cut-off and settlement time?
4. **Status and finality for a bank credit.** Is there the same `cPayTransactionId`, callback and poll? Which state means the bank credited the account, and what happens on a returned credit (a wrong account)?
5. **Name check.** Can Chaperone verify an account-holder name before paying a bank account, as `user-verification` does for C-Pay?
6. **KYC.** Does a bank payout need `recipientKyc` (a personal ID), and can a **business** account be paid?
7. **Fees and limits** for a bank payout, per line and per day.
8. **Credentials.** Would a bank payout use the same merchant API key, client code and secret, or a separate "route" subscription on the API Hub?
9. **PayBills catalogue.** Is any `paybills/products` item a bank account credit? Or are all of them billers?

## Questions for Nedbank (only if a ZA rail is revisited)

1. Is the Payments API (PISP) live for **Nedbank Lesotho** accounts in LSL, as `apim.nedbank.africa` suggests, or only for Nedbank South Africa?
2. Can a **business** payer approve a batch of payments once (a file or bulk consent), instead of once per payment? Are `file-payment-consents` live?
3. What registration does Nedbank require of a third party calling PISP for many clients: a PASA System Operator, a TPPP, or a Nedbank agreement only?
4. Is there a webhook for payment status, or only polling?
5. What is the commercial model beyond the "Free" 100-calls-an-hour plan?

## What this means for #425 and the seam

- **Keep the Payee destination typed** (bank account or wallet). At launch only the **wallet** variant routes through Chaperone. A bank-account Payee in a Lesotho workspace is unpayable until question 1 above comes back yes. The screen must say so; it must not fail silently.
- **Do not wire a bank route speculatively.** The map's rule stands: a rail that can't show all four parts in a sandbox is not wired.
- **If Chaperone says yes**, a bank payout is a second destination type on the **same** Chaperone adapter and credentials, not a second rail. The seam needs no change beyond the typed destination.
- **Nedbank's PISP** needs a per-payment approval by the payer at the bank. That is incompatible with "the Owner's approval in DocuBite calls pay-supplier", so it does not belong behind the pay-supplier seam as it stands.
