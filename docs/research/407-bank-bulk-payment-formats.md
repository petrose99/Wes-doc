# Bulk supplier-payment import and results-file formats — ZA and LS business banks

Ticket: [#407](https://github.com/petrose99/Wes-doc/issues/407), research for map #406 "Paying suppliers safely". This document is facts only. It is **not** a recommendation. Every claim is marked:

- **confirmed**: read directly in the bank's own published guide or help page (quoted or paraphrased closely, URL given).
- **inferred**: follows from a confirmed fact, or comes from a reputable integrator's notes (Sage, Source IT). The reasoning is stated.
- **not found**: no public primary source was reachable in this pass. Where a secondary source makes a claim, it is quoted and flagged.

Researched 2026-09-23. Several bank pages refused automated fetch: Nedbank's `businessbanking.nedsecure.co.za` training pages (connection reset), Absa's `integrator.absacorp.africa` help (connection refused), and Capitec's help pages (HTTP 403). Those gaps are called out where they matter.

## Question

For Absa, FNB, Standard Bank, Nedbank and Capitec Business (ZA), and for Standard Lesotho Bank, FNB Lesotho and Nedbank Lesotho (LS), this document asks:

- What bulk supplier-payment import file does each bank's business online banking accept?
- What is its layout? What are the required fields?
- Does it take a branch code or a universal code? Does it need an account-type field?
- What are the length limits for the beneficiary name and for both references (the payer's own and the supplier's)?
- What amount format does it use, and how many lines can a file hold?
- Can a Lesotho bank's file carry a cross-border line to a ZA account?
- Does the bank return a processing results file saying which lines paid and which failed?
- Which banks accept the generic CSV that `lib/payments/za-eft-csv.ts` writes?

## Summary / Answer

**No bank in scope accepts DocuBite's generic CSV as written.** The comment at the top of `lib/payments/za-eft-csv.ts` claims every major SA portal accepts it, and ignores the columns it does not need. No source found supports that. There are three kinds of portal:

- **Fixed layouts that reject a header row and our column order:**
  - FNB: its own template, with header rows 2–3 and an account-type column.
  - Nedbank Lesotho: no headings, seven fixed columns.
  - Nedbank SA: bank template with a fixed column sequence.
  - Capitec: fixed six-column CSV.
- **Customer-configured column mapping:**
  - Standard Bank Business Online: "Setup Import Files".
  - Absa Business Integrator Online.
  - These *might* be mapped onto our columns once per customer, but no source confirms that a header row or a currency column is tolerated.
- **Not public:** Standard Lesotho Bank.

Per bank:

| Bank | Import format (status) | Supplier-side reference limit | Payer-side reference limit | Processing results file? |
|---|---|---|---|---|
| FNB (ZA) | FNB Payments CSV template, Bankserv ACB (fixed 180 + CRLF), or ISO 20022 PAIN (**confirmed**) | 20 (**confirmed**) | 20 (**confirmed**) | **Import Results file only** (validation, to OBE Inbox/email). Per-item paid/failed shown as batch status + "View Failed Items" in the portal; Unpaid Reports can be exported. No per-line processing results *file* found for portal users. |
| FNB Lesotho | Same OBE Payments CSV template (international edition) (**confirmed**) | 20 (**confirmed**) | 20 (**confirmed**) | Same as FNB ZA: Import Results file (**confirmed**); rest inferred to match. |
| Standard Bank (ZA) | Business Online "Excel Type Format for SSVs" with customer column mapping, or ACB (**confirmed**) | 30 ("Statement Ref") (**confirmed**) | Not found as a per-line field | **Full Transaction Feedback** service: batch / sub-batch / transaction status, view and print failed items (**confirmed**). A downloadable file format was **not found**. |
| Nedbank (ZA) | Nedbank CSV template, Nedinform ACB, NetBank Secure format (**inferred**, since the bank's own pages would not load) | Not found | Not found | Not found |
| Nedbank Lesotho | Headerless 7-column CSV (**confirmed**) | 35 (**confirmed**) | None per line. The payer statement shows one consolidated debit with the file reference (**confirmed**). | **No results file.** Bulk File View dashboard, a printable/downloadable transaction listing, per-record payment confirmation, and an error file for rejected files. **One bad line rejects the whole file** (**confirmed**). |
| Absa (ZA) | Business Integrator Online CSV with customer column mapping, plus ACB (**inferred** from integrator notes) | 20 on BIO (**inferred**, Source IT) | Not found | Not found |
| Capitec Business | Fixed 6-column CSV (**inferred**, Sage KB) | 16, no special characters (**inferred**, Sage KB) | 16, no special characters (**inferred**, Sage KB) | Not found (one unverified secondary claim of per-row responses) |
| Standard Lesotho Bank | **Not public.** Enterprise Online supports bulk upload, but no format document is published. | Not found | Not found | Not found |

**Cross-border LS→ZA lines: no.** EFTs between CMA countries were withdrawn:

- Lesotho and Eswatini: 9 September 2024. Namibia: 15 April 2024.
- LS→ZA credits are now cross-border/international payments. They need Balance-of-Payments (BoP) categories, payer and beneficiary addresses and (for individuals) gender.
- **confirmed**: the policy itself, from the Bankers Association of Lesotho, the SARB, Nedbank and Standard Bank Eswatini.
- **inferred**: that no LS bank's domestic bulk file can carry such a line. Nedbank Lesotho's file has no field for any of that data. Standard Bank's group says CMA payments go through the International Payments tab as once-off payments.

**Implications for DocuBite:**

- A single reference that fits every bank must be **≤ 16 characters, alphanumeric plus spaces**. That is Capitec's limit, which is inferred rather than confirmed.
- **≤ 20 characters** fits FNB, Absa BIO and Standard Bank.
- **Results-file intake is not possible from any public spec in scope.** The closest are FNB's portal statuses and Unpaid Reports export, Standard Bank's Full Transaction Feedback, and Nedbank Lesotho's transaction listing. None is a documented machine-readable per-line results file for portal users. FNB, Standard Bank and Absa all offer host-to-host channels where response files exist, but those are bank-integration contracts, not portal features.

---

## 1. Per-bank detail

### FNB South Africa: Online Banking Enterprise™ (OBE)

Accepted file types (**confirmed**): the OBE user guide's payment import step reads "Select the File Type. The options are Excel (.CSV), BankServ (ACB) or ISO 20022 PAIN." Source: [OBE South Africa User Guide (July 2026), p. 231–232](https://www.online.fnb.co.za/rhelp_0_15/OBE_SA_Downloads/assets/docs/South_Africa.pdf).

**Payments CSV template** (**confirmed**, [Payments – CSV Import Guide South Africa, April 2024](https://www.online.fnb.co.za/rhelp_0_15/OBE_SA_Downloads/Downloads/Payments/Payment_CSV_Import_Guide_SA.pdf)). The template is downloaded from OBE Help. Layout:

| Cell / column | Field | Len | Notes |
|---|---|---|---|
| A2 | Payment Action Date | 10 | CCYY/MM/DD, DD-MM-CCYY, CCYY-MM-DD, DD/MM/YY, DD/MM/CCYY or DD-MM-YY; otherwise it defaults to today; up to 365 days ahead |
| A3 | Own Account | 20 | account to pay from |
| B3 | Hash Totals | 12 | "This field is mandatory." Algorithm: sum of the recipient account numbers + the 11-digit own account, last 12 digits. Validation only runs if the admin has enabled it. |
| A (from row 4 on) | Recipient Name | 20 | "not validated against the account number" |
| B | Recipient Account | 20 | |
| C | Recipient Account Type | 1 | 0 public recipient, 1 current, 2 savings, 3 transmission, 4 bond, 6 subscription share, D/S eWallet, F FNB card, W WesBank |
| D | Branch Code | 6 | "Enter the Branch Code … alternatively, enter the Universal Branch Code for the respective bank" |
| E | Amount | 11 | period as the decimal separator, 0–2 decimals; more than 2 decimals fails |
| F | Own Reference | 20 | "appear on your bank statement" |
| G | Recipient Reference | 20 | "appear on the recipient's bank statement" |
| H–AJ | Notifications | — | up to 5 emails (address 100, subject 25) and 2 SMS |

- **Max lines** for the CSV: not stated.
- **Results** (**confirmed**): "An Import Results file will be created and sent to your Online Banking Enterprise™ Inbox and/or to the email address specified by you." The user guide adds a "Format for your Result Files" choice and an "Ignore Invalid Items" option. With Yes, a batch is built from the valid items only. With No, no batch is built if any item is invalid.
- The Import Results file reports **import validation**, not settlement.
- Settlement outcome is shown as batch status. From the User Guide (p. ~198), "Fully Processed – All items processed", "Partially Processed – Not all items processed. (View Failed Items)", "Processing Failed", "Funds Unavailable", and others.
- "Copy Failed Payment" re-creates the failed items.
- Reports tab: "Unpaid Reports – Use this function to view and export Payment and Collection Unpaid Reports" (User Guide p. 342).
- **Not found**: a downloadable per-line paid/failed file for portal users. FNB's Integration Channel (host-to-host/API) is offered separately (User Guide p. 344). Its response formats are not public.

**Bankserv ACB** (**confirmed**, [Payments – Bankserv (ACB) File Format South Africa, Feb 2023](https://www.online.fnb.co.za/rhelp_0_15/OBE_SA_Downloads/assets/docs/Payment_Bankserv_File_Format_SA.pdf)):

- Records are fixed width: "181 characters, including the Carriage Return … and Line Feed".
- "maximum number of payments allowed in a Bankserv (ACB) file is 100,000", with at most 200 contras.
- Transaction record fields:
  - homing account 11 digits, with a 20-character non-standard account field for longer numbers
  - account type 1
  - amount 11 digits in cents with no separators
  - "To Account Reference" 20 characters, "printed on the recipient's bank statement"
  - homing account name 15
- Absa's universal code 632005 appears in the spec's example branch field.

**3PIM variant** (trust-account payments, [3PIM Payments CSV Import Guide, April 2024](https://www.online.fnb.co.za/rhelp_0_15/OBE_SA_Downloads/assets/docs/3PIM_Payments_CSV_Import_Guide.pdf)): own reference is limited to **15**, recipient reference to 20 (**confirmed**). This is not the general supplier path.

### FNB Lesotho: Online Banking Enterprise™

- **confirmed**: FNB hosts the international edition of the same guide under the Lesotho help path: [Payments – CSV Import Guide (April 2024), OBE_LESOTHO_Downloads](https://www.online.fnb.co.za/rhelp_0_80/OBE_LESOTHO_Downloads/Downloads/Payments/Payment_CSV_Import_Guide_Int.pdf).
- The layout is identical to the SA template: header rows A2/A3/B3, columns A–G, name 20, account 20, own reference 20, recipient reference 20, amount 11 with a period.
- Account types are reduced to 0 public, 1 current, 2 savings, 3 transmission and S eWallet.
- The eWallet universal code for Lesotho is 280061.
- The same "Import Results file … Inbox and/or … email" statement is in the guide.
- Pages still carry a "South Africa April 2024" footer. That is the bank's own template reuse.

### Standard Bank South Africa: Business Online

- Import formats (**confirmed**): the Business Online glossary says "There are two types of import formats are available, i.e. SSVS format and ACB format." [BOL help glossary](https://secure.businessonline.standardbank.co.za/bebhelp/glossb.html).
- SSVS stands for "Same Day Soonest Value Service" ([Electronic Banking Operational Regulations, 2017](https://secure.businessonline.standardbank.co.za/bebhelp/operational_regulations.pdf)).
- **Excel Type Format for SSVs** (**confirmed**, [Setup Import Files help](https://secure.businessonline.standardbank.co.za/bebhelp/Funds_Transfer/excel_help_import_file.html)): "You must have successfully completed your column mapping available under 'Setup Import Files' in the Administration menu before attempting to import the file". "Only Sheet 1 is processed". Fields:

| Field | Len | Format |
|---|---|---|
| Account Number | 13 | numeric |
| Account Name | 30 | alphanumeric |
| Statement Ref | 30 | alphanumeric |
| Date | 8 | YYYYMMDD |
| Amount | 15 | "Decimal point optional; comma acceptable as thousand spacer" |
| Branch Number | 6 | numeric |
| Hash Total Indicator / Hash Total | 1 / 12 | "Non contra account * the amount" |
| RTGS/RTC | 1 | N, Y or F |
| Pay Alert Type / Destination | 1 / 64 | S, F or E |

- **No account-type column** in this mapping. **No separate own-reference column** per line.
- The glossary defines Statement Reference as "a maximum of 30 alpha-numeric characters".
- Which statement it prints on is **inferred** to be the beneficiary's, because it is the only per-line reference. Not stated explicitly.
- Whether the import accepts a `.csv` as opposed to an Excel workbook is **not found**. "Only Sheet 1 is processed" suggests a workbook.
- **Max lines**: not found.
- **Results** (**confirmed** that the service exists): [Full transaction feedback](https://www.businessonline.standardbank.co.za/bolsa/businessonline/products-and-services/channel-services/full-transactional-feedback). It "provides detailed feedback—at batch, sub-batch and transaction level—on the status of a payment … while it is being processed". You can "View the transactions that have failed" and "Print a consolidated report of the failed transactions". A downloadable machine-readable file is **not found**.
- The newer "Online Banking for Business" (SME) platform advertises "Make bulk payments by uploading a file" ([cheat sheet](https://www.standardbank.co.za/southafrica/business/bizconnect/help-me-manage-my-business/articles/your-online-banking-for-business-cheat-sheet)). Its template is **not public**.

### Nedbank South Africa: NetBank Business

- **Inferred / partly not found.** Nedbank's training pages exist but refused every automated fetch: [Importing batch payments in CSV format](https://businessbanking.nedsecure.co.za/TrainingPages/steps/Import%20batch%20paym%20CSV%20format/Import%20batch%20paym%20CSV%20format.htm), [Importing a batch of payments in ACB format](https://businessbanking.nedsecure.co.za/TrainingPages/steps/Importing%20a%20batch%20of%20payments%20in%20ACB%20format/Importing%20a%20batch%20of%20payments%20in%20ACB%20format.htm) and [… in NedInform format](https://businessbanking.nedsecure.co.za/TrainingPages/steps/Importing%20a%20batch%20of%20payments%20in%20NedInform%20format/Importing%20a%20batch%20of%20payments%20in%20%20NedInform%20format.htm). Their titles confirm that CSV, ACB and NedInform imports exist.
- Sage's community (a Sage staff answer) says the NetBank Business CSV template has a fixed column sequence that the payer cannot change ([Sage Community Hub](https://communityhub.sage.com/za/sage-vip-payroll-hr/f/general-discussion/221184/changing-the-csv-template-layout-for-exporting-acb-payments-netbank-business)).
- Source IT documents a separate "NetBank Business (Secure Format)" with an anti-fraud trailer that needs a 32-character seed registered with Nedbank ([Source IT](https://www.source-it.co.za/bts-knowledge/netbank-configuration/)).
- Column lengths, reference limits, max lines and any results file are **not found** from a primary source. A secondary article claims "~2 000 transactions per file" ([payloop](https://payloop.co.za/articles/bulk-salary-upload-fnb-standard-capitec-nedbank-absa-investec), an unverified blog). That matches Nedbank Lesotho's confirmed 2,000.
- CMA note (**confirmed**): "you will no longer be able to make EFTs to accountholders in other CMA countries using NetBank Business on the Nedbank Business Hub or the corporate payment system" ([Nedbank CIB](https://cib.nedbank.co.za/insights/articles/discontinuation-of-EFT-payments.html)).

### Nedbank Lesotho: internet banking Bulk Payments

All **confirmed** from [Nedbank Lesotho Bulk Processing Guide](https://www.internetbanking.nedbank.co.ls/custompages/content/Bulk_Payment_Guide_Lesotho.pdf).

The file is CSV, "save the file with format CSV (Comma delimited)(*.csv) without any column headings". The bank advises uploading a `.txt` copy to keep leading zeros. Columns in order:

1. Account Holder Name: "Only 35 characters allowed (do not include any special characters)"
2. Account Number: "include the leading zero if applicable"
3. Branch Code: "Only 6 numeric characters … include a leading zero". Examples: 070002, 070703, 051000…
4. Amount: "5.01 and not 5,01"
5. Beneficiary Statement Description: "The reference you would like the beneficiary to see. Only 35 characters allowed (do not include any special characters)"
6. Confirm Type: 1 email, 2 SMS
7. Confirmation Detail: email address, or mobile number with the country code

There is **no account-type field** and no per-line own reference.

- **Payer statement**: "You will only see two lines on your account; one for the debit, and one for the charge … the file reference will be displayed on the statement." The "My Statement Description" "cannot be changed".
- **Limits**: "The maximum amount of transactions allowed within a file is 2,000."
- **Whole-file failure**: "If any of the transactions in the file is rejected the entire file will reject."
- A file identical to one sent within 24 hours is treated as a duplicate.
- The value date is always today, or the authorisation date. It cannot be future-dated.
- Payments to "Bank Defined beneficiaries" or the Revenue Authority are not allowed in the file.

**Results**: there is no results file. Instead:

- Bulk File View shows file statuses Initiated/Pre Processed, Completed and Error.
- "Print … will provide you a downloadable transaction listing of all the records in the file to enable you to reconcile."
- Each record has a "Payment confirmation" (proof of payment).
- "View Error" downloads an error file for files in Error status.
- Rejected transactions show a reason in the audit detail.

### Absa South Africa: Business Integrator Online (BIO) / Absa Access

- **Not found from a primary source.** Absa's help at [integrator.absacorp.africa](https://integrator.absacorp.africa/idc/html/help/fileimport.html) refused connection, and absa.co.za's business help pages have no file-layout guide.
- **Inferred** from integrators:
  - AllWage/Agrigistics describe a BIO CSV "without any headers" in the order To Account Number, To Account Name, To Branch Code, Transaction Amount, Beneficiary Description. They add "Ensure that your column mapping on ABSA BIO correlates to the columns mentioned above". The mapping is set per customer in BIO. It gives "a consolidated batch, where only one debit reflects on your bank account" ([AllWage ABSA BIO](https://help.allwage.com/modules/payroll/bank-payments/absa-bio)).
  - Source IT's BIO layout lists "Statement reference: maximum 20 characters" and says the first record is treated as a header. That conflicts with AllWage's headerless claim.
  - Source IT's older (desktop) Business Integrator layout has "Statement narration: maximum 30 characters", with account types 1 current, 2 savings, 3 transmission, 4 subscription shares ([Source IT](https://www.source-it.co.za/bts-knowledge/bts-supplier-csv-imports/)).
  - ACB import into BIO is referenced by Sage users ([Sage Community](https://communityhub.sage.com/za/sage-vip-payroll-hr/f/general-discussion/169316/how-to-import-absa---acb-file)).
- The payer-side reference limit, max lines and results file are **not found**.

### Capitec Business

- **Not found from Capitec.** Capitec's help pages returned HTTP 403, and no spec is published.
- **Inferred** from Sage's knowledge base ([Download the latest Capitec Business ACB report interface files](https://za-kb.sage.com/portal/app/portlets/results/view2.jsp?k2dockey=230825145254287)). Sage produces a "comma-delimited CSV file" because "there's no standard ACB interface". Columns:
  - A: Bank Clearance Number (branch, 6 numeric)
  - B: Payment Account (16 numeric, zero-filled)
  - C: amount (2 decimals)
  - D: Payment Reference (16 alphanumeric)
  - E: Beneficiary Reference (16 alphanumeric)
  - F: Surname/Initial (16 alphanumeric)
- Sage adds: "Don't use special characters (for example -&#/\\:.,\_'@) in columns D and E. Capitec doesn't allow these characters in their import function."
- There is **no account-type column** in this layout.
- Results file: **not found**. One secondary blog claims "responses (success / failure per row) within about an hour" ([payloop](https://payloop.co.za/articles/bulk-salary-upload-fnb-standard-capitec-nedbank-absa-investec), unverified, not relied on).

### Standard Lesotho Bank: Enterprise Online

- **Not public.** Standard Lesotho Bank's business pages describe Enterprise Online in general terms only ([Ways to bank](https://www.standardlesothobank.co.ls/lesotho/business/ways-to-bank)).
- The Standard Bank group describes Business Online as allowing you to "upload payment batches online through a range of proprietary formats" ([BOL payments](https://www.businessonline.standardbank.co.za/bol/payments.html)).
- No layout, field lengths or results facility was found. The spec is available only to enrolled clients.

## 2. Branch code vs universal code

- FNB accepts either the branch code or the bank's universal code (**confirmed**, CSV guide column D).
- Standard Bank and Nedbank Lesotho want a 6-digit numeric branch code (**confirmed**). Neither page mentions universal codes.
- Universal codes:
  - FNB 250655: **confirmed** by FNB's eWallet note.
  - Absa 632005: **confirmed** as the example in FNB's ACB spec.
  - Standard Bank 051001, Nedbank 198765, Capitec 470010: **secondary only** (payloop). Well known, but not confirmed from the banks' own pages in this pass.
- Lesotho branch codes are 6 digits, for example Nedbank Lesotho 070002 in the bank's own example rows.

## 3. Cross-border LS → ZA lines (CMA)

- **Confirmed policy**:
  - "9 September 2024 – the final day of processing domestic EFT credit payments and EFT debit collections to and from Lesotho, Eswatini and Namibia" ([Nedbank CIB](https://cib.nedbank.co.za/insights/articles/discontinuation-of-EFT-payments.html)).
  - The SARB: "As of 30 September 2024, low-value electronic funds transfers (EFTs), debit and credit payments made between Common Monetary Area (CMA) countries … will be treated as cross-border transactions and subject to greater due diligence requirements" ([SARB media release](https://www.resbank.co.za/en/home/publications/publication-detail-pages/media-releases/2024/cma-countries-move-to-regularise-electronic-funds-transfer-payments)).
  - The Bankers Association of Lesotho (FNB Lesotho, Lesotho PostBank, Nedbank, Standard Lesotho Bank): credit payments remain possible but need "additional mandatory information such as payer's gender, address, beneficiary address and Balance of Payment (BOP) category" ([Standard Lesotho Bank press release](https://www.standardlesothobank.co.ls/lesotho/personal/About-us/press-releases/bankers-association-of-lesotho-held--a-press-conference-on-cross%E2%80%93border-transaction-changes-in-cma-countries)).
  - Nedbank's FAQ: CMA payments go through "PAY ZAR" under International Payments, as a new "ZAR recipient". Existing EFT recipients cannot be used ([Nedbank CMA FAQ](https://www.nedbank.co.za/content/dam/nedbank/site-assets/Personal/FOREX/Brochures/Common-Monetary-Area-discontinuation-FAQ.pdf)).
  - Standard Bank Eswatini, on the same Enterprise Online platform family as Standard Lesotho Bank: "All CMA payments will be once-off … Cross-border payments will be available on the International Payments tab". It needs a BoP code and, for Enterprise Online businesses, a TIN on every cross-border payment ([Standard Bank Eswatini CMA advertorial](https://www.stanbicbank.com.ci/static_file/Eswatini/FileDownloads/CMA%20ADVERTORIAL%20+%20FAQ%202.pdf)).
- **Inferred per bank**: no LS bulk file in scope can carry a ZA line.
  - Nedbank Lesotho's 7-column file has no BoP, address or gender field.
  - FNB's template has no such fields either. Its OBE help routes CMA payments to Global Payments/Forex, per search synthesis of FNB's notice; FNB's page was not opened directly.
  - Standard Lesotho Bank's group sends them through International Payments as once-off payments.
- A search snippet says Nedbank *Namibia* allows cross-border lines in bulk files "provided that the required BoP information is selected". That page now returns 404. It is Namibia-only and not verified.
- "At par" still describes the currency: LSL is pegged 1:1 to ZAR. It no longer describes the rail.

## 4. Does DocuBite's generic CSV fit?

`formatZaEftCsv` writes a header row, then `beneficiary_name, account_number, branch_code, amount (2dp), currency, your_reference, beneficiary_reference, beneficiary_email`. It has no account-type column and no length limits on names or references.

| Bank | Accepts it? | Why |
|---|---|---|
| FNB ZA / FNB LS | **No** (confirmed) | It needs its own template: date in A2, own account and hash total in A3/B3, then name, account, **account type**, branch, amount, own reference, recipient reference in columns A–G. It has no currency column. |
| Nedbank Lesotho | **No** (confirmed) | It needs "without any column headings" and a fixed order where column 5 is the reference (ours is currency). Name and reference max 35 with no special characters. |
| Nedbank ZA | **No** (inferred) | Bank template with a fixed column sequence (Sage staff). |
| Capitec Business | **No** (inferred) | Fixed layout: branch first, 16-character fields, special characters rejected. |
| Standard Bank ZA | **Possibly, not confirmed** | Per-customer column mapping could point at our columns. Unknowns: whether a `.csv` is accepted as opposed to Excel, whether a header row is skipped, and whether extra columns are ignored. Our references are not capped at 30. |
| Absa BIO | **Possibly, not confirmed** | Per-customer column mapping. Sources conflict on header handling. Reference max 20 (secondary). |
| Standard Lesotho Bank | Unknown | Spec not public. |

The file's header comment is therefore unsupported by any source found. It says that "every major SA business-banking portal (Standard Bank, Absa, Nedbank, FNB) will accept" the file and "each portal ignores columns it doesn't need".

## 5. Reference constraints DocuBite could write and match on

| Bank | Supplier sees | Payer sees | Charset (where stated) |
|---|---|---|---|
| FNB (CSV) | 20 | 20 per line | AN |
| FNB (ACB) | 20 | — (name 15 used as own reference) | AN |
| Standard Bank BOL | 30 | not a per-line field | alphanumeric |
| Nedbank Lesotho | 35 | file reference only (consolidated) | "no special characters" |
| Absa BIO | 20 (secondary) | not found | — |
| Capitec | 16 (secondary) | 16 (secondary) | no `-&#/\:.,_'@` |
| Nedbank ZA, Standard Lesotho Bank | not found | not found | — |

- The largest reference that fits every bank with a known limit is **16 characters of letters, digits and spaces**.
- Dropping Capitec, it is **20 characters**.
- Nedbank Lesotho and FNB ACB give the payer no per-line reference on their own statement. So a payer-side match on a DocuBite reference is impossible there. Matching would have to use the supplier-side reference, via the supplier, or amount + date.

## Limits of this pass

- Primary layouts were read in full for FNB (ZA and LS) and Nedbank Lesotho. Standard Bank's Business Online field table and glossary were also read directly.
- Nedbank ZA, Absa and Capitec rest on integrator notes (Sage, Source IT, AllWage), because the banks' own help hosts refused automated fetch. They should be confirmed from inside a live business profile before building a generator.
- Standard Lesotho Bank's format is not public.
- No bank in scope publishes a per-line processing results *file* for portal (non-host-to-host) users.
