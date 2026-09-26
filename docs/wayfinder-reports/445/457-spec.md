# #457 Build: company currency — spec

Source of truth: *Decide the company currency* (#446) resolution, ADR 0013, CONTEXT.md
"Company currency". This spec does not re-decide; where the decision was silent it states the
smallest reversible choice and says what decided it. Mode: Operate (Admin, Integrations).
Skills: Intent `specify` · `fortify` · `articulate` · `include`; Impeccable `clarify` → `harden`
→ `polish`; `craft-floor.md`. Headcount: `product:product-requirements` framing only (below).

## 0. Problem, success, scope by exclusion
- Problem: companies default to USD/US, the app offers every ISO currency, the ledger's own
  currency is never read, so a Lesotho company can post LSL bills into a ZAR Xero book silently.
- Success: no company can be created, migrated or seeded outside {LS/LSL, LS/ZAR, ZA/ZAR}; no
  bill posts to a ledger whose home/base currency differs; every amount renders `LSL 1,234.50`.
- Excluded: converting to fit the ledger; changing a company's country; multi-currency ledgers;
  Sage currency read (Sage is `live: false` — its card shows no currency line); document
  (supplier) currencies — a USD supplier invoice is still a USD document converted to the
  company currency.

## 1. Model (backend) — `lib/geo/company-currency.ts` (new, client-safe)
- `COMPANY_COUNTRIES = ["LS", "ZA"]` with labels Lesotho / South Africa.
- `allowedCurrencies(country)`: LS → [LSL, ZAR]; ZA → [ZAR]; else [].
- `defaultCurrency(country)`: LS → LSL, ZA → ZAR, else null. `isAllowedPair(country, currency)`.
- `personalCountry(detected)`: LS/ZA kept, anything else → ZA (decision 1: falls back to ZAR).
- `models/workspaces.ts` `createWorkspaceForUser`, `models/organizations.ts`
  `addCompanyToOrganization`: remove `|| "USD"`; refuse an unsupported country or pair with
  error code `company_country_unsupported` / `company_currency_not_allowed` (mapped in
  `action-helpers.ts`: "DocuBite works with companies in Lesotho and South Africa." /
  "A company in South Africa uses ZAR.").
- `prisma/schema.prisma`: `Workspace.country` default "ZA", `baseCurrency` default "ZAR";
  `IntegrationConnection` gains `ledgerCurrency String?` and `ledgerCurrencyReadAt DateTime?`
  (additive migration).
- USD literals in `lib/gates/{supplier-trust,match-variance,smb-ceiling,confidence-band}.ts`,
  `models/{approval-notices,organizations,workspaces}.ts`, `lib/claims/totals.ts`,
  `lib/tax/regions/us.ts` callers: a fallback becomes the company's `baseCurrency` (passed in),
  never a literal. `lib/geo/iso-lists.ts` currency list is no longer used by company forms.
- **Lock** — `models/company-currency.ts` `getCurrencyLock(workspaceId)` →
  `{ locked: false } | { locked: true, cause: "bill", provider, at } | { locked: true, cause:
  "payment_batch", at }`: earliest `IntegrationPush` with `status = "succeeded"` (by
  `completedAt`) vs earliest `PaymentRun.createdAt` (any status); the earlier wins.
- `countUnpostedDocuments(workspaceId)`: documents with no succeeded push (the set
  `applyFxToDocument` re-runs on).
- `changeCompanyCurrency(workspaceId, currency, actorId)`: in one transaction re-reads the lock
  and the pair; refuses `company_currency_locked` / `company_currency_not_allowed`; no-op if
  unchanged; updates `baseCurrency`, writes audit `company_currency_changed {from,to,count}`;
  then re-runs `applyFxToDocument` on each unposted document (idempotent). Returns `{ count }`.
- Action `changeCompanyCurrencyAction(companyId, currency)` in
  `app/(app)/workspaces/[workspaceId]/admin/companies/actions.ts`: `requireMember(…,["owner"])`
  on `companyId`; `revalidatePath` for Admin › Companies (list + `[companyId]`) and Admin ›
  Integrations of that company.

## 2. Migration, Owner notice, seed (backend)
- `models/company-currency-migration.ts` `migrateCompanyCurrencies({ dryRun })`, run by
  `scripts/migrate-company-currency.ts [--dry-run]`. For each workspace whose currency is not
  LSL/ZAR or whose country is not LS/ZA:
  - locked (a succeeded push exists) → on the support list (printed + written to
    `logs/company-currency-support-list.json`), untouched.
  - else → country LS keeps LS and gets LSL; ZA → ZAR; any other country becomes ZA/ZAR (the
    Personal fallback; decision 1). Re-run conversion on unposted documents.
  - if any `ApprovalWorkflowStage.minAmount` is set, one email per Owner via `sendReminderEmail`:
    subject "Currency changed to LSL", body "Currency changed to LSL. Check your approval
    limits; they were set in USD.", action "Open approval flows". Idempotent: skipped when the
    audit `company_currency_migrated` already exists for the workspace.
- `prisma/seed.ts`: Riverside LS/LSL, Harbor Lights ZA/ZAR, Northwind ZA/ZAR, Pine Street LS/LSL,
  Personal ZA/ZAR; `lib/notices/fixtures.ts` amounts in ZAR.

## 3. Ledger currency (backend)
- `lib/integrations/quickbooks/client.ts` `getHomeCurrency(realmId, connectionId)` — `/preferences`
  `CurrencyPrefs.HomeCurrency.value`; `lib/integrations/xero/client.ts` `getBaseCurrency(…)` —
  `/Organisation` `BaseCurrency`. Both return the ISO code or throw.
- `lib/integrations/ledger-currency.ts` `readLedgerCurrency(connection)` → stores
  `ledgerCurrency`/`ledgerCurrencyReadAt`; on failure leaves the stored value, returns null.
  Called at connect (Nango webhook `app/api/webhooks/nango/route.ts:104`, beside
  `syncAccountingEntities`; failure never blocks the connect) and before each push in `attemptIntegrationPush`.
- `lib/checks/ledger-currency.ts` `checkLedgerCurrency({ provider, ledgerCurrency,
  companyCurrency })` → `CheckResult` `checkCode: "ledger_currency_differs"`, fail message
  "Ledger currency differs", detail "Xero keeps its books in ZAR; this company's currency is
  LSL." Pass when equal.
- In `attemptIntegrationPush` (bill-shaped pushes, before `preflightAgainstCache`): fresh read;
  unreadable → transient error `ledger_currency_unreadable` (retried by the backoff, never
  posts); mismatch → review task `push_preflight` with the detail (same dedupe as
  `preflightAgainstCache`) and `IntegrationPermanentError("ledger_currency_differs")`.
  `action-helpers.ts` maps both codes to the detail copy / "Couldn't read Xero's currency yet.
  It's checked again before each bill is posted."

## 4. Shared formatter (surface — renders in 14 files)
- `lib/money.ts` `formatCurrency(amount, code)` → `LSL 1,234.50` (ISO code, U+00A0, `en` grouping,
  2 decimals, minus after the code: `LSL -1,234.50`, null/NaN → "—"). Any ISO code (supplier
  documents may be USD). `formatMoney` (debug) stays.
- Every inline formatter listed in `logs/scratch-457/recon.md` §9 and `components/payments/
  format.ts` is replaced by `formatCurrency`; their `?? "USD"` fallbacks take the company
  currency. Check: `grep -rn "Intl.NumberFormat" app components lib models | grep -i currency`
  returns only `lib/money.ts`; `grep -rn '"USD"' app components lib models --include=*.ts*`
  (tests excluded) returns only `lib/geo/country-currency.ts`, `lib/fx/rates.ts`,
  `lib/tax/regions/us.ts`.
- `lib/analytics/workspace-analytics.ts` `resolveCurrency` prefers `workspaceBase`; the tax
  currency is dropped from the choice.

## 5. Surfaces

### 5.1 Creation forms — `components/workspace/new-workspace-form.tsx`, `companies-queue.tsx` AddCompanyDialog
- One shared field pair `components/workspace/company-country-currency-fields.tsx`
  (two `<select>`s with the classes both forms use today, e.g. `companies-queue.tsx:325`;
  labels "Country", "Company currency"), used by both forms; `buildCountryList`/
  `buildCurrencyList` leave both forms.
- Country: Lesotho, South Africa (only). Default: the detected country if LS/ZA, else South
  Africa. Currency: LS → LSL (default) / ZAR; ZA → ZAR shown as the select's only option, disabled,
  with hint "Companies in South Africa use ZAR." LS hint: "LSL and ZAR are pegged 1:1. You can
  change it until the first bill is posted." Changing country resets the currency to its default.
- The hints are `aria-describedby` on the currency select. Server refusal (§1 codes) shows as the
  form's existing error line with the values kept.

### 5.2 Currency row — `components/admin/company-detail.tsx`
Row data (added to `CompanyDetailRow` in `lib/admin/companies.ts`): `lock`, `unpostedCount`,
`allowedCurrencies`.
- Owner, unlocked, LS company: `LSL` + a link-styled `<button>` "Change" → dialog §5.3.
- Locked (any role): `LSL · locked since the first bill was posted to Xero on 12 Sep 2026` or
  `LSL · locked since the first payment batch was created on 12 Sep 2026` (date `d MMM yyyy`).
- Reviewer/Member, or ZA company: the plain value.

### 5.3 Change dialog — `components/admin/change-currency-dialog.tsx` (wraps `ConfirmDialog`)
- Title "Change the company currency to ZAR?" (target = the other allowed currency).
- Description: "LSL and ZAR are pegged 1:1, so amounts and approval limits keep their values.
  14 unposted documents will be re-converted to ZAR." · 1 → "1 unposted document will be…" ·
  0 → "No unposted documents need re-converting."
- Buttons "Change to ZAR" (primary, not destructive) and "Cancel". Busy: "Changing…", both
  disabled.
- Success: dialog closes, focus returns to the opener, toast "Company currency changed to ZAR."
  then the caller refreshes: in Companies, `CompanyDetail` gets an `onChanged` prop from
  `loadDetail` that calls the queue's `afterMutation(row.id)` (`companies-queue.tsx:221` — push +
  `router.refresh()`, the refreshed rows remount the pane so its client-loaded detail reloads,
  as rename does; focus then goes to the Change button via the queue's `paneFocusPending`
  pattern, or to the pane heading if the row became locked); on the card, `onChanged()`. The
  pane row, the Companies table's Currency column and the card show ZAR in the same tick.
