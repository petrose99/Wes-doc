# #458 Build: line Tax code, Tax basis and Tracking — spec

Owner: autopilot (owner's delegation: recommended answers taken) · Created 2026-09-26 · Status: ready for build.
Decision: #448 (resolution comment, Q6 table) and ADR 0014. Nothing here re-decides them.
Vocabulary (`CONTEXT.md`): *Tax code*, *Tax basis*, *Tracking*, *Location*, *Customer*, *Billable*, *Check*,
*Supplier account rule*, *Ledger connection*, *Post*. Never user-facing: TaxType, TaxCodeRef, class (generic),
department, dimension, line amount type.
Code facts: `458-recon.md` (file:line for everything below).

## 0. Problem, success, scope by exclusion

**Problem.** Both bill mappers send each line's Account and nothing else. Xero then applies each account's
default tax code and reads amounts as tax-exclusive, so a bill whose lines include VAT gets VAT added twice;
QuickBooks outside the US needs a tax code per line once VAT is on and otherwise posts a gross total over
untaxed lines. Class, Location, Customer, Billable and Xero tracking are lost on every post. Prod has 0 ledger
connections today, so nothing has been posted wrong yet. This is the window to fix it.

**Success (testable, measured at close):**
- S1. Every bill posted to QBO or Xero carries a Tax code on every line and the Tax basis on the bill (mapper
  tests, both providers, all three bases).
- S2. No held value is dropped silently: for every row of the Q6 table, a held value the ledger or plan can't
  take fails a named **blocking** Check (a Check test per row), and `integration-push-selection` refuses to
  post (a selection test).
- S3. After posting, a ledger tax total that differs from the invoice's, or any Xero `Warnings`, puts a warn
  Check on the bill (a push test per provider).
- S4. The correction path resends each line's existing tax code (a test, ADR 0011).
- S5. Supplier rules learn Account + Tax code + Tracking + Location and never Customer/Billable (model tests);
  Accounting's rule list reads the full set back (captured at 1440 and 390, detector clean to residue).
- S6. `npm test` green, `tsc --noEmit` clean, `/code-review` P0 = P1 = 0.

**Not in this ticket:**
- Deferred: the coding-row UI that *edits* these fields and the Bill-header Location/Tax basis controls, owned by
  #369, which is blocked on this ticket. Item lines are #459/#460. Attachments are #461.
- Rejected (ADR 0014): DocuBite computing VAT amounts; per-provider field names; warn-instead-of-block;
  back-filling posted bills; corrections for anything but an Account change.
- Unchanged: the CSV export keeps the Account only; with no ledger connected, none of these fields exist.
  Sage stays connect-only.

## DRAFT decisions reached in session 1 (recommended answers; next session turns these into §1–§7 + preflight)

- **Step order** (ticket 1–5 renumbered, because the pre-fill reads the rule set): 1 capabilities + reference sync ·
  2 rules learn the set (schema + learn, ticket step 5 backend half) · 3 line/bill coding model + pre-fill · 4 Checks +
  eligibility + push-time gate · 5 mappers + read-back · 6 Accounting rule line (surface) · G1–G3. 6 steps, ~5 states.
- **Capabilities**: `IntegrationConnection.ledgerCapabilities Json?` + `ledgerCapabilitiesReadAt` (ledgerCurrency
  precedent). Pure `deriveQuickBooksCapabilities(companyInfo, preferences)` / `deriveXeroCapabilities(trackingCategories)`
  → `{ plan, vat, tracking, trackingCategories[≤2 {id,name}], location, customer, billable }`. QBO: vat=UsingSalesTax;
  tracking=Plus/Advanced && ClassTrackingPerTxnLine (one category "Class"); location=Plus/Advanced && TrackDepartments;
  customer=true; billable=Plus+ && BillableExpenseTracking. Xero: vat=true, tracking=active categories, rest false.
  Read in `syncAccountingEntities` (connect + every sync) and after a QBO 5030 (parse Fault body in
  `quickbooks/errors.ts` → `quickbooks_feature_not_supported`, re-read, fail terminal). Null/stale at push → read (reuse
  window like `readLedgerCurrency`); read failure = retryable, never post on a guess.
- **References** stay in `AccountingEntity`: new entityTypes `tracking_option`, `location`, `customer`; additive columns
  `parentExternalId`, `parentName` (tracking category), `taxRatePercent Decimal?`, `forPurchases Boolean?`,
  `defaultTaxCode String?` (on accounts: QBO Account.TaxCodeRef / Xero Account.TaxType). Xero tax_rate externalId =
  TaxType (old name-keyed rows go inactive at next sync — no data migration). QBO tax rates read for the percent.
  Customer list: note QBO paging (1000/page) in the client.
- **Line model** (`codingData.items[i]`, snake_case like `LineAccountRow`): `tax_code`, `tax_code_source`
  (account_default|supplier|manual), `tracking` [≤2 {category_id, option_id}], `customer`, `billable`. Bill:
  `codingData.location`, `tax_basis` (inclusive|exclusive|none|null), `tax_basis_source` (inferred|manual). Pure module
  `lib/finance/line-coding.ts`. Basis inference: Σlines≈subtotal (tax>0) → exclusive; ≈total with tax>0 → inclusive;
  tax 0/absent and ≈total → none; else null → *Tax basis unclear*. Tax code: rule's code only when the line kept the
  rule's Account, else the Account's default. Tracking pre-fills on lines kept on the rule's Account; Location from the
  rule. **Pre-fill never fills a value the ledger can't take now** (skipped), and re-resolution on Save review keeps
  `manual` values, re-derives the rest — so a held-invalid pre-filled value is cleared by Save review (the Check's fix
  sentence says so until #369 adds per-cell clear).
- **Checks** `lib/checks/line-coding.ts` pure `checkLineCoding(...)` → CheckResult[]; one function read by (a)
  `runDeterministicChecks` (codes added to FAIL_BY_DEFAULT), (b) `resolveSelectionEligibility` (reason = Check message),
  (c) push-time `gateLineCoding` → `failPreflight`. Codes: `vat_off_in_quickbooks`, `tax_code_not_in_ledger`,
  `tax_code_missing` (VAT on, line has none), `tracking_off_in_ledger`, `tracking_option_not_in_ledger`,
  `ledger_has_no_location`, `ledger_cannot_take_customer`, `billable_off_in_quickbooks`, `billable_needs_customer`
  (QBO 6310), `tax_basis_unclear`, `vat_mismatch_invoice` (expected VAT from synced rates vs `tax_total`, tolerance
  max(amountTolerance, 0.01×lines)). Each code gets an `action-helpers.ts` sentence (Standards #9).
- **Mappers**: QBO `GlobalTaxCalculation` (TaxInclusive|TaxExcluded|NotApplicable; NotApplicable + no TaxCodeRef when
  VAT off), line `TaxCodeRef`, `ClassRef`, `CustomerRef`, `BillableStatus`, bill `DepartmentRef`; TotalAmt unchanged.
  Xero `LineAmountTypes` (Inclusive|Exclusive|NoTax), `TaxType`, `Tracking[{Name, Option}]`. NormalizedBill gains
  taxBasis, location, subtotal, taxTotal, per-line taxCode/tracking/customer/billable (snapshot → retries resend same).
  createBill returns `{id, totalTax, total, warnings[]}`; differing tax or any Warnings → persisted **warn** Check
  (`ledger_vat_differs`, `ledger_warnings`) — ADR 0014 wins over the #447 research's "treat as failed post". Correction:
  add a test proving TaxCodeRef/TaxType resend. QBO TaxInclusive line-amount semantics are unverified (research) —
  read-back is the guard; flag as engineering open question.
- **Rules**: `SupplierAccountRule` + `taxCodeExternalId?`, `tracking Json?`, `locationExternalId?`; learn from the
  largest line + bill Location; never Customer/Billable; a set change with the same Account returns no change (no
  corrections).
- **Surface** (`supplier-accounts-table.tsx`): under Usual account, a `text-xs text-slate-600` line
  `Tax code: ‹name› · ‹category›: ‹option› · Location: ‹name›` (only parts held; none → no line); a reference no longer
  in the ledger reads `‹name› (no longer in ‹ledger›)` and is not pre-filled. Intro copy names the set. **Forget gains
  a ConfirmDialog** (H5; it now deletes the whole set): "Forget ‹supplier›'s usual coding?" / consequence line / Forget
  · Cancel, focus returns to the row's Forget. Detail-pane learned sentence stays account-only (not this ticket).
  States: QBO mixed table, Xero two-tracking table, empty, non-owner, forget-confirm — ×1440/390.
