# What QuickBooks Online and Xero accept on a bill, by plan

Research for [#447](https://github.com/petrose99/Wes-doc/issues/447) (map [#445](https://github.com/petrose99/Wes-doc/issues/445)): what each ledger accepts on a supplier bill (QBO `Bill`, Xero `Invoice` with `Type: ACCPAY`), plan by plan, in five areas: line dimensions, tax on a line, item lines versus account lines, attachments, and vendor credits. Companies are in Lesotho (LSL) and South Africa (ZAR). Facts only, researched 2026-09-25.

**Labels** (as in [ledger-bill-account-update.md](ledger-bill-account-update.md)). **Confirmed** means read in this pass on the provider's own page, in the provider's own schema or SDK repo (Intuit's `Finance.xsd` in `intuit/QuickBooks-V3-Java-SDK`, Xero's `xero_accounting.yaml` in `XeroAPI/Xero-OpenAPI`), or in Nango's source. **Unverified** means it comes from a search summary, a community thread or a third-party help centre, or is inferred. Test every unverified item in a sandbox before building on it.

## Summary

- **QuickBooks Online makes the plan the first gate.** Intuit's own SKU-to-API table ([SKU-API Mapping](https://help.developer.intuit.com/s/article/QuickBooks-Online-SKU-API-Mapping)) says:
  - **Simple Start has no Bill, BillPayment or VendorCredit at all.**
  - **Essentials** accepts a Bill with **account lines only**.
  - **Plus** (and Advanced) add **item lines** on a bill, **Inventory** items, **Class** and **Department** (Location).
  - The API refuses a feature the plan lacks with **5030 "Feature Not Supported"**. Intuit's forum shows the text "We're sorry. This feature is not included in your QuickBooks Online Simple Start subscription".
  - An app can read the plan in advance from `CompanyInfo` `NameValue` `OfferingSku` (for example "QuickBooks Online Plus"), and the switches from `Preferences`: `AccountingInfoPrefs.ClassTrackingPerTxnLine`, `TrackDepartments`, `ProductAndServicesPrefs.QuantityOnHand`, `TaxPrefs.UsingSalesTax` and `CurrencyPrefs.MultiCurrencyEnabled`.
- **Xero gates almost nothing by plan for these five areas**, apart from two limits:
  - the **Starter** plan's **5 approved bills a month** (ZA pricing page);
  - **multicurrency**, which is on **Premium** only in ZA.
  - Everything else is the same on every plan: **2 active tracking categories** per organisation and at most **2 `Tracking` elements per line**, `TaxType` per line, `ItemCode` for tracked or untracked items, **10 attachments of up to 10 MB per bill**, and `ACCPAYCREDIT` credit notes allocated through `PUT CreditNotes/{id}/Allocations`.
- **Tax works differently in the two ledgers.** Xero applies the account's default tax unless a line carries a `TaxType`. `LineAmountTypes` defaults to *Exclusive*, so tax is added on top unless the request says `Inclusive`. QBO outside the US needs **`GlobalTaxCalculation`** ("required for non-US companies"). QBO calculates the tax itself from each line's **`TaxCodeRef`**, and an explicit `TxnTaxDetail` overrides it. **Neither of DocuBite's bill mappers sends any tax field today** (see *What DocuBite must handle explicitly*).
- **Currency.** LSL and ZAR are valid currency codes in both ledgers: QBO's schema and supported-currency list, and Xero's `CurrencyCode` enum. A Lesotho company sits on QBO's international edition or Xero's "Global" version. Xero's Global version ships only a **0 % `INPUT`** purchase tax, so the bookkeeper must add a 15 % rate (`TAX001`…).
- **Item lines take the account from the item, not the line.**
  - A QBO `ItemBasedExpenseLineDetail` has **no `AccountRef`**. The account comes from the Item.
  - A Xero tracked item forces the line onto the item's inventory asset account.
  - Either way, "a line's Account" stops being DocuBite's choice, which conflicts with ADR 0011 (see the end of this note).
- **Attachments.** Both ledgers accept a PDF after the bill exists:
  - **QBO**: `POST /upload` (multipart). The whole request is capped at 100 MB. Accepted types are PDF, JPEG, PNG, DOC, XLSX, CSV, TIFF, GIF and XML.
  - **Xero**: `POST Invoices/{id}/Attachments/{filename}` with a raw body. **10 files of 10 MB per document.** It needs the **`accounting.attachments`** scope, which **DocuBite's `XERO_SCOPES` does not request**.
  - **Nango's proxy** carries both kinds of body, but only through `Nango-Proxy-*` headers. DocuBite's `nangoProxy` helper currently forces JSON.
- **Vendor credits.**
  - **QBO**: `VendorCredit` (Essentials and up). The only documented way to apply one to a bill is a `BillPayment` whose `Line[]` links the Bill and the VendorCredit.
  - **Xero**: `ACCPAYCREDIT`. Allocation is a **separate** call after the credit note is AUTHORISED.

## 1. Line dimensions

### QuickBooks Online

| Dimension | API field | Level on a Bill | Plan | Company switch (Preferences) | When unavailable |
|---|---|---|---|---|---|
| **Class** | `Line[].AccountBasedExpenseLineDetail.ClassRef` / `ItemBasedExpenseLineDetail.ClassRef` | **Line** (the Bill has no header `ClassRef`) | **Plus, Advanced** | `AccountingInfoPrefs.ClassTrackingPerTxnLine` ("Enable Class Tracking per transaction line") or `ClassTrackingPerTxn` | The `Class` entity is Plus-only in the SKU table. The API error when `ClassRef` is sent to Essentials, or with class tracking off, is **unverified**. It may be 5030, 2500, or the ref may be **silently ignored**. Test in a sandbox. |
| **Location** (Department) | `DepartmentRef` | **Header only** (inherited from `Transaction`; no line-level field) | **Plus, Advanced** | `AccountingInfoPrefs.TrackDepartments`; the UI label is in `DepartmentTerminology` | Same as Class, unverified |
| **Customer:Job** | `…LineDetail.CustomerRef` | Line | All bill plans (field is "Product: ALL") | none | 2500 "Invalid Reference Id" for an unknown id (generic code) |
| **Billable** | `…LineDetail.BillableStatus` (`Billable`, `NotBillable`, `HasBeenBilled`) and `MarkupInfo` | Line | Plus and up in the ZA plan table ("project management"). `SalesFormsPrefs.BillableExpenseTracking` | `BillableExpenseTracking` | **6310 MissingCustomer** "A customer is required if the transaction is billable". **6320 InvalidBillable** |

- **Confirmed.** Field names and levels come from `Finance.xsd`. `ItemLineDetail` holds `ItemRef`, `ClassRef`, `UnitPrice`, `Qty`, `TaxCodeRef` and more. `AccountBasedExpenseLineDetail` holds `CustomerRef`, `ClassRef`, `AccountRef`, `BillableStatus`, `MarkupInfo`, `TaxAmount`, `TaxCodeRef` and `TaxInclusiveAmt`. The `Transaction` base holds `DepartmentRef`. Source: [Finance.xsd](https://github.com/intuit/QuickBooks-V3-Java-SDK/blob/develop/ipp-v3-java-data/src/main/xsd/Finance.xsd). The Bill reference describes `DepartmentRef` as "the location of the transaction, as defined using location tracking in QuickBooks Online" ([Bill](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/bill)).
- **Confirmed (plan).** In the SKU table, `Class` and `Department` are ticked for Plus only, not for Simple Start or Essentials ([SKU-API Mapping](https://help.developer.intuit.com/s/article/QuickBooks-Online-SKU-API-Mapping)). The ZA plan page lists "Class and location tracking — Up to 40" on Plus and "Unlimited" on Advanced ([QuickBooks ZA pricing](https://quickbooks.intuit.com/za/pricing/)).
- **Confirmed (errors).** 6310 and 6320 are in the [error-code table](https://developer.intuit.com/app/developer/qbo/docs/develop/troubleshooting/error-codes), as is **5030 Feature Not Supported** ("The requested feature isn't supported").

### Xero

| Dimension | API field | Limit | Plan | When unavailable |
|---|---|---|---|---|
| **Tracking categories** | `LineItems[].Tracking[]` with `Name` and `Option` (both required), or `TrackingCategoryID` and `TrackingOptionID` | **"Any LineItem can have a maximum of 2 TrackingCategory elements."** An organisation can have **2 ACTIVE and 4 total** categories. Xero recommends a soft limit of **100 options** per category. | No plan gate found (not listed on the ZA plan comparison) | Error text for an archived or unknown option is **unverified**. Xero returns `ValidationErrors`, and on a 200 response it can return **`Warnings`** (see *Silent removal* below). |

- **Confirmed.** [Invoices](https://developer.xero.com/documentation/api/accounting/invoices): "Any LineItem can have a maximum of 2 TrackingCategory elements". The Tracking element takes Name and Option, both required. [Tracking Categories](https://developer.xero.com/documentation/api/accounting/trackingcategories): "A Xero organisation can have a maximum of two ACTIVE tracking categories and four tracking categories total (ACTIVE and ARCHIVED)", and "We recommend a soft limit of 100 options to a tracking category". The same limit is on [Types](https://developer.xero.com/documentation/api/accounting/types) and in Xero Central ([Set up tracking categories](https://central.xero.com/s/article/Set-up-tracking-categories): "a maximum of four tracking categories in total, but only two can be active at any time").
- **Confirmed.** Tracking is on the line only; the ACCPAY invoice has no header dimension. Tracking is also listed among the fields still editable on a paid ACCPAY (Invoices page).
- **Silent removal. Confirmed as a mechanism.** Xero's OpenAPI gives `Invoice` and `CreditNote` a `Warnings` array ("Displays array of warning messages from the API"). The spec's own example of a warning is "Account code '476' has been removed as it does not match a recognised account", on a manual journal ([xero_accounting.yaml](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml)). Whether Xero strips an unknown tracking option or account code from an **ACCPAY** line the same way is **unverified**, but the response shape allows it. **Read `Warnings` on every 200.**

## 2. Tax on a line

### QuickBooks Online

- **Fields. Confirmed.** Line: `…LineDetail.TaxCodeRef`, plus `TaxAmount` and `TaxInclusiveAmt` on account lines. Header: `GlobalTaxCalculation` (`TaxExcluded`, `TaxInclusive`, `NotApplicable`), "**Not applicable to US companies; required for non-US companies**". `TxnTaxDetail` "can be calculated by QuickBooks business logic or you may supply it… If sales tax is disabled (`Preferences.TaxPrefs.UsingSalesTax` is set to false) then TxnTaxDetail is ignored and not stored" ([Bill](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/bill)).
- **Non-US model. Confirmed.** "For each purchase item line subject to purchase tax, set its … `TaxCodeRef`… QuickBooks Online automatically calculates tax and returns the amount in the `TxnTaxDetail.TotalTax`". The TaxCode on a purchase line references rates in the TaxRate's `PurchaseTaxRateList`. Overriding: supply `TxnTaxDetail.TotalTax` and one `TaxLine` per rate with `TaxRateRef`, `Amount` and `TaxPercent`; "You must send all TaxRateRefs of a TaxCode even if you are modifying just one of them". "Some of these auto-generated tax codes are non-editable and tax amount for such tax codes cannot be overridden. An attempt to do so will generate a business validation error." Sales tax "cannot [be enabled] via the QuickBooks Online API"; check `UsingSalesTax` ([Automated sales tax, non-US locales](https://developer.intuit.com/app/developer/qbo/docs/workflows/calculate-sales-tax/automated-sales-tax-for-non-us-locales)).
- **Tax-inclusive rounding. Confirmed** (same page). With `TaxInclusive`, "the pre-tax transaction amount is the sum of pre-tax amounts rounded off per line rather than rounded off the total amount". A gross-amount bill can therefore land a cent off the source total.
- **Errors. Confirmed** ([error codes](https://developer.intuit.com/app/developer/qbo/docs/develop/troubleshooting/error-codes)):
  - **6100** Invalid Line TaxCode ("For US, specify TAX or NON")
  - **6160 / 6230** Invalid TaxCodeRef (CustomSalesTax)
  - **6170** "The TxnTaxDetail attribute isn't allowed when GlobalTaxCalculation is set to NotApplicable"
  - **2280** "A tax amount is required with TaxCodeRef applied"
  - **6470** "You either selected a tax on a transaction that's not allowed, or haven't specified a tax rate"
  - **6000** Business Validation Error, which wraps locale messages. "Make sure all your transactions have a GST/HST rate before you save" is seen in the field for Canada, and the ZA or UK equivalent for VAT is **unverified**.
- **South Africa. Confirmed that the region exists.** QBO sells a ZA edition with VAT ([QuickBooks ZA VAT](https://quickbooks.intuit.com/za/vat-tracking-software/)). A ZA company's TaxCode IDs are per-company and must be read with `query TaxCode`, never hard-coded. The ZA default code set is **unverified**.
- **Lesotho.** No Lesotho edition was found. A Lesotho business would use QBO's international ("global") edition, where "the user sets the home currency before enabling multicurrency" ([Manage multiple currencies](https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-multiple-currencies)). The home currency "cannot be changed" once set.
  - **LSL is supported:** `LSL` is in `IntuitBaseTypes.xsd`'s currency enumeration, and Intuit's list shows "LSL | Lesotho Loti" and "ZAR | South African Rand" ([supported currencies](https://quickbooks.intuit.com/learn-support/en-uk/help-article/multicurrency/list-supported-currencies/L0xujR3lJ_GB_en_GB)). **Confirmed.**
  - That a Lesotho company can pick LSL as its *home* currency at signup is **unverified**.
  - Multicurrency "is not available with QuickBooks Simple Start" and "cannot be enabled via the API" (confirmed). The ZA plan table lists "Multiple Currencies" on Essentials and up.

### Xero

- **Fields. Confirmed** ([Invoices](https://developer.xero.com/documentation/api/accounting/invoices)).
  - `LineItems[].TaxType`: "Used as an override if the default Tax Code for the selected AccountCode is not correct".
  - `TaxAmount`: "auto calculated… This value can be overriden if the calculated TaxAmount is not correct."
  - Header `LineAmountTypes` (`Exclusive`, `Inclusive`, `NoTax`): "Line amounts are exclusive of tax by default if you don't specify this element."
  - Discounts: "`DiscountRate`/`DiscountAmount`… Only supported on ACCREC invoices and quotes. **ACCPAY invoices and credit notes in Xero do not support discounts**."
- **South Africa. Confirmed.** [Types](https://developer.xero.com/documentation/api/accounting/types) lists the ZA system tax types, including `INPUT3` (15 % Standard Rate Purchases), `CAPEXINPUT2` (15 % capital goods), `EXEMPTINPUT`, `ZERORATEDINPUT`, `IMINPUT`, `NONE`, and the old 14 % types (`INPUT`, `CAPEXINPUT`). **In a ZA organisation, `INPUT` means the old 14 % rate, not 15 %.**
- **Lesotho ("Global" version). Confirmed.** The Global defaults are `INPUT` 0.00 "Tax on Purchases", `NONE` "Tax Exempt", `OUTPUT` 0.00 and `GSTONIMPORTS`. "New tax rates… have a TaxType of the format TAX001, TAX002 etc." (Types). A Lesotho VAT-registered organisation therefore has whatever custom rate the bookkeeper created, and DocuBite must read `GET TaxRates` (with `CanApplyToExpenses` and `Status`) rather than assume a code. `Organisation` exposes `CountryCode`, `BaseCurrency`, `Version` (`GLOBAL`, `AU`…) and `Class` ([Organisation](https://developer.xero.com/documentation/api/accounting/organisation)).
- **Currency. Confirmed.** `LSL` and `ZAR` are both in the `CurrencyCode` enum ([xero_accounting.yaml](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml)). A foreign `CurrencyCode` on a bill needs a multicurrency plan: "You need a business pricing plan with multicurrency to add foreign currencies" ([About multicurrency](https://central.xero.com/s/article/About-multicurrency)). In ZA that is **Premium** only ("Use multiple currencies"; [Xero ZA pricing](https://www.xero.com/za/pricing-plans/)). Currencies cannot be removed once added ([Currencies](https://developer.xero.com/documentation/api/accounting/currencies)). The error for a currency not enabled is **unverified**.
- **Error for an invalid or inapplicable `TaxType`: unverified.** A tax rate has `CanApplyToExpenses`, and a rate with that flag false should be refused on a purchase line. Xero returns a 400 `ValidationException`, or per-item `ValidationErrors` with `summarizeErrors=false`.

## 3. Item lines versus account lines

### QuickBooks Online

- **Line types. Confirmed.** A Bill `Line` is either `ItemBasedExpenseLine` or `AccountBasedExpenseLine` (Bill reference). `ItemBasedExpenseLineDetail` carries `ItemRef`, `Qty`, `UnitPrice`, `ClassRef`, `TaxCodeRef`, `CustomerRef` and `BillableStatus`, and **has no `AccountRef`**. The account is the Item's `ExpenseAccountRef`, or its `AssetAccountRef` for Inventory ([Item](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/item); `Finance.xsd`).
- **By plan. Confirmed** ([SKU-API Mapping](https://help.developer.intuit.com/s/article/QuickBooks-Online-SKU-API-Mapping)):

  | | Simple Start | Essentials | Plus (and Advanced) |
  |---|---|---|---|
  | `Bill` | no | **Account Line** only | Account Line **and Item Line** |
  | `Item` types | Service, NonInventory | Service, NonInventory, Bundle | Service, NonInventory, Bundle, **Inventory** |
  | `VendorCredit`, `BillPayment` | no | yes | yes |

- **An item line sent to a company without inventory or item lines.** On Essentials, **any** item line on a Bill is outside the SKU (not only an Inventory item), so expect **5030 Feature Not Supported**. The exact response is **unverified**. An `ItemRef` that doesn't exist returns **2500 Invalid Reference Id**. An Inventory item without a quantity returns **6520** "The tracked inventory item must have a quantity". **6270** InventoryTxnDatedBeforeItemStartDate is for inventory lines dated before the item's start date. **6440**: "You must select a product or service or an account for each split line that has an amount or a billable customer." (All error codes confirmed; the Essentials behaviour is inferred from the SKU table.)
- **Detection. Confirmed.** `Preferences.ProductAndServicesPrefs.QuantityOnHand` ("Enable QuantityOnHand") and `CompanyInfo` `OfferingSku` ([CompanyInfo](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/companyinfo) sample: `"OfferingSku": "QuickBooks Online Plus"`).

### Xero

- **Fields. Confirmed.** `LineItems[].ItemCode` ("See Items") and `AccountCode`. Tracked versus untracked, from [Items](https://developer.xero.com/documentation/api/accounting/items):
  - "If an item is tracked it means Xero tracks the available quantity and value of the item."
  - `IsTrackedAsInventory` is true when `InventoryAssetAccountCode` and `PurchaseDetails.COGSAccountCode` are set.
  - `PurchaseDetails.AccountCode` is "Not applicable to the purchase details of tracked items".
- **The account on a tracked line.** Xero's tracked-inventory guide posts the ACCPAY line with `ItemCode` *Fridge* against the **inventory asset account (630)** ([Integrating with tracked inventory](https://developer.xero.com/documentation/api-guides/tracked-inventory-in-xero), confirmed). Xero Central says of purchases that the inventory asset account "displays in the Purchase account field… and you can't select another account". That quote comes from a search summary of [About tracked inventory](https://central.xero.com/0/article/Track-your-inventory), so it is **unverified verbatim**. What Xero does when a line pairs a tracked `ItemCode` with a different `AccountCode` (error, override, or `Warnings`) is **unverified**.
- **Untracked items.** The line takes the item's `PurchaseDetails.AccountCode` and `TaxType` when the line omits them. This is inferred from the Items field descriptions and is **unverified**.
- **Plans.** No plan gate for items or tracked inventory was found on the ZA plan comparison. Xero recommends at most **4,000 tracked items** per organisation ([API limits](https://developer.xero.com/documentation/guides/oauth2/limits/), confirmed). An unknown `ItemCode` gives a validation error; the text is **unverified**.
- **"No inventory" in Xero** is a data state (no tracked items), not a plan state. An untracked or unknown item cannot silently become inventory.

## 4. Attachments

### QuickBooks Online

- **Call. Confirmed** ([Attach images and notes](https://developer.intuit.com/app/developer/qbo/docs/workflows/attach-images-and-notes), [Attachable](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/attachable)).
  - `POST /v3/company/{realmId}/upload`, `multipart/form-data`, with parts `file_content_01` (the file) and `file_metadata_01` (an Attachable JSON with `AttachableRef[].EntityRef {type: "Bill", value: <id>}`, `FileName`, `ContentType`).
  - "The object must already exist in order to add an attachment to it."
  - "If the data supplied with the Attachable object cannot be validated, an error is returned and the file is not uploaded."
  - "If meta data is not supplied with the upload request, the system creates it". An existing upload can then be linked with `POST /attachable` (JSON), carrying its `Id`, `SyncToken` and `AttachableRef`.
- **Limits. Confirmed.**
  - "An upload request may contain as many files as possible in a request, but the overall request size must not exceed **100 MB**" (Attachable).
  - Types: "PDF, JPEG, PNG, DOC, XLSX, CSV, TIFF, GIF, XML" ([Add or delete attachments](https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/attachments-quickbooks-online/L8XvMBCgd_US_en_US)).
  - `FileName` max 1000 characters. `Category` is one of Contact Photo, Document, Image, Receipt, Signature, Sound, Other.
  - The per-file cap in the UI is reported as 30 MB (search summary, **unverified**).
- **Errors. Confirmed** (error codes): **6020** Content length missing, **6030** "Upload request size exceeds allowed limit", **6040** file metadata must be of Attachable type, **6041** "Invalid Uploaded File", **6050** "The entity reference type is unsupported for Attachable".
- **Plan and scope. Confirmed.** `Attachable` is ticked for all three plans in the SKU table. It is an Accounting API entity, so it is covered by the `com.intuit.quickbooks.accounting` scope. A community report that QBO rejects `application/octet-stream` as the part's Content-Type is **unverified**; always send the real MIME type.

### Xero

- **Call. Confirmed** ([Attachments](https://developer.xero.com/documentation/api/accounting/attachments)). `PUT` or `POST https://api.xero.com/api.xro/2.0/Invoices/{InvoiceID}/Attachments/{FileName}`. "The body of the http request contains the raw attachment content, not xml or json". Content-Type is the file's MIME type.
- **Limits. Confirmed.**
  - "**10 attachments can be uploaded per document (each up to 10mb in size)**."
  - Filenames containing `< > : " / \ | ? * \0 +` "will be rejected as a Bad Request".
  - Posting to an existing filename replaces the file.
  - `IncludeOnline=true` is for receivables only.
  - All Xero APIs have a 10 MB request limit ([API limits](https://developer.xero.com/documentation/guides/oauth2/limits/)).
- **Scope. Confirmed** ([Scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/)). `accounting.attachments` ("View and manage your attachments": Invoices, CreditNotes and others). **`lib/integrations/xero/config.ts` requests `offline_access accounting.transactions accounting.contacts accounting.settings`, with no `accounting.attachments`**, so every existing connection would have to re-consent. The same page says broad scopes like `accounting.transactions` are **deprecated**: new and existing Web apps got granular scopes from March 2026, and "Broad scopes will remain available until September 2027". The replacement for bills and credit notes is `accounting.invoices`.
- **Plan.** No plan gate found.

### Through Nango's proxy (DocuBite uses Nango Cloud, `api.nango.dev`)

**Confirmed from Nango's source** at commit [`5ee0e11`](https://github.com/NangoHQ/nango/tree/5ee0e11e868feb1480a3e46c19ec52d1fb2a780d), 2026-09-24:

- Only request headers prefixed **`Nango-Proxy-`** are forwarded to the provider ([`allProxy.ts` `parseHeaders`](https://github.com/NangoHQ/nango/blob/5ee0e11e868feb1480a3e46c19ec52d1fb2a780d/packages/server/lib/controllers/proxy/allProxy.ts)).
- **Raw binary.** A request whose own `Content-Type` is `application/*`, `image/*` and so on (anything except JSON or form-urlencoded) is read as a raw Buffer and forwarded ([`utils.ts` `isBinaryContentType`](https://github.com/NangoHQ/nango/blob/5ee0e11e868feb1480a3e46c19ec52d1fb2a780d/packages/server/lib/utils/utils.ts)). That covers Xero's raw PDF upload, sent as `Content-Type: application/pdf` plus `Nango-Proxy-Content-Type: application/pdf`.
- **Multipart.** Parsed with `multer` and rebuilt as a new `FormData` only when the *forwarded* content type is exactly `multipart/form-data` ([`shared/.../proxy/utils.ts`](https://github.com/NangoHQ/nango/blob/5ee0e11e868feb1480a3e46c19ec52d1fb2a780d/packages/shared/lib/services/proxy/utils.ts)). File parts keep their filename and MIME type. **Non-file parts are re-appended as plain strings**, so QBO's `file_metadata_01` loses its `application/json` part header. Whether QBO accepts the metadata part without that header is **unverified**. A safe path is to upload the file alone and then link it with `POST /attachable` (JSON), which QBO documents.
- **Unsupported types.** Other content types are refused with `400 unsupported_content_type`, with the hint to set the type through `nango-proxy-Content-Type` ([`routes.ts`](https://github.com/NangoHQ/nango/blob/5ee0e11e868feb1480a3e46c19ec52d1fb2a780d/packages/server/lib/routes.ts)).
- **Body limit.** The default is `NANGO_SERVER_PUBLIC_BODY_LIMIT` = **75 MB**; Nango Cloud's actual value is **unverified**. Too large returns `413 request_too_large`.
- **DocuBite's `nangoProxy`** (`lib/nango.ts`) hard-codes `content-type: application/json`, sends no `Nango-Proxy-Content-Type`, and parses every response as JSON. An attachment upload needs a binary or multipart variant of it.

## 5. Vendor credits and credit notes

### QuickBooks Online

- **Entity. Confirmed** ([VendorCredit](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/vendorcredit)). "An accounts payable transaction that represents a refund or credit of payment". It has the same `Line` types as a Bill (item or account), `GlobalTaxCalculation` (required outside the US), `CurrencyRef`, `DepartmentRef`, `APAccountRef` and a read-only `Balance` (`Finance.xsd`). Only a **full update** is available. **Plan:** Essentials and up (SKU table). Simple Start returns 5030.
- **Applying to a bill. Confirmed as the documented route.** `BillPayment.Line[]`: "Individual line items representing zero or more Bill, VendorCredit, and JournalEntry objects linked to this BillPayment object", with `Line.LinkedTxn` (`TxnType` `Bill` or `VendorCredit`). `TotalAmt` "cannot be negative". `PayType` is required (`Check` or `CreditCard`) ([BillPayment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/billpayment)).
  - No other endpoint for applying a credit was found.
  - Two points are **unverified**: that a **zero-`TotalAmt`** BillPayment with one Bill line and one VendorCredit line of equal amounts applies the credit and moves no money, and that a bank account ref is still required on it.
  - The linked-transactions guide says bill-side links are set "through the BillPayment.Line.LinkedTxn element" ([Manage linked transactions](https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-linked-transactions)).
  - Error for linking a transaction that can't be linked: **620** "Txn ID Cannot Be Linked" (error codes).

### Xero

- **Entity. Confirmed** ([Credit Notes](https://developer.xero.com/documentation/api/accounting/creditnotes)). `Type: "ACCPAYCREDIT"`. The line shape matches invoices (`AccountCode`, `TaxType`, `Tracking`, `ItemCode`; no discounts). `CreditNoteNumber` for ACCPAYCREDIT is "Non-unique… will also display as Reference". The credit note carries `RemainingCredit` and `Allocations`. The `accounting.transactions` scope covers it; so does granular `accounting.invoices`.
- **Allocation. Confirmed** (same page).
  - `PUT /CreditNotes/{CreditNoteID}/Allocations` with `{ "Amount": n, "Invoice": { "InvoiceID": … } }`.
  - "Credit notes must have a Status of AUTHORISED to be available for allocation."
  - "**You cannot create and allocate a credit note in a single call.** The create and allocation must be done in two separate calls."
  - `Date` is read-only: "the latter of the invoice date and the credit note date".
  - An allocation is undone with `DELETE /CreditNotes/{id}/Allocations/{AllocationID}`.
  - "Applying 'Allocations' cannot be tested through the API Explorer."
- **Errors.** An unknown credit-note id returns "An existing Credit Note with the specified CreditNoteID could not be found" (Xero OpenAPI example, confirmed). The texts for over-allocation, a different contact, a different currency, or a locked period are **unverified**. The analogous payment message is "Payment amount exceeds the amount outstanding on this document".
- **Plan.** No gate found. On **Starter**, whether an AUTHORISED ACCPAYCREDIT counts against the 5-bill allowance is **unverified**.

## Plan limits that stop a bill outright

- **QBO Simple Start.** No `Bill` (5030). DocuBite cannot post a bill at all; the nearest entity is `Purchase`, an expense, which is available on every plan (SKU table).
- **Xero Starter.** "Enter 5 bills" a month ([Xero ZA pricing](https://www.xero.com/za/pricing-plans/)). Search summaries of Xero Central say the allowance counts *approved* ACCPAY invoices per month (**unverified**). The API error text is **unverified**; third-party help centres report messages like "You have reached the limit of invoices you can approve". `Organisation.Class` returns `STARTER`, `STANDARD`, `PREMIUM`… so the plan can be read in advance (Types, confirmed).
- **Xero app tier (not a customer plan).** A new app starts with **5 connections**, 1,000 calls a day per tenant, and "each organisation… is limited to connecting a maximum of two uncertified apps" ([API limits](https://developer.xero.com/documentation/guides/oauth2/limits/), confirmed).

## QBO vs Xero: where they differ

| Area | QuickBooks Online | Xero |
|---|---|---|
| Bill available on | Essentials, Plus, Advanced (**not Simple Start**) | All plans; **Starter capped at 5 approved bills a month** |
| Item lines on a bill | **Plus and Advanced only**; Essentials takes account lines only | All plans |
| Account on an item line | None on the line; comes from the Item (`ExpenseAccountRef`, or `AssetAccountRef` for inventory) | `AccountCode` is sent; a tracked item puts the line on its inventory asset account |
| Inventory | Plus and Advanced (`Type: Inventory`, `QuantityOnHand` pref) | All plans (tracked item: `InventoryAssetAccountCode` + `COGSAccountCode`); 4,000 tracked items recommended |
| Line dimensions | `ClassRef` per line (Plus+); `DepartmentRef` (Location) **header only** (Plus+); `CustomerRef` and `BillableStatus` per line | Up to **2 tracking categories per line**; 2 active per organisation; no header dimension |
| Tax field on a line | `TaxCodeRef` (a company TaxCode id); tax calculated by QBO, overridable through `TxnTaxDetail` | `TaxType` (a code such as `INPUT3` or `TAX001`); defaults to the account's tax; `TaxAmount` overridable |
| Tax-inclusive flag | `GlobalTaxCalculation`, **required outside the US**, no default stated | `LineAmountTypes`, **defaults to Exclusive** |
| ZA VAT codes | Per-company TaxCode ids; query them | System types; **`INPUT3` = 15 %**, `INPUT` = old 14 % |
| Lesotho | International edition; LSL a supported currency; home currency picked at signup | "Global" version; LSL in the currency enum; only a 0 % `INPUT` by default, so a custom VAT rate is needed |
| Foreign currency on a bill | `CurrencyRef` (required when multicurrency is on); multicurrency Essentials+, enabled only in the UI, irreversible | `CurrencyCode`; multicurrency needs **Premium** in ZA |
| Line discounts | No discount line type on Bill | **Not supported on ACCPAY** |
| Attachment call | `POST /upload` multipart (file + Attachable JSON), or upload then `POST /attachable` | `POST Invoices/{id}/Attachments/{filename}` with a raw body |
| Attachment limits | 100 MB per request; PDF, JPEG, PNG, DOC, XLSX, CSV, TIFF, GIF, XML | **10 files × 10 MB** per document; 10 MB per request |
| Attachment scope | `com.intuit.quickbooks.accounting` (already needed) | **`accounting.attachments`, not requested by DocuBite today** |
| Through Nango | Multipart is rebuilt and the metadata part loses its JSON header; upload-then-link avoids this | Raw binary is forwarded; set `Nango-Proxy-Content-Type` |
| Vendor credit | `VendorCredit` (Essentials+), full update only | `CreditNote` `Type: ACCPAYCREDIT` |
| Applying credit to a bill | Through a `BillPayment` linking the Bill and the VendorCredit (zero-amount pattern unverified) | `PUT CreditNotes/{id}/Allocations`, after AUTHORISED, in a separate call |
| Feature-off error | **5030 Feature Not Supported**; plan readable from `CompanyInfo.OfferingSku` | `ValidationException` 400, or **`Warnings` on a 200** (data can be removed silently); plan readable from `Organisation.Class` |

## What DocuBite must handle explicitly (never drop data silently)

1. **Read the plan and switches once per connection and store them.**
   - **QBO:** `CompanyInfo.OfferingSku`, plus `Preferences`: `ClassTrackingPerTxnLine`, `TrackDepartments`, `QuantityOnHand`, `UsingSalesTax`, `MultiCurrencyEnabled`, `HomeCurrency`.
   - **Xero:** `Organisation`: `Class`, `Version`, `CountryCode`, `BaseCurrency`, plus `TrackingCategories` and `TaxRates`.
   - Refuse a post before sending it when the ledger cannot hold something on the document, and say why.
2. **QBO Simple Start cannot take a bill.** Say so at connect and at post. Never quietly downgrade to a `Purchase`.
3. **QBO Essentials takes account lines only.** An item on a line is either refused with a reason, or turned into an account line only if the person explicitly chooses that.
4. **Dimensions the plan lacks** (QBO Class or Location below Plus, a third Xero tracking category, an archived option) are a visible refusal, never omitted from the payload. QBO has one Location per bill, so lines with different locations cannot post as one bill.
5. **Tax must be sent, not left to defaults.** Today neither mapper sends tax:
   - **Xero:** send `LineAmountTypes` (the source total is usually VAT-inclusive; the default *Exclusive* adds VAT on top) and `TaxType` per line. `INPUT3`, not `INPUT`, for 15 % ZA purchases. A custom `TAX00n` for Lesotho, read from `TaxRates`.
   - **QBO (non-US):** send `GlobalTaxCalculation` and a `TaxCodeRef` per line.
   - **Both:** after posting, compare the ledger's `Total` and `TotalTax` with the document and flag any difference, including QBO's per-line inclusive rounding.
6. **Currency.** Refuse a bill whose currency is not the company's home currency when multicurrency is off (QBO) or the plan lacks it (Xero Starter and Standard in ZA). LSL is valid in both ledgers, but only if it is the home currency or an enabled currency.
7. **Read Xero `Warnings` and `ValidationErrors` on every 200** (post with `summarizeErrors=false`). Treat any warning that removes an account code, tracking option or item as a failed post, not a success.
8. **Item lines hand the account to the ledger.** On a QBO item line and a Xero tracked-item line, the account comes from the item, so the Account DocuBite shows must be the item's, read back from the ledger, or the line must be refused.
9. **No line discounts on Xero bills.** A discount on the source document must post as its own negative line, or be refused. It must not be netted away unseen.
10. **Attachments.**
    - Request Xero `accounting.attachments`, and plan a re-consent for existing connections (also moving to granular `accounting.invoices` before September 2027).
    - Add a binary- and multipart-capable Nango proxy call.
    - Check size and type before upload: Xero 10 MB and 10 files; QBO's type list.
    - A failed attachment after a successful bill must be shown as "posted without its PDF" and retried, not hidden.
11. **Vendor credits** are a separate, two-step operation in both ledgers: create, then apply (QBO BillPayment, Xero Allocation). The create can succeed while the apply fails, and each state must be shown separately.
12. **Xero Starter's 5-bill cap.** Surface the ledger's refusal as "your Xero plan's bill limit", not as a generic error.

## Open questions to settle in the sandboxes

- QBO: does `ClassRef` or `DepartmentRef` sent to an Essentials company, or with tracking off, error or get silently dropped? What exactly does an item line on an Essentials bill return?
- QBO: does a multipart upload through Nango (metadata as a plain string part) succeed, or must DocuBite upload and then link?
- QBO: does a zero-`TotalAmt` BillPayment (Bill line plus VendorCredit line) apply the credit, and does it need a bank account ref?
- QBO ZA: the default VAT TaxCodes and the 6000 message when `TaxCodeRef` is missing with VAT on.
- Xero: what happens on an ACCPAY line that pairs a tracked `ItemCode` with a non-inventory `AccountCode`, or an unknown `ItemCode`, tracking option or `TaxType`? Error or `Warnings`?
- Xero Starter: the exact API error at the sixth bill, and whether DRAFT bills or ACCPAYCREDIT count.
- Nango Cloud's real request-body limit.

## ADR 0011 check

ADR 0011 says "each document line carries one of the ledger's own accounts (the **Account**)", that the bill mappers "post an account per line", and that a correction "changes the account only: the line's existing tax type is always sent back unchanged". Four findings bear on it:

- **Item lines have no line account.** QBO `ItemBasedExpenseLineDetail` has no `AccountRef`. A Xero tracked item forces the inventory asset account. If item lines are ever posted, "a line's Account is the ledger's account" holds only as *the item's* account: the supplier rule and Default cannot set it, and an account correction cannot change it (it would need an item change). Account lines are unaffected, and today's mappers post account lines only.
- **QBO Essentials has account lines only**, which fits ADR 0011 as written.
- **"Tax type sent back unchanged" presumes a tax type was sent in the first place.** Today Xero picks each line's `TaxType` from the account's default. If a correction to a different account resends the old `TaxType`, the VAT stays as posted, which is what the ADR wants. If the tax field is instead omitted (as the mapper does on create), Xero applies the *new* account's default and VAT can move ([ledger-bill-account-update.md](ledger-bill-account-update.md) confirmed this for Xero). The correction path must therefore always read back and resend `TaxType` (Xero) or `TaxCodeRef` (QBO).
- **Xero `Warnings` can strip an unrecognised `AccountCode`** from a line on a 200 response (mechanism confirmed; ACCPAY behaviour unverified). The line would then post without the Account DocuBite chose, which the ADR's "post eligibility = every line has an Account" does not catch after the fact. Read `Warnings`.

## Sources

- Intuit:
  - [Bill](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/bill), [VendorCredit](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/vendorcredit), [BillPayment](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/billpayment), [Attachable](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/attachable), [Item](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/item), [CompanyInfo](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/companyinfo), [Preferences](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/preferences), [Class](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/class), [Department](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/department)
  - [Error codes](https://developer.intuit.com/app/developer/qbo/docs/develop/troubleshooting/error-codes), [Attach images and notes](https://developer.intuit.com/app/developer/qbo/docs/workflows/attach-images-and-notes), [Automated sales tax (non-US)](https://developer.intuit.com/app/developer/qbo/docs/workflows/calculate-sales-tax/automated-sales-tax-for-non-us-locales), [Manage multiple currencies](https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-multiple-currencies), [Manage linked transactions](https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-linked-transactions)
  - [QuickBooks Online SKU-API Mapping](https://help.developer.intuit.com/s/article/QuickBooks-Online-SKU-API-Mapping), [Simple Start "Feature Not Supported" thread](https://help.developer.intuit.com/s/question/0D54R00008pcxjGSAQ/im-using-the-qb-simple-starter-plan-but-while-using-quickbooks-plugins-unable-to-use-it-say-this-message-feature-not-supported-error-were-sorry-this-feature-is-not-included-in-your-quickbooks-online-simple-start-subscription)
  - [QuickBooks ZA pricing](https://quickbooks.intuit.com/za/pricing/), [ZA VAT](https://quickbooks.intuit.com/za/vat-tracking-software/), [Supported currencies](https://quickbooks.intuit.com/learn-support/en-uk/help-article/multicurrency/list-supported-currencies/L0xujR3lJ_GB_en_GB), [Add or delete attachments](https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/attachments-quickbooks-online/L8XvMBCgd_US_en_US)
  - Schemas: [Finance.xsd](https://github.com/intuit/QuickBooks-V3-Java-SDK/blob/develop/ipp-v3-java-data/src/main/xsd/Finance.xsd), [IntuitBaseTypes.xsd](https://github.com/intuit/QuickBooks-V3-Java-SDK/blob/develop/ipp-v3-java-data/src/main/xsd/IntuitBaseTypes.xsd)
- Xero:
  - [Invoices](https://developer.xero.com/documentation/api/accounting/invoices), [Credit Notes](https://developer.xero.com/documentation/api/accounting/creditnotes), [Attachments](https://developer.xero.com/documentation/api/accounting/attachments), [Tracking Categories](https://developer.xero.com/documentation/api/accounting/trackingcategories), [Items](https://developer.xero.com/documentation/api/accounting/items), [Tax Rates](https://developer.xero.com/documentation/api/accounting/taxrates), [Types](https://developer.xero.com/documentation/api/accounting/types), [Currencies](https://developer.xero.com/documentation/api/accounting/currencies), [Organisation](https://developer.xero.com/documentation/api/accounting/organisation)
  - [Scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/), [API limits](https://developer.xero.com/documentation/guides/oauth2/limits/), [Tracked inventory guide](https://developer.xero.com/documentation/api-guides/tracked-inventory-in-xero)
  - [xero_accounting.yaml](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero_accounting.yaml)
  - [Xero ZA pricing](https://www.xero.com/za/pricing-plans/), [About multicurrency](https://central.xero.com/s/article/About-multicurrency), [Set up tracking categories](https://central.xero.com/s/article/Set-up-tracking-categories), [About tracked inventory](https://central.xero.com/0/article/Track-your-inventory)
- Nango (source at [`5ee0e11`](https://github.com/NangoHQ/nango/tree/5ee0e11e868feb1480a3e46c19ec52d1fb2a780d)): `packages/server/lib/controllers/proxy/allProxy.ts`, `packages/server/lib/routes.public.ts`, `packages/server/lib/routes.ts`, `packages/server/lib/utils/utils.ts`, `packages/shared/lib/services/proxy/utils.ts`
- This repo: `lib/integrations/{quickbooks,xero}/bill-mapper.ts`, `lib/integrations/xero/config.ts`, `lib/nango.ts`, `docs/adr/0011-…md`