- Refused because locked since opening: dialog stays, `confirmDisabled`, children line
  "Couldn't change it: the company was locked when the first bill was posted to Xero on 12 Sep
  2026." then refresh on Cancel. Other failure/network: children line "Couldn't change the
  currency. Nothing was changed. Try again." `role="alert"`, button re-enabled.
- Reversal: the same Change control changes it back while unlocked.

### 5.4 Connection card — `integrations-manager.tsx` `AccountingConnectionCard`
New props from the page: `companyCurrency`, `lock`, `unpostedCount`, `allowedCurrencies`. A line
under the tenant row, `text-sm`, only for QuickBooks/Xero with status connected:
- `ledgerCurrency` null: "Couldn't read Xero's currency yet. It's checked again before each bill
  is posted."
- equal: nothing (H8).
- differs: fact "Xero keeps its books in ZAR; this company's currency is LSL." then one outcome:
  - Owner, unlocked, ledger currency allowed for the country → button "Switch this company to
    ZAR" opening §5.3 (`restoreFocusTo` the button).
  - non-Owner, unlocked, allowed → "Ask an Owner to change the company currency."
  - locked, or the ledger currency not allowed for the country (e.g. USD, or LSL for a ZA
    company) → "Bills won't post until they match. Change the home currency in Xero, or contact
    support." (QuickBooks: "home currency"; Xero: "base currency" in this sentence.)
