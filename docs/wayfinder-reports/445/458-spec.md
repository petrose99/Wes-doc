# #458 Build: line Tax code, Tax basis and Tracking — spec

Owner: autopilot (owner's delegation: recommended answers taken) · Created 2026-09-26 · Status: ready for build.
Decision: #448 (resolution comment, Q6 table) and ADR 0014. Nothing here re-decides them.
Vocabulary (`CONTEXT.md`): *Tax code*, *Tax basis*, *Tracking*, *Location*, *Customer*, *Billable*, *Check*,
*Supplier account rule* ("usual account" in copy), *Ledger connection*, *Post*. Never user-facing: TaxType,
TaxCodeRef, class (generic), department, dimension, line amount type, "rule", "coding set".
Code facts: `458-recon.md`. Pre-flight: `458-preflight.md`. Critic: `458-critic.md` (reconciled below, rev 2).

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
  take fails a named **blocking** Check (a Check test per row); selection eligibility and the push-time gate
  both refuse (a test each). A ledger whose VAT setting can't be read is never posted to.
- S3. After posting, a ledger tax total that differs from the invoice's, or any Xero `Warnings`, puts a warn
  Check on the bill (a push test per provider).
- S4. The correction path resends each line's existing tax code (a test per provider, ADR 0011).
- S5. Supplier rules learn Account + Tax code + Tracking + Location and never Customer/Billable (model tests);
  Accounting's supplier table reads the full set back (captured at 1440 and 390, detector clean to residue).
- S6. `npm test` green, `tsc --noEmit` clean, `/code-review` P0 = P1 = 0.

**Not in this ticket:**
- Deferred to #369 (blocked on this ticket): the coding-row UI that *edits* Tax code / Tracking / Customer /
  Billable, the Bill-header Location and Tax basis controls, per-part clear, and the "not set when posted" reading
  on bills posted before these fields. Item lines #459/#460. Attachments #461. The Detail-pane "learned" sentence
  stays account-only. A "change" control on the supplier table (CONTEXT names one) predates this ticket and stays
  out. Check rendering is the existing Checks UI (no change).
- Rejected (ADR 0014): DocuBite computing VAT amounts it sends; per-provider field names; warn-instead-of-block;
  back-filling posted bills; corrections for anything but an Account change.
- Unchanged: the CSV export keeps the Account only; with no ledger connected none of these fields exist.
  Sage stays connect-only (capabilities all-false; nothing posts to Sage).

## 1. Step 1 — Ledger capabilities (backend)

**One migration `20260927090000_add_line_coding_dimensions`** (additive, nullable; holds every column this ticket
adds so later steps touch no schema): `IntegrationConnection.ledgerCapabilities Json?`, `ledgerCapabilitiesReadAt
DateTime?`; `AccountingEntity` + `parentExternalId String?`, `parentName String?`, `taxRatePercent Decimal?
@db.Decimal(7,4)`, `forPurchases Boolean?`, `defaultTaxCode String?`; `SupplierAccountRule` + `taxCodeExternalId
String?`, `tracking Json?`, `locationExternalId String?`. New `entityType` strings (no enum): `tracking_option`,
`location`, `customer`. Add `SupplierAccountRule` to `WORKSPACE_SCOPED_MODELS` (`lib/workspace-scope.ts`) in the
same commit (Standard 1; pre-existing gap closed here).

**Interface — `lib/integrations/ledger-capabilities.ts`** (pure derive + thin read, `ledger-currency.ts` precedent):
```ts
type LedgerCapabilities = { vat: boolean; tracking: { id: string; name: string }[] /* ≤2, [] = off */;
  location: boolean; customer: boolean; billable: boolean }
deriveQuickBooksCapabilities(companyInfo, preferences): LedgerCapabilities | null
deriveXeroCapabilities(trackingCategories): LedgerCapabilities
parseLedgerCapabilities(json: unknown): LedgerCapabilities | null        // shape mismatch → null, never throws
readLedgerCapabilities(connection, now = new Date(), reuseMs = 0): Promise<LedgerCapabilities>
```
QBO: `plus = OfferingSku ∈ {Plus, Advanced}`; vat = `TaxPrefs.UsingSalesTax`; tracking = plus &&
`ClassTrackingPerTxnLine` → `[{id:"class", name:"Class"}]`; location = plus && `TrackDepartments`; customer = true;
billable = plus && the billable-expense preference (verify the exact key against the API at build; test fixture
names it). **Invariant — never post on a guess:** a missing `UsingSalesTax` or `OfferingSku` → derive returns null →
`readLedgerCapabilities` throws `IntegrationRetryableError("ledger_capabilities_unreadable")`. A missing
tracking/location/billable flag reads `false` (false blocks a held value; it never drops one). Xero: vat = true;
tracking = ACTIVE categories, first 2 in Xero's order; the rest false.
`readLedgerCapabilities` takes the connection row, reuses stored values within `reuseMs`, else reads and writes
with `updateMany({ where: { id, workspaceId } })` (Standard 1). Push reuses ≤ 24 h; sync and 5030 read fresh.
Clients: QBO `getCompanyInfo()`, `getPreferences()`; Xero `listTrackingCategories()` (options + status).
Called from `syncAccountingEntities` first thing (connect + every sync).
Seams: derive both providers incl. missing-VAT → null, parse → `lib/integrations/ledger-capabilities.test.ts`
(new; read tested with an injected client + mocked prisma); client reads → `{quickbooks,xero}/client.test.ts`;
sync stores capabilities → `lib/integrations/sync.test.ts`.

## 2. Step 2 — Reference sync (backend)

QBO `client.ts`: `listClasses()`, `listDepartments()`, `listCustomers()` (paged `STARTPOSITION`/`MAXRESULTS 1000`
until a short page), `listTaxCodes()` widened to purchase-rate codes + percent via `listTaxRates()`,
`listAccounts()` adds `TaxCodeRef`. Xero `client.ts`: `listTaxRates()` returns `{taxType, name, percent,
canApplyToExpenses, active}`; `listAccounts()` adds `TaxType`; tracking options from step 1's read.
`syncAccountingEntities` (`sync.ts:16`) upserts `tracking_option` (parent = category), `location`, `customer`,
widened `tax_rate` and account `defaultTaxCode`, with the existing mark-unseen-inactive per type. Xero tax_rate
`externalId` = TaxType (old name-keyed rows go inactive on the next sync; nothing reads their ids and 0 bills are
posted — no data migration). Only `forPurchases` codes are ever offered or pre-filled.
`models/accounting-entities.ts`: widen the entityType union on both list functions and add a `connectionId`
parameter to `listAccountingEntitiesIncludingInactive` (callers updated). After a sync, `refreshLineCodingChecks
ForConnection` (step 4) re-runs — wired in step 4, not here.
Seams: paging + widened reads → `{quickbooks,xero}/client.test.ts`; new types, TaxType key, inactive marking →
`lib/integrations/sync.test.ts`; list widening → `models/accounting-entities.test.ts` (new if absent).

## 3. Step 3 — Rules learn the set; line and bill coding model; pre-fill; Tax basis (backend)

**Model.** `codingData.items[i]` (snake_case, `LineAccountRow` precedent) gains `tax_code: string|null`,
`tax_code_source: "account_default"|"supplier"|"manual"|null`, `tracking: {category_id, option_id}[]` (≤2),
`customer: string|null`, `billable: boolean` (default false). Bill: `codingData.location`, `location_source`,
`tax_basis: "inclusive"|"exclusive"|"none"|null`, `tax_basis_source: "inferred"|"manual"|null`. Schema comment at
`schema.prisma:611-623` updated.
**Pure `lib/finance/line-coding.ts`:**
- `inferTaxBasis({lines, subtotal, taxTotal, total, currency})` (tolerance = `amountTolerance` × line count):
  Σ≈subtotal and tax>0 → `exclusive`; Σ≈total and tax>0 → `inclusive`; tax 0/absent and Σ≈total → `none`;
  otherwise `null` (→ *Tax basis unclear*).
- `resolveLineCoding({line, prior, rule, accountDefaults, capabilities, references})`: `manual` kept as-is (the
  Check reports it if now invalid); otherwise Tax code = rule's code **only when the line kept the rule's Account**,
  else the Account's `defaultTaxCode`, else null; Tracking from the rule only on lines kept on the rule's Account;
  Location from the rule. **Pre-fill never fills a value the ledger can't take now** (inactive, not forPurchases,
  capability off) — it leaves it null. QBO VAT off → tax_code null, basis `none`.
