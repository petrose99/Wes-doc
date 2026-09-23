# Chaperone API Hub for supplier payouts: what it can do today

Ticket: [#422](https://github.com/petrose99/Wes-doc/issues/422), a research child of map [#421](https://github.com/petrose99/Wes-doc/issues/421), "Payment execution: Chaperone (Lesotho) rail behind a pay-supplier seam". Earlier context: [#408](https://github.com/petrose99/Wes-doc/issues/408), findings on branch `research/408-za-ls-payout-rails`.

This file records facts only, read on 2026-09-23. Every claim is marked:

- **confirmed:** read on a primary source.
- **inferred:** reasoned from confirmed facts, or seen only in third-party code.
- **unknown, ask Chaperone:** not published anywhere reachable. These go to [#423](https://github.com/petrose99/Wes-doc/issues/423).

## Sources

| # | Source | What it is |
|---|---|---|
| S1 | <https://chaperone.co.ls/developers/> | Marketing page. Every "View Documentation" button links to S2. |
| S2 | <https://cpay-uat-env.chaperone.co.ls/chaperone-apihub/> | The API Hub, a React app for sign-up, login, API keys and "routes" (API subscriptions). Read from its JS bundle `static/js/main.a0fba31a.chunk.js`. |
| S3 | <https://cpay-uat-env.chaperone.co.ls:5100/chaperone/api/v1.1/cpayments.json> | **The API reference.** OpenAPI 3.0.1, "Chaperone Payments Api" v1.1, 147,625 bytes, sha256 `668101d0…c6a2f8`. It is rendered at `…:5100/api/index.html` (Swagger) and `…:5100/api/redoc/index.html`. Its only `servers` entry is `https://cpay-uat-env.chaperone.co.ls:5100`, labelled "Sandbox/UAT". |
| S4 | `static/media/API test cases.xlsx` in the S2 bundle | Chaperone's own API Hub test script, dated 2023-06-04. It covers sign-up, login, API subscriptions, checksum, payment, airtime and insurance. |
| S5 | <https://chaperone.co.ls/wp-content/uploads/2025/09/BulkPay-Application-Form.pdf> | The C-Pay Bulk Payment application form, agreement, SOP and tariff schedule. The agreement text is © 2022; the file was uploaded in 2025-09. |
| S6 | <https://chaperone.co.ls/payment-gateway/>, `/mobile-money/`, `/bespoke-solutions/`, `/developer-hub/`, `/about-us/`, `/licensing-and-regulation-disclouse/` | Marketing copy. |
| S7 | <https://centralbank.org.ls/other-financial-institutions-2/chaperone-ltd/> | The Central Bank of Lesotho (CBL) directory entry for Chaperone. |
| S8 | `https://cpay.co.ls/` → `/cyclos` | The C-Pay web app. Its meta tag reads "Runs on Cyclos 4.16.14". |
| S9 | GitHub `molefigog/Musik` `app/Services/CpayService.php`; Packagist `lotesm/c-pay` (README credits Chaperone's Moeketsi Titisi) | Third-party integrations. They show real calls, but they are not Chaperone documentation. |

**Registries searched with no official SDK found:** npm (`chaperone cpay`, `c-pay lesotho`), PyPI (`cpay`, `chaperone`, `chaperone-cpay`, `cpay-lesotho`; the `chaperone` package there is unrelated), Packagist (`cpay`, `chaperone`), and GitHub (repos and code). No GitHub organisation or Postman collection was found. The only package tied to Chaperone is `lotesm/c-pay`, a PHP **card-acceptance** plugin. The marketing claims "SDKs", "OAuth 2.0" and "real-time webhooks" (S1, S6); S3 shows none of these.

## Summary

**Chaperone publishes a real, machine-readable API (S3), but it is an acceptance and value-added-services API with one wallet-disbursement endpoint. It is not a supplier-payout API.**

- **Wallets only, no banks:** the only payout call is `POST /api/disbursements/wallet-topup-advance`. It credits a **C-Pay wallet**, or sends "cross-wallet" to **M-Pesa, EcoCash, MyWallet or Khetsi**. No endpoint pays a **bank account**.
- **No bulk API:** "C-Pay Bulk Pay" is a **web portal** with a file upload and an authoriser's approval (S5).
- **Auth and idempotency:** each call carries an API key and an HMAC-SHA256 checksum keyed by a per-client secret. The merchant supplies `extTransactionId`, which must be "unique". Neither source says what Chaperone does with a duplicate.
- **Status:** a status pull API exists, and a per-request `redirectUrl` receives callbacks. The callback is unsigned, its payload is undocumented, and it is "retried several times". `REVERSED` is part of the status vocabulary.
- **Money:** LSL only, from a prefunded e-money balance. The balance is topped up by EFT or cash deposit into Chaperone's trust account at Standard Lesotho Bank. Credit takes 3–48 h depending on the sending bank, in working hours only.
- **Sandbox:** a UAT sandbox exists, with self-service sign-up. **No production base URL is published anywhere.**

**Against the map's four-part rail test (submit, a reference returned straight away, status report, confirmed settlement), the documented API passes only for wallet destinations and only one line at a time. It fails for bank accounts.** Whether Chaperone can pay Lesotho bank accounts through an undocumented route, a bulk API or a partner (its 2025 TCIB certification suggests it is connected to BankservAfrica) has to be asked.

---

## 1. Authentication

| Fact | Status | Source |
|---|---|---|
| Two security schemes, either accepted on every operation: `ApiKey` (the "C-Pay Client API key", sent **raw** in `Authorization: {apikey}`, with no `Bearer` prefix) and `bearer` (a JWT, "to run C-Pay Functions/RPCs"). | confirmed | S3 `components.securitySchemes`, top-level `security` |
| Each money-moving request also carries a `checksum`: `HMACSHA256(salt, secret)`, hex. For initiation, salt = `ExtTransactionalId + ClientCode + Amount + MSISDN`. For OTP confirmation, salt = the same + `OTP`. "Secret will be provided along with the API Key." | confirmed | S2 docs page; S3 `/api/cpaypayments/payment` requestBody |
| The same salt formula is used for `wallet-topup-advance`. | inferred (third-party code only) | S9 `CpayService::walletTopupAdvance` |
| Credentials per client: **API key, client code and secret.** An API client is registered on the Hub with `clientName`, `contactPerson`, **`merchantNumber`**, `clientEmail` and `clientPassword`. One API client therefore belongs to **one merchant number**. | confirmed (register payload in the Hub bundle) | S2 `auth/register`, `client/create` |
| APIs are enabled per client as "routes" or "collections" that the client subscribes to (`client/add-route`, `client/my-routes`). The test script subscribes to "CPayPayments & PayBills". Disbursements are not mentioned. | confirmed; whether Disbursements is self-serve is unknown | S2, S4 sheet 3 |
| Rotation: the FAQ says to use the profile section to "Revoke or regenerate keys". Nothing covers rotating the **secret**, running two keys at once, or key expiry. | confirmed (keys); unknown (secret, overlap) | S2 FAQ |
| **Acting for many merchants.** No OAuth, no delegated or "platform" credential and no sub-merchant model is documented. Each workspace's own Chaperone merchant registers its own API client, and DocuBite stores that workspace's `{apiKey, clientCode, secret}` sealed. This fits the "each workspace has its own Chaperone account" decision. Whether one DocuBite integrator credential could act for many merchants is **not documented**. | inferred / unknown | S2, S3 |
| The "OAuth 2.0" on the marketing page is not in the API: S3 has no OAuth flow. | confirmed (absent) | S1 vs S3 |

## 2. Submit: single payout and C-Pay bulk

### 2.1 Single payout (the only API route)

`POST /api/disbursements/wallet-topup-advance` (tag *Disbursements*), confirmed in S3:

- **Query parameters:** `destinationOperator` and `destinationWalletNumber`. A null operator or `"CPAY"` means a top-up of a C-Pay wallet. Otherwise it is a "cross-wallet transfer to external mobile money providers (mpesa, ecocash, mywallet, khetsi)".
- **Body:** a `transactionRequest` nested **twice** (`{"transactionRequest":{"transactionRequest":{…}}}`) with these fields:
  - `extTransactionId`
  - `clientCode`
  - `msisdn`
  - `amount` (a string with 2 decimals)
  - `shortDescription` (20 characters; "will reflect in the respective accounts")
  - `checksum`
  - `currency` (`LSL`)
  - `redirectUrl`
  - `additionalData.recipientKyc` (`idDocument[] {idType, idNumber, expiryDate, issuerCountry}`, `firstName`, `middleName`, `lastName`, `fullName`, `gender`, `sourceOfFunds`)
- **KYC:** "For new users without C-Pay accounts, KYC verification with Home Affairs is performed using customerKYC. Existing users are validated against registered details."
- **Synchronous response (200):** `{statusCode:"0000", description:"Success", ExtTransactionId, cPayTransactionId, paymentRequestStatus:"ACCEPTED", additionalData:{voucherCode}}`. That is **one Chaperone reference per call**, and this is what the map calls "Sent".
- **Errors:** 400 (validation, KYC failed or "user details mismatch"), 401, 403, 404 ("Client code not found"), **424** ("external service unavailable"), 500, 503. All share the `Response` shape `{statusCode, description, extTransactionId, cPayTransactionId, paymentRequestStatus, additionalData, reasonCode}`.

Open points on this endpoint:

- **Idempotency:** `extTransactionId` is "Unique transaction identifier provided by the merchant" and "must be unique per request". This is stated for insurance and the other payment operations (confirmed). Nothing says what a **resubmitted** `extTransactionId` gets back: an error, the original result, or a second payment. **Unknown, ask Chaperone.** That answer decides whether the Line reference (`DB` + 8) is a true idempotency key or only a correlation ID. S3 states no length or charset limit; the examples are about 25 characters, so 10 should fit (inferred).
- **What `msisdn` means for a cross-wallet transfer:** it may be the recipient or a C-Pay intermediary, with `destinationWalletNumber` as the external wallet. **Unknown.** In the S3 example the `msisdn` sits with the recipient's KYC, so it reads as the recipient (inferred).
- **What `recipientKyc` requires for a supplier:** an ID document number for every new recipient (confirmed). DocuBite's Payee model holds no national ID. Could a **business** supplier be paid at all through this call? The KYC is personal: names, gender, a Home Affairs check. **Unknown, ask Chaperone.**

### 2.2 C-Pay bulk ("Bulk Pay")

- Bulk Pay is a **portal product, not an API.** The Bulk Payer signs an agreement and names a Focal Person, a Key Authoriser and a Key Operator. The flow: the operator uploads a "bulk payment file" to the "Bulk Pay Web-Portal", the authoriser approves and releases funds "to the recipients' cellphones", and a "processed file can be downloaded … for reconciliation". **Confirmed** (S5 Annexure 1).
- Under the 2022 agreement, bulk transfers go "to registered C-Pay numbers" (§4.1). Wallets only; no banks. **Confirmed** (S5). The 2025 marketing mentions "Bulk transfers" and a "Bulk Payment Solution" with "API integration" (S6), but S3 has **no bulk-submit endpoint**. "Bulk" in S3 means only paginated list queries (`page`, `pageSize` 40).
- The following are **unknown, ask Chaperone**: the file format, line and amount limits, whether a bulk API exists privately, and whether it takes a client reference per line.

## 3. Status

| Fact | Status | Source |
|---|---|---|
| **Pull:** `GET /api/cpaypayments/transaction-status?requestReference={extTransactionId}&dateTime=YYYY-MM-DD` returns the `Response` shape with `paymentRequestStatus`. The lookup key is **our** reference, which suits a Line reference. | confirmed (documented under *Payments*) | S3 |
| Whether `transaction-status` also covers **disbursements** | unknown, ask Chaperone | — |
| **Disbursement inquiry:** `GET /api/disbursements/payment-inquiry?destinationWalletNumber&destinationOperator&dateTime` returns `PaymentSwitchResponseModel[]`: `state`, `issuertrxref`, `acquirertrxref`, `walletdestination`, `receivercustomerdata`, `error`, `errorDescription`, `rejectMessage`, `createtime`/`updatetime`. It is keyed by **destination and date**, not by our reference. The field names suggest a national wallet switch. | confirmed (shape); inferred (switch) | S3 |
| Other lookups: `GET /api/cpaypayments/transaction?merchantCode&transactionNo` and `GET …/payment/request/transactions` (filter by status, date and amount range; paged with `X-Total-Count` and `X-Has-Next-Page` headers). | confirmed | S3 |
| **Push:** set `redirectUrl` per request. It "must be publicly accessible … and return a 2XX status". "In the event that the platform did not receive a successful status, redirect notifications will be retried several times, beyond which, the transaction status will have to be queried through the API." | confirmed | S3 `/paymentrequest/async/transactions`, *Payments* tag |
| No callback signature, signing secret, source-IP list or payload schema is documented. The adapter must treat a callback as a *hint* and re-pull the status before recording Paid. | confirmed (absent); inferred (design consequence) | S3 |
| The retry count, back-off and total window | unknown, ask Chaperone | — |
| **Vocabulary:** `SUCCESS`, `FAILED`, `PROCESSED`, `DENIED`, `CANCELED`, `EXPIRED`, `REVERSED` ("final status (e.g., …)"). The list-filter enum is `canceled, denied, expired, open, processed, scheduled`. The disbursement sync status is `ACCEPTED`. Casing varies between examples (`processed`, `ACCEPTED`). These are Cyclos payment-request statuses (S8). | confirmed | S3 |
| **Finality:** `REVERSED` exists, so `PROCESSED` or `SUCCESS` is not documented as final. The seam must allow Paid → Reversed, as #408 already advised. When a reversal can happen, and whether it is reported by push, is unknown. | confirmed (vocabulary); unknown (window) | S3 |
| Which of `SUCCESS` and `PROCESSED` means money has reached the destination wallet for a cross-wallet transfer, and whether there is an intermediate state such as "sent to M-Pesa, pending" | unknown, ask Chaperone | — |

## 4. Destinations

| Fact | Status | Source |
|---|---|---|
| Payable through the API: **C-Pay wallet** (operator null or `CPAY`), **`mpesa`** (Vodacom Lesotho), **`ecocash`** (Econet Telecom Lesotho), **`mywallet`**, **`khetsi`**. | confirmed (operator codes) | S3 |
| Which institutions run "MyWallet" and "Khetsi" | not identified from primary sources | — |
| **Banks:** no bank-account destination, bank code, account number field or bank list anywhere in S3. The payment-gateway page lists "bank transfers" as a way to **accept** payments (marketing). The About page says Chaperone "received full certification for the BankServ Africa (PayInc) TCIB SADC remittances platform" (2025) and was "integrating with national payment systems" (2022). | confirmed (absent from the API); marketing only for anything else | S3, S6 |
| **Format:** MSISDN, "international format (e.g., +26650123456) or just local format (60123456)". | confirmed | S3 `Request.msisdn` |
| **Payee name check, C-Pay wallets:** `GET /api/disbursements/user-verification?phoneNumber=` returns `{idNumber, names, gender, isActive, addresses}`. Top-ups to existing users are "validated against registered details" and a mismatch returns 400. | confirmed | S3 |
| **Payee name check, external wallets:** `PaymentSwitchResponseModel.receivercustomerdata` (first and second names, ID) comes back on the *inquiry*, after payment. Whether a **pre-payment** name lookup exists for M-Pesa, EcoCash, MyWallet or Khetsi numbers | unknown, ask Chaperone | S3 |
| **Privacy:** `user-verification` returns a person's national ID number and addresses to any caller with a key. Keep it out of logs and screens (CODING_STANDARDS: sealed or minimal PII). | confirmed (response shape); inferred (handling) | S3 |

## 5. Money

| Fact | Status | Source |
|---|---|---|
| **Source of funds:** a prefunded **e-money balance**. "The Bulk Payer will deposit cash or transfer funds via EFT into a designated Chaperone trust account." Once cleared, Chaperone credits the client's C-Pay account; payouts debit that balance. No direct debit from a linked bank account is described. | confirmed for Bulk Pay; inferred for API disbursements | S5 §4.2, Annexure 1 |
| **Trust account:** Standard Lesotho Bank, current account 9080007454070, branch City 060 667, SWIFT SBICLSMX. Reference: client code and client name. | confirmed | S5 p.5 |
| **Top-up turnaround** (working hours): Standard Bank EFT or cash 3 h; FNB EFT 24 h; Nedbank EFT 48 h; Post Bank EFT 48 h. Operating hours Mon–Fri 08:00–16:30, Sat 08:30–12:00. | confirmed | S5 p.5 |
| **Currency:** LSL only. "Currently working with single currency and not validated (default: Lesotho Maloti)". No ZAR. The agreement defines "Real money" as the loti. | confirmed | S3 `Request.currency`; S5 §1.20 |
| **Fees, Bulk Pay (2022 schedule):** "Charges to bulk payer per recipient: ZERO; charges to recipient for deposit: ZERO"; the standard customer fees apply to the recipient's later use. Chaperone may vary tariffs with one month's notice. | confirmed (dated) | S5 Schedule 1, §8 |
| **Fees, API:** the FAQ says "API requests are zero-rated, i.e. there's no fee charged to use them". Per-disbursement and cross-wallet fees (C-Pay → M-Pesa, EcoCash and so on) are not published. | confirmed (API use); unknown (per payout) | S2 FAQ |
| **Limits:** "Each transaction shall be subject to the maximum financial limit as determined by the Central Bank of Lesotho", plus daily and monthly limits (§14.1.5). The figures are not in these sources. | confirmed (existence); unknown (values) | S5 §4.4 |
| **Balance pre-flight:** only `GET /api/internal/inventory/organizationbalance` exists, tagged *Internal* (Chaperone's own balance). No merchant-balance endpoint is documented. | confirmed (absent) | S3 |
| **Settlement time** for a C-Pay → wallet payout, and cut-offs (the S5 hours cover deposit crediting, not payouts) | unknown, ask Chaperone | — |
| **Licensing:** CBL lists Chaperone Ltd under **"Mobile Money Issuers"** (MD Mohau Mochebelele). Chaperone's own disclosure: licensed "as a technological company and issuer of electronic payment instruments" under the Payment Systems Act. Its About page adds a digital-payments licence (2019) and a cross-border payments licence (2024). | confirmed (CBL listing; own disclosure); the last two are self-reported | S7, S6 |

## 6. Sandbox

| Fact | Status | Source |
|---|---|---|
| **A sandbox exists:** `https://cpay-uat-env.chaperone.co.ls:5100`, labelled "Sandbox/UAT". It has a valid Let's Encrypt certificate (expires 2026-11-11), and `GET /api/health` answered `Healthy` on 2026-09-23. | confirmed | S3, probe |
| **Access is self-service:** sign up on the API Hub (S2), and an email with credentials follows (S4 sheet 1). Log in, copy the API key from *My Profile → API parameters*, subscribe to API collections, then use Swagger "Authorize". Sign-up asks for a merchant number, so an existing C-Pay merchant account may be needed first (inferred). | confirmed (flow) | S2, S4 |
| `POST /api/cpaypayments/getchecksum` computes checksums "only for testing purposes". | confirmed | S3 |
| **Test destinations:** none published. In Chaperone's own test script, the OTP "will be send to provided phone number", so the UAT may reach real handsets and networks. | confirmed (script text); unknown (magic numbers, whether cross-wallet is simulated) | S4 sheet 4 |
| **Production base URL:** not published. S3 lists only UAT. Both third-party integrations call the UAT host, and one of them disables TLS verification. | confirmed (absent) | S3, S9 |
| Whether the Disbursements collection can be subscribed in UAT without Chaperone enabling it | unknown, ask Chaperone | — |

---

## Open items

| # | Item | Status |
|---|---|---|
| 1 | Credential: API key + client code + HMAC secret, per API client, tied to one merchant number | confirmed |
| 2 | One DocuBite platform credential acting for many merchants | unknown, ask Chaperone (not documented; assume per-workspace credentials) |
| 3 | Rotating the key and the secret, with overlap and expiry | key: confirmed (regenerate/revoke); secret and overlap: unknown, ask Chaperone |
| 4 | Single payout endpoint (`wallet-topup-advance`) | confirmed |
| 5 | Bank-account destinations | unknown, ask Chaperone (absent from the API) |
| 6 | Bulk submit by API | unknown, ask Chaperone (the portal file upload is confirmed; no API) |
| 7 | `extTransactionId` duplicate behaviour (true idempotency) | unknown, ask Chaperone |
| 8 | Reference returned synchronously, per line (`cPayTransactionId` with `ACCEPTED`) | confirmed |
| 9 | Status pull by our reference (`transaction-status`) | confirmed for payments; its coverage of disbursements is unknown, ask Chaperone |
| 10 | Push via `redirectUrl`, retried | confirmed |
| 11 | Callback signing and payload schema | unknown, ask Chaperone (none documented) |
| 12 | Status vocabulary, including `REVERSED` | confirmed |
| 13 | Meaning of final vs `REVERSED`, and the reversal window | unknown, ask Chaperone |
| 14 | Wallet networks: C-Pay, M-Pesa, EcoCash, MyWallet, Khetsi | confirmed |
| 15 | Destination format: MSISDN (+266 or 8-digit local) | confirmed |
| 16 | Payee name check, C-Pay wallets | confirmed (`user-verification`) |
| 17 | Payee name check, other wallets, before payment | unknown, ask Chaperone |
| 18 | Recipient KYC (ID document) needed for new recipients; businesses as payees | ID: confirmed; businesses: unknown, ask Chaperone |
| 19 | Funding: prefunded e-money via the trust-account deposit | confirmed (Bulk Pay); inferred (API) |
| 20 | Currency: LSL only | confirmed |
| 21 | Fees per payout via the API, including cross-wallet | unknown, ask Chaperone (Bulk Pay 2022: zero to payer) |
| 22 | Transaction, daily and monthly limits | unknown, ask Chaperone (CBL-set, values unpublished) |
| 23 | Merchant balance endpoint for a pre-flight check | unknown, ask Chaperone (none documented) |
| 24 | Payout settlement time and cut-offs | unknown, ask Chaperone |
| 25 | Sandbox: exists, self-service | confirmed |
| 26 | Sandbox test numbers and simulated outcomes | unknown, ask Chaperone |
| 27 | Production base URL and go-live process | unknown, ask Chaperone |
| 28 | CBL licence: Mobile Money Issuer | confirmed |

## Questions for Chaperone (for #423)

1. **Banks.** Can the API pay a **Lesotho bank account** (Standard Lesotho Bank, FNB, Nedbank, Post Bank)? If so, give the endpoint, the fields (bank, branch, account number, account name) and the settlement path (EFT via the Lesotho clearing house, RTGS, TCIB?). If not, is it on a roadmap, and when?
2. **Bulk API.** Is there an API for Bulk Pay (a JSON batch or file upload), or only the portal? If an API exists, what are the per-batch line and amount limits, and does each line keep our reference?
3. **Idempotency.** What happens if we resubmit an `extTransactionId` Chaperone has already seen: a rejection with the original result, a plain error, or a second payment? Is uniqueness per client code or global, and for how long? Is a 10-character alphanumeric reference (`DB` + 8) acceptable?
4. **Platform model.** Each of our customers has its own C-Pay merchant account. Must each register its own API Hub client (key, client code, secret)? Or can DocuBite hold one integrator credential that acts for linked merchants? How does a merchant connect to, or revoke, a third-party platform?
5. **Credentials.** Can the checksum **secret** be rotated, and can two keys or secrets be live at once during rotation? Do keys expire?
6. **Disbursement enablement.** Must Chaperone enable the Disbursements "route" per client? What KYC or contract is needed (the Bulk Pay agreement or a different one)?
7. **Recipient KYC.** For `wallet-topup-advance`, when is `recipientKyc` required? Can the recipient be a **business** (registration number instead of a national ID)? For a cross-wallet transfer (M-Pesa, EcoCash, MyWallet, Khetsi), is `msisdn` the recipient's number, and what is `destinationWalletNumber` for?
8. **Name check.** Can we look up the registered name on an M-Pesa, EcoCash, MyWallet or Khetsi number **before** paying, as `user-verification` does for C-Pay?
9. **Status.** Does `GET /api/cpaypayments/transaction-status` cover disbursements? Which status means money has reached the destination wallet? Is there a pending state for cross-wallet transfers? Can a completed payout later become `REVERSED`, within what window, and is the reversal pushed to us?
10. **Callbacks.** What is the exact callback payload? Is it signed (HMAC with the secret?) or IP-restricted? What are the retry count and schedule? Is there one callback per state change, or only a final one?
11. **Funding.** Is an API merchant's balance the same prefunded e-money account as Bulk Pay, funded by deposit to the Standard Lesotho Bank trust account? Is there an endpoint to read the merchant's own balance? What happens to a payout when funds are insufficient: rejected synchronously, or queued?
12. **Fees and limits.** What are the fees per payout (C-Pay wallet, and each cross-wallet network) and who pays them? What are the per-transaction, daily and monthly limits for a business payer? Is the 2022 Bulk Pay schedule ("zero to payer") still current?
13. **Timing.** What are the settlement times and cut-offs for payouts, and do payouts run on weekends?
14. **Sandbox.** Are there test numbers or magic values that simulate success, failure, reversal and timeout for each network? Does the UAT reach real handsets? Can the Disbursements collection be enabled for our UAT client?
15. **Production.** What is the production base URL, and what is the go-live checklist?
16. **Currency.** Is LSL the only currency, and is ZAR planned? (The spec says currency is "not validated".)

## What this means for the seam (for #424 and #425; not a decision)

- **Destination:** a Payee destination must be typed. Only the **wallet** variant is routable through Chaperone today. A Payee with a bank account would be unpayable unless question 1 comes back yes. This is the owner's "no offline fallback" trade-off.
- **Submit:** one call per Payment line. `cPayTransactionId` is the Chaperone reference that marks a line Sent. Until question 3 is answered, the adapter must look a line up (`transaction-status` by Line reference) **before** any retry, rather than rely on server-side idempotency.
- **Status:** use the callback only as a trigger, with polling as the source of truth. Build for Paid → Reversed.
- **Credentials:** per workspace, sealed: API key, client code, HMAC secret.
- **Pre-flight:** there is no balance check to call. An insufficient-balance rejection is a normal Failed path.