- The mismatch line uses the amber warning tone already used by "needs reconnect"; icon + text,
  never colour alone.

## 6. States (the capture round — 10, ×1440/390)
S1 new-company form, LS selected (LSL/ZAR) · S2 Add company dialog, ZA (ZAR fixed + hint) ·
S3 Currency row Owner unlocked (Change) · S4 Change dialog open (count 14) · S5 row locked (bill) ·
S6 row as Member (plain) · S7 card mismatch Owner (Switch) · S8 card mismatch non-Owner · S9 card
locked · S10 card couldn't-read. Seed: `scripts/dev/seed-457.ts <state>` (G1).

## 7. Accessibility (`include`)
Change/Switch are `<button>`s with visible text; dialog focus lands on "Change to ZAR"
(ConfirmDialog's default for a non-destructive confirm, `confirm-dialog.tsx:76-82`; the change is
reversible until locked), Esc closes, focus returns to the opener; result toast is polite, error line
`role="alert"`; selects are labelled `<label for>`; the lock reason is visible text, not `title`;
targets ≥ 24px (44px below md).

## 8. Lessons applied
Every server action has a caller (B1); no `window.confirm`; client files import nothing from
`models/*` (constants in `lib/geo/company-currency.ts`); `revalidatePath` + `router.refresh` on
every mutation; admin vocabulary says "company", never "workspace".