- Called from `resolveDocumentCodingItems` (`models/documents.ts:659`) on every Save review; non-manual values
  are re-derived each time.
**Rules.** `learnSupplierAccountRuleFromApproval` (`models/documents.ts:763`) stores, from the largest line with
an account: Account, `tax_code`, `tracking`; plus the bill's `location`. Never Customer/Billable. A change is
returned only when the **Account** is retargeted — a Tax code/Tracking/Location change on the same Account updates
the row and returns no change (no correction offered). `listSupplierAccountRules` selects the new fields
(`SupplierAccountRuleRow` + `taxCodeExternalId`, `tracking: {categoryId, optionId}[]` parsed tolerant (bad JSON →
`[]`), `locationExternalId`).
**Glossary (Standard 8), same commit:** CONTEXT *Tax code* — "pre-filled from the supplier's usual Tax code when
the line keeps the supplier's usual account, otherwise the ledger's default for the line's Account".
Seams: `inferTaxBasis` (4 branches, tolerance, zero-decimal), `resolveLineCoding` (rule vs default, kept Account,
manual kept, invalid never pre-filled, VAT off) → `lib/finance/line-coding.test.ts` (new); coding write + learn set /
never Customer-Billable / same-Account change returns none → `models/documents.test.ts` (:695);
list shape + tolerant parse → `models/supplier-account-rules.test.ts`.

## 4. Step 4 — Snapshot fields, coding Checks, eligibility, push gate, 5030 (backend)

**Snapshot.** `NormalizedBill` (`integration-bill-mapping.ts:22`) gains `taxBasis`, `location`, `subtotal`,
`taxTotal`; `NormalizedLineItem` gains `taxCode`, `tracking` (`[{categoryId, categoryName, optionId,
optionName}]` — names resolved at snapshot time), `customer`, `billable`. `normalizeBillFromDocument` fills them;
the persisted `payload` carries them, so a retry resends the same values (Standard 3). For `exclusive`,
`reconcileLineItemRounding` reconciles lines to `subtotal`, not `total`; `inclusive`/`none` unchanged.
**Pure `lib/checks/line-coding.ts` `checkLineCoding({lines, bill, provider, providerLabel, capabilities,
references, taxRates})` → `CheckResult[]`** — one function, input shape shared by the document path and the
snapshot path. Readers:
(a) `refreshLineCodingChecks(workspaceId, documentId)` (`models/document-checks.ts`): end of
`runDeterministicChecks`; after `resolveDocumentCodingItems` in `updateDocumentReview`; and
`refreshLineCodingChecksForConnection(workspaceId, connectionId)` at the end of `syncAccountingEntities` for that
connection's reviewed, unposted documents. A clean bill writes pass rows, so an earlier fail clears.
(b) `resolveSelectionEligibility` gains `opts.lineCodingFail: string|null`, computed **fresh** by the caller
(`checkLineCoding` over stored capabilities + references, never the persisted rows); the same in
`pushDocumentToConnection`. The reason is the first fail's title.
(c) `gateLineCoding(snapshot, connection)` in `lib/integration-push.ts` beside `gateLedgerCurrency` →
`failPreflight` (review task + `IntegrationPermanentError`), from `readLedgerCapabilities(reuse 24 h)` and the
snapshot. A capabilities read failure is retryable (never posts).
(d) QBO 5030: `quickbooks/errors.ts` parses the Fault body → `quickbooks_feature_not_supported`; the push path
re-reads capabilities fresh (reuse 0), re-runs (c) for the review task's Check, and fails terminal.
All codes are **fail** (added to `FAIL_BY_DEFAULT`). Fix sentences name only what can be done **today** (no edit
control until #369): Save review re-derives non-manual values; ledger settings + Sync accounts fix the rest.

| checkCode | Fires when | Check title | Fix sentence (`action-helpers.ts`) |
|---|---|---|---|
| `vat_off_in_quickbooks` | QBO vat=false, a line holds a tax_code | VAT is off in QuickBooks | Turn VAT on in QuickBooks and sync accounts, or save review to clear the Tax codes. |
| `tax_code_not_in_ledger` | held tax_code not an active purchase code | Tax code not in ‹ledger› | Set a purchase tax code on the line's account in ‹ledger›, sync accounts, then save review. |
| `tax_code_missing` | vat on, a line has no tax_code | Tax code missing | Set a default tax code on the line's account in ‹ledger›, sync accounts, then save review. |
| `tracking_off_in_ledger` | held tracking for a category not in capabilities | ‹Class› tracking is off in ‹ledger› | Turn ‹Class› tracking on in ‹ledger› and sync accounts, or save review to clear it. |
| `tracking_option_not_in_ledger` | option inactive/unknown | ‹option› isn't in ‹ledger› | Restore ‹option› in ‹ledger› and sync accounts, or save review to clear it. |
| `ledger_has_no_location` | bill holds location, capability off | ‹ledger› has no Location | Turn on Locations in ‹ledger› and sync accounts, or save review to clear it. |
| `ledger_cannot_take_customer` | a line holds customer, capability off | ‹ledger› can't take a Customer | Save review to clear the Customer. |
| `billable_off_in_quickbooks` | billable true, capability off | Billable is off in QuickBooks | Turn on billable expenses in QuickBooks and sync accounts. |
| `billable_needs_customer` | billable true, customer null | Billable needs a Customer | Save review to clear Billable. |
| `tax_basis_unclear` | tax_basis null | Tax basis unclear | Check the subtotal, VAT and total on the document match its lines, then save review. |
| `vat_mismatch_invoice` | Σ(line × rate per basis) vs `tax_total` beyond max(tolerance, 0.01 × lines) | VAT won't match the invoice | Check the VAT on the document, and each line's account's tax code in ‹ledger›. |
| `quickbooks_feature_not_supported` (push error) | 5030 | — | QuickBooks turned down a field this plan doesn't offer. Sync accounts, then check the bill. |
| `ledger_capabilities_unreadable` (push error) | read failed | — | Couldn't read your ledger's settings yet. They're checked again before each bill is posted. |

"save review to clear it" is true for pre-filled values (§3); a `manual` value can't exist until #369 adds the
control (and #369 owns its clear). `fields` anchor each result to `line_items[i]` paths. Customer/Billable Checks
can't fire until #369 writes those fields; they are built and tested now.
Seams: one test per row + clean-bill pass → `lib/checks/line-coding.test.ts` (new); normalize + exclusive rounding →
`lib/integration-bill-mapping.test.ts`; fail-by-default + refresh on Save review / sync →
`models/document-checks.test.ts`, `models/documents.test.ts`, `lib/integrations/sync.test.ts`; eligibility reason →
`lib/integration-push-selection.test.ts`; gate refuses + review task + unreadable retryable + 5030 re-read terminal
→ `lib/integration-push.test.ts`; 5030 parse → `lib/integrations/quickbooks/errors.test.ts` (new); every code has a
sentence → grep in the step's check.

## 5. Step 5 — Mappers, post read-back, correction resend (backend)

- QBO mapper: `GlobalTaxCalculation` = TaxInclusive|TaxExcluded|NotApplicable (VAT off → NotApplicable, no
  TaxCodeRef); line `TaxCodeRef`, `ClassRef` (tracking[0]), `CustomerRef`, `BillableStatus`; bill `DepartmentRef`.
  `TotalAmt` omitted unless basis = none (the ledger computes it — ADR 0014).
- Xero mapper: `LineAmountTypes` = Inclusive|Exclusive|NoTax, line `TaxType`, `Tracking: [{Name, Option}]` from the
  snapshot's names. A category/option renamed in Xero between enqueue and retry makes Xero reject the line → the
  existing permanent path (review task); accepted, not special-cased.
- `createBill` (both) returns `{id, totalTax, total, warnings[]}`. `attemptIntegrationPush` (:146), **after** the push
  is marked posted, writes warn Checks `ledger_vat_differs` ("‹ledger› worked out VAT of ‹amount›; the invoice says
  ‹amount›") and `ledger_warnings` ("‹ledger› flagged this bill: ‹first warning›"), each with an action-helpers
  sentence; a failure writing them is logged and never returns the push to retry (Standard 3/4).
- Correction (`account-correction-actions.ts:126` → `updateBillAccounts`): no code change; tests prove each line's
  TaxCodeRef/TaxType is resent untouched when only AccountRef changes.
- Open engineering question (not a design gap): QBO TaxInclusive line-amount semantics are unverified — the
  read-back warn is the guard; the step's commit names it.
Seams: both mappers × 3 bases + tracking/location/customer/billable → `{quickbooks,xero}/bill-mapper.test.ts`;
createBill totals/warnings → `{quickbooks,xero}/client.test.ts`; read-back warn after posted →
`lib/integration-push.test.ts`; resend → `{quickbooks,xero}/correction.test.ts`.

## 6. Step 6 — Accounting: the supplier table reads the set back (surface)

Files: `components/settings/supplier-accounts-table.tsx`, `app/(app)/workspaces/[workspaceId]/admin/integrations/
page.tsx`. Mode: Operate. Primitives only: the existing native table, `ConfirmDialog`, sonner. No new component.

**Data (page.tsx).** `codingLabels: Record<string, {label, active, categoryName?}>` from this connection's
AccountingEntity rows of type `tax_rate`, `tracking_option`, `location`, including inactive
(`listAccountingEntitiesIncludingInactive(workspaceId, connectionId, type)`, step 2). Tax code label = its name,
plus ` (‹percent›%)` when the name lacks a percent. Category name = the option's `parentName`.
`categoryNames: string[]` = `capabilities.tracking[].name` (for copy). `hasLocation` = `capabilities.location`.

**Row.** Supplier · Usual account · Last used · [Forget]. Under the account text, when the rule holds any part,
one line `mt-0.5 text-xs text-slate-600`: `Tax code: ‹label› · ‹Category›: ‹option› [· ‹Category 2›: ‹option›] ·
Location: ‹label›` — only held parts, that order; nothing held → no line. Each part is a `whitespace-nowrap` span;
the line wraps only between parts, at every width. A part whose reference is inactive reads `‹label› (no longer
in ‹ledger› — not pre-filled)`; one with no entity row reads `‹formatUnresolvedAccountId(id)› (no longer in
‹ledger› — not pre-filled)` — same `text-slate-600` tone as the archived-account parenthetical (`:112`), no amber
(amber stays "action waiting", the reminder line). Reminder line unchanged, below. Type: `text-sm` body, `text-xs`
detail at both widths; no new sizes. At 390 the table keeps its current four columns; the account cell stacks
account → detail → reminder and wraps between parts; no horizontal scroll introduced (a long supplier name wraps
at word boundaries as today).

**Copy (articulate).** ‹Tracking› below = the ledger's own category names joined ("Class"; "Region and
Department"); omitted when `categoryNames` is empty. ‹and Location› only when `hasLocation`.
- Panel note (page.tsx): "Each supplier's usual account, learned from approved documents."
- Intro (table): "The account of the largest line on a supplier's most recently approved document, with that
  line's Tax code‹, Tracking›‹ and the bill's Location›. The Tax code is pre-filled only on lines kept on that
  account. Forget a supplier to learn it again from their next approval."
- Empty: "Supplier accounts fill in as documents get approved — the account of the largest line becomes that
  supplier's usual, with its Tax code‹ and Tracking›."
- Forget confirm — title "Forget ‹supplier›'s usual account?"; description "DocuBite stops pre-filling
  ‹account label›‹ and its ‹held parts, named: "Tax code", the held category names, "Location"; joined with
  commas and 'and'›› for ‹supplier›. Bills already posted don't change. Their next approved document learns it
  again."; Cancel · **Forget** (destructive). Toast (unchanged): "Forgot ‹supplier›'s usual account".
- Forget failure, dialog stays open, a `role="alert"` line inside (`children`): server error → "Couldn't forget
  it. ‹server message›" (server fallback "Could not forget this supplier's usual account"); thrown/offline →
  "Couldn't reach DocuBite. Check your connection and try again." Nothing is removed; Forget can be pressed again.

**Mechanism.** `forget` wraps the action in `try/catch` inside the transition (a throw never reaches the route's
`error.tsx`). Success order: `toast.success` → set `pendingFocusAfter = ‹index in visible rows›` (state) → close the
dialog → `router.refresh()`. An effect keyed on `rules` (and `pendingFocusAfter`) focuses, among **visible** rows,
the Forget at the same index (the next row), else the last row's, else the intro paragraph (`tabIndex={-1}`,
`id="supplier-accounts-intro"`) or the empty text (`tabIndex={-1}`); never `body`. ConfirmDialog's own opener
return fires first on close and is superseded by this effect on success; on Cancel/Esc it lands on the opener.

**States (captured):** S1 QBO mixed (full row, account-only row, row with a stale Class, row with a reminder) · S2 Xero
two-tracking · S3 empty · S4 non-owner (no Forget column, no reminder buttons, detail line shown) · S5 forget-confirm
open · S6 forget-error (offline around Forget). ×1440/390 = 12 frames. Filter (>20) and no-match unchanged.
Keyboard probes: S5 Esc → `#forget-rule-‹id›`; S1 Forget → Confirm → activeElement is the next row's Forget;
S6 alert text present, dialog still open.

**Accessibility (include).** Forget: `id="forget-rule-‹id›"`, `aria-label="Forget ‹supplier›'s usual account"`, no
sr-only span. ConfirmDialog: initial focus Cancel (destructive, `confirm-dialog.tsx:83`), trap, Esc/Cancel → opener
via `restoreFocusTo` as a `RefObject` (never `.current` as a prop — lesson #297). Busy: spinner on Forget, both
buttons disabled; the alert line is `role="alert"`. The parenthetical is text, never colour-only. Detail line is
plain text read after the account.

## 7. Build gate

Every backend step: red test → green → `vitest <its seams>` → `tsc --noEmit` (dev server stopped); new files get
one `eslint`. Step 6: craft-floor read in session, static `impeccable detect` on the two files, then G1–G3
(`phases/build.md`). Close: `npm test`, `tsc`, `/code-review` (Standards + Spec) P0 = P1 = 0, critique ≥ 32,
evaluate ≥ 85, gate clean at both widths.
