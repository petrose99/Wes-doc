# #459 Build: item lines on QuickBooks and Xero bills — spec

`kind: backend` throughout (no `app/**`/`components/**` rendering file touched — the coding row's
Account-cell UI is #460). Design pass (Intent/Impeccable, items 1–4 of the spec phase) **not owed**;
this spec goes straight to the build plan, gated by G3 (tests/tsc/code-review) only. Executes #449's
decision, ADR 0015. Extends #458's capabilities/checks/mapper machinery — same shapes, same call
sites, additive only.

## 0. Scope by exclusion

In scope: item entity sync + `itemLines` capability; `item_code` on extraction; per-line item
resolution (pairing → exact code → none) and learning; blocking Checks for plan/ledger mismatch and
missing quantity; QBO/Xero mapper item lines; PO line match on shared Item. Out of scope: rendering
the Item cell or a picker (#460); fuzzy matching (ADR 0015 rejects it); back-filling posted bills
(ADR 0014 precedent); Sage (connect-only).

## 1. Step 1 — Item sync and capability (backend)

**Migration `20260928090000_add_item_lines`** (additive, nullable):
- `AccountingEntity` + `itemType String?` (raw provider value: QBO `"Service"|"NonInventory"|
  "Inventory"`, Xero `"tracked"|"untracked"` — display/debug only, never branched on for behaviour),
  `trackedInventory Boolean?` (the one flag Checks/mappers key off — true only for a QBO `Inventory`
  item or a Xero item with `IsTrackedAsInventory: true`), `purchaseAccountExternalId String?` (the
  Item's own account — QBO `ExpenseAccountRef`/`AssetAccountRef`, Xero `PurchaseDetails.AccountCode`).
  Reuse the existing `defaultTaxCode` column for an item's purchase tax code (same meaning: "the tax
  code this entity defaults to" — widen its schema comment to say so) and the existing `code` column
  for SKU/code.
- New `SupplierItemPairing` model (mirrors `SupplierAccountRule`): `id, workspaceId, connectionId,
  supplierName (normalized), matchKey (supplier code, or normalized description when none), itemExternalId,
  lastUsedAt, createdAt, updatedAt`, `@@unique([connectionId, supplierName, matchKey])`. Add to
  `WORKSPACE_SCOPED_MODELS` in the same commit.
- New `entityType` string: `"item"` (no enum, same convention as `tracking_option`/`location`).

**`lib/integrations/ledger-capabilities.ts`:** `LedgerCapabilities` gains `itemLines: boolean`.
`NONE.itemLines = false`. `deriveQuickBooksCapabilities`: `itemLines = plus` (same `OfferingSku`
Plus/Advanced test already computed for tracking/location/billable). `deriveXeroCapabilities`:
`itemLines = true` always. `parseLedgerCapabilities`: add `itemLines` to the boolean-flags array
(shape mismatch → null, unchanged contract).

**`lib/integrations/quickbooks/client.ts`:** `QuickBooksSyncedItem = { id, code: string|null (Sku),
name, itemType: string, trackedInventory: boolean, active: boolean, accountExternalId: string|null,
taxCodeExternalId: string|null }`. `listItems(realmId, connectionId)`: `select * from Item where
Active = true` (paginated, same helper as `listAccounts`), then filter in JS to rows carrying an
`ExpenseAccountRef` or `AssetAccountRef` (ticket §1) — a service item with neither is not
purchasable and is dropped, mirroring the existing JS-side `forPurchases` filter on tax codes.
`accountExternalId` = `ExpenseAccountRef?.value ?? AssetAccountRef?.value`. `trackedInventory =
itemType === "Inventory"`. `taxCodeExternalId = PurchaseTaxCodeRef?.value ?? null`.

**`lib/integrations/xero/client.ts`:** `XeroSyncedItem = { id (Code), code: string|null, name,
itemType: "tracked"|"untracked", trackedInventory: boolean, active: boolean, accountExternalId:
string|null, taxCodeExternalId: string|null }`. `listItems(tenantId, connectionId)`: `GET /Items`,
filter `IsPurchased === true`, `trackedInventory = IsTrackedAsInventory === true`, `itemType =
trackedInventory ? "tracked" : "untracked"`, `accountExternalId = PurchaseDetails?.AccountCode ??
null`, `taxCodeExternalId = PurchaseDetails?.TaxType ?? null`, `active = Status !== "ARCHIVED"`
(Xero's item status values — verify against the sandbox at build; fall back to `true` if absent, same
posture as accounts).

**`lib/integrations/sync.ts`:** `SyncRow` gains `itemType?, trackedInventory?, purchaseAccountExternalId?
(mapped from accountExternalId — the sync payload's field name matches the AccountingEntity column)`.
`fetchQuickBooksEntities`: add `capabilities.itemLines ? quickbooks.listItems(...) : none` to the
`Promise.all`, gated the same way Class/Department already are; map to
`entityType: "item", externalId, code, name, active, itemType, trackedInventory,
purchaseAccountExternalId: accountExternalId, defaultTaxCode: taxCodeExternalId`.
`fetchXeroEntities`: always calls `xero.listItems` (itemLines is always true for Xero), same mapping.
`syncAccountingEntities` needs no other change — `refreshLineCodingChecksForConnection` at its end
already re-runs `checkLineCoding` (step 3 wires the new codes into that same function), so a plan
downgrade or an item going inactive is caught on the next sync with no new call site.

**`models/accounting-entities.ts`:** widen `AccountingEntityType` union with `"item"`.

Seams: `ledger-capabilities.test.ts` — itemLines derivation both providers (QBO plan gate, Xero
always-true); `{quickbooks,xero}/client.test.ts` — `listItems` filter (no purchase account dropped,
inactive kept for name) + field mapping + tracked flag; `sync.test.ts` — item rows upserted only
when `capabilities.itemLines` (QBO), always (Xero), inactive-marking reuses the existing per-type
sweep; `models/accounting-entities.test.ts` — widened union compiles/round-trips.

## 2. Step 2 — Line model, extraction and learning (backend)

**Extraction.** `lib/domains/finance.ts`: add `{ key: "item_code", label: "Item code", type: "string",
instruction: "The supplier's own product or item code printed on this line, exactly as shown. Leave
blank if none is printed — do not infer or invent one.", required: false }` to `line_items.itemFields`
on `invoice` (line 30), `receipt` (line 59) and `purchase_order` (line 133). Not added to
`delivery_note`/`remittance_advice`/`supplier_statement` (no ledger line to code). `lib/doc-types.ts`:
widen the three `line_items` canonical-key hints (`"Array of {description, quantity, unit_price,
amount}"` → `"...amount, item_code}"`) for `invoice`, `receipt`, `purchase_order` so both hint
surfaces agree.

**Model.** `codingData.items[i]` gains `item_external_id: string|null`, `item_source:
"pairing"|"code_match"|"manual"|null` (`LineAccountSource` gains `"item"` for `account_source` — set
whenever a line resolves to an item, alongside `account_external_id` = the item's
`purchaseAccountExternalId`, read-only). Schema comment at `schema.prisma:611-627` updated with both
fields and the new `account_source` value.

**Pure `lib/finance/item-line-resolution.ts`** (new, same shape discipline as `line-account-
resolution.ts` — no Prisma, no provider calls):
```ts
export type ItemSource = "pairing" | "code_match" | "manual"
export type ItemOption = { externalId: string; code: string | null; accountExternalId: string; taxCodeExternalId: string | null; trackedInventory: boolean; active: boolean }
export type ItemPairing = { matchKey: string; itemExternalId: string }
export type ItemLineResolution = { itemExternalId: string | null; itemSource: ItemSource | null; accountExternalId: string | null; taxCodeExternalId: string | null }

export function normalizeItemMatchKey(itemCode: string | null, description: string | null): string | null
// itemCode?.trim().toLowerCase() || normalizeSupplierName(description) || null — reuses the existing
// normalizer so a pairing keyed on description matches the same casing/whitespace rules as supplier names.

export function resolveItemLine(input: {
  itemCode: string | null
  description: string | null
  prior: { item_external_id: string | null; item_source: ItemSource | null } | null
  pairings: ItemPairing[]      // this supplier's SupplierItemPairing rows
  items: ItemOption[]          // active items only (inactive never offered fresh)
}): ItemLineResolution
```
`manual` in `prior` is kept as-is (a Check reports it if the item since went inactive — no manual
picker exists until #460, but the shape is future-proofed the same way `tax_code_source: "manual"`
was in #458 before #369). Otherwise: (1) pairing — `matchKey = normalizeItemMatchKey(itemCode,
description)`; a pairing row with that key wins, resolved against `items` (drop if the paired item
is no longer active — falls through to (2)); (2) exact code match — `itemCode` (trimmed,
case-insensitive) against an active item's `code`; (3) none — every field null, the line stays an
account line untouched. **Never fuzzy** (ADR 0015): no scoring, no partial match, no fallback to
description similarity.

**Orchestration — `models/documents.ts::resolveDocumentCodingItems`:** entities query widens
`entityType: { in: [...,"item"] }`, select adds `trackedInventory, active` (already selects
`purchaseAccountExternalId`... no — reuse `defaultTaxCode`/`externalId`/`code` already selected,
add `trackedInventory`). New parallel read: `prisma.supplierItemPairing.findMany({ where: {
workspaceId, connectionId, supplierName: normalizedVendor } })` (guarded the same `!legacy &&
normalizedVendor` way as the rule read — item pairing is post-connection only, same as accounts).
For each row: `itemResolution = resolveItemLine({ itemCode: line_items[index]?.item_code, description:
line_items[index]?.description, prior: priorItems[index], pairings, items: itemOptions })`; when it
resolves, the row's `account_external_id`/`account_source` from `resolveCurrentLineAccounts` are
**overridden** to `itemResolution.accountExternalId` / `"item"` before `resolveLineCoding` runs (so
tax-code pre-fill, the ledger-reference checks and the mapper all see one final Account per line,
exactly as ADR 0015 states — read-only, no supplier-rule chain touches it). `resolveLineCoding`
(line-coding.ts) gains an optional `itemTaxCode: string | null` input; when a row carries one, its
candidate list is `[[itemTaxCode, "item"], [onRuleAccount ? rule tax code : null, "supplier"],
[accountDefaults[account], "account_default"]]` — the item's own purchase tax code wins over the
account's default. `TaxCodeSource` gains `"item"`.

**Rules — `learnSupplierAccountRuleFromApproval` (unchanged code, verified by a new test):** the
"largest line with an account" scan already filters on `item.account_external_id &&
item.account_source` — an item line's `account_source` is `"item"`, not `"supplier"`/
`"default_guessed"`/`"default_confirmed"`, and the ticket says the rule "learns from the largest
*account* line only", so the scan's candidate test gains one clause: `item.account_source !== "item"`.
Add a `SupplierItemPairing` upsert in the same function, fire-and-forget like the rule write: for
every item line on the approved document (`item_source` is `"pairing"` or `"code_match"`, never
`null`), upsert `{connectionId, supplierName, matchKey: normalizeItemMatchKey(item_code, description),
itemExternalId}` with `lastUsedAt: now`. A line whose `item_source` was already `"pairing"` just
refreshes `lastUsedAt` (same staleness precedent as the account rule).

**Glossary (Standard 8), same commit:** CONTEXT *Item* — "a product or service from the connected
ledger's catalogue; a line coded to an Item posts to the Item's own account and never shows an
editable Account." *Line match* entry gets one added sentence: "pairs on a shared Item before
description similarity."

Seams: `item-line-resolution.test.ts` (new) — pairing hit, code-match hit, no-match, manual kept,
inactive pairing target falls through to code match, never-fuzzy (a close-but-not-exact code
misses); `resolveLineCoding` item-tax-code precedence → `line-coding.test.ts`; orchestration (item
override of account_external_id/source, pairing read gated by `!legacy`, tax-code precedence
end-to-end) → `models/documents.test.ts`; `learnSupplierAccountRuleFromApproval` excludes item lines
from the account scan + upserts pairings + refreshes `lastUsedAt` → `models/documents.test.ts`.

## 3. Step 3 — Checks and correction (backend)

**Snapshot.** `NormalizedLineItem` (`integration-bill-mapping.ts`) gains `itemExternalId: string |
null` and `quantity` stays (already present) — no new field needed for the "quantity needed" Check,
which reads the existing `quantity` against `trackedInventory` from the ledger context, not the
snapshot. `lineCoding()`'s row mapping adds `itemExternalId: row?.item_external_id ?? null`.

**`lib/checks/line-coding.ts`:** `LineCodingInput.lines[]` gains `item_external_id: string | null`
and `quantity: number`. `LineCodingContext`/`loadLineCodingContext` (`models/accounting-entities.ts`)
widens its entities query to `entityType: { in: [...,"item"] }` and returns `items: Map<string,
{active: boolean; trackedInventory: boolean}>` alongside `references`/`taxRates`/`names`
(`CodingReferences` gains an `items` field so `codingReferencesFrom` stays the one place that shapes
it, same as `taxCodes`/`trackingOptions`/`locations`). Three new fail codes, added to
`LINE_CODING_CHECK_CODES` and `FAIL_BY_DEFAULT`:

| checkCode | Fires when | Check title | Fix sentence | Action |
|---|---|---|---|---|
| `item_lines_not_supported` | a line holds `item_external_id`, `!capabilities.itemLines` | ‹Ledger plan› can't take item lines | Code this line to an account instead, or upgrade the plan and sync accounts. | **"Code to ‹item's account› instead"** — runs `setLineToAccount` (a narrow server action, step 3, clearing `item_external_id`/`item_source` and leaving `account_external_id` as the item's account, already correct) only when chosen; never automatic. |
| `item_not_in_ledger` | `item_external_id` set, not in `references.items` or inactive | ‹item› isn't in ‹ledger› | Restore ‹item› in ‹ledger› and sync accounts, or save review to code this line to an account instead. | — |
| `item_quantity_needed` | `trackedInventory` true for the item, `quantity` is 0/absent | Quantity needed for ‹item› | Enter the quantity for ‹item› on this line, then save review. | — |

A service/non-inventory item with no quantity is never a fail (mapper step 4 sends `1 × amount` and
the mapped body says so in a code comment, not a Check — nothing is wrong with the data, the ledger
just needs a `Qty`). All three are **fail** (blocking), matching #458's "every result is a fail"
convention — an item line the ledger can't take is never silently posted as an account line.
`checkLineCoding` names carry the item's display name (`input.names[item_external_id]`, same map
`loadLineCodingContext` already builds for tracking) — extend that name map to include item rows.

**Action.** `setLineToAccount(workspaceId, documentId, lineIndex)` (`app/(app)/workspaces/
[workspaceId]/account-correction-actions.ts`, owner-gated like the file's other actions): clears
`codingData.items[lineIndex].item_external_id/item_source`, sets `account_source: "manual"` (a
person chose this, via the Check's action — not a fresh resolution), leaves `account_external_id`
as-is (already the item's account — the ticket's action is "code to the item's account instead", not
"clear the account too"). Re-runs `refreshLineCodingChecks` after the write so the Check clears
immediately. Wired from the Check's `detail` the same way other actionable Checks pass a callable —
follow whichever existing pattern `action-helpers.ts`/`document-checks.ts` uses for a Check with a
bound action (grep at build time; #458 had none of these, so this is the first — if no reusable
convention exists, the simplest is a `{ actionLabel, actionCode: "code_to_item_account" }` on the
`CheckResult.detail`, dispatched by the existing Check-action UI dispatcher rather than a new one).

**`lib/integration-preflight.ts` needs no change:** `preflightPush`'s account match already checks
`input.expenseAccountId` against the synced `account` entities; an item line's `account_external_id`
is the item's own account (step 2, always a real synced account), so `preflight_account_missing`
already fires correctly for it with no new code path — this satisfies the ticket's "An item line
satisfies `preflight_account_missing` through its Item's account" line for free.

**Eligibility.** `resolveSelectionEligibility` (`lib/integration-push-selection.ts:35-38`)'s
`items.some((item) => !item.account_external_id)` clause needs no change: an item line always
carries `account_external_id` (the item's account, step 2). The new fail codes reach eligibility
through the existing `opts.lineCodingFail` path (`firstLineCodingFail`), same as #458's codes — no
separate "needs an Item" reason.

**Correction (`account-correction-actions.ts` / `models/documents.ts::findBillsAffectedByAccountChange`
and `findAccountCorrectionReminders`):** both functions match a posted bill's line by
`item.account_external_id === oldAccountExternalId` — an item line's account is the *item's*
account, never a rule's, so it should never appear as "affected" by a rule/Default retarget. Add one
guard: skip a line whose `item.account_source === "item"` (i.e. read `item_source` alongside
`account_external_id` in both scans' `.filter`/`.forEach`, same pattern already used). Screen 1/2's
correction dialog (`updateSelectedBillAccountsAction` → `updateBillAccounts`) refuses per-document
when **any** selected line is an item line: `recordDocumentLineAccountsCorrected` and the provider
`updateBillAccounts` calls are line-index-scoped already (`accountRefByLineIndex: Map<number,
string>`), so the fix is to exclude item-line indices from the map the caller builds and, when a
document's *only* affected lines are item lines, surface it in `UpdateSelectedBillsResult` as
`status: "failed", error: "coded to an item — change it in ‹ledger›"` rather than silently doing
nothing — the exact refusal text ADR 0015 specifies.

Seams: three new Check rows + clean-bill pass + item name resolution → `line-coding.test.ts`;
`loadLineCodingContext` item references/names → `accounting-entities.test.ts`; `setLineToAccount`
clears item fields, keeps account, re-runs Checks, owner-gated → new
`account-correction-actions.test.ts` (or extends the existing one if present); correction scans skip
item lines, per-document refusal text → `models/documents.test.ts` +
`account-correction-actions.test.ts`; every new code has a `LINE_CODING_FALLBACK_TEXT` entry
(BILLING_MESSAGES precedent from #458's close review — do not re-type the string a second time) →
grep check in this step's own test.

## 4. Step 4 — Mappers (backend)

**`lib/integration-bill-mapping.ts`:** `NormalizedLineItem.itemExternalId: string | null` (see step
3). `normalizeLineItems`'s synthesized single-line fallback (no usable line items) never carries an
item (a whole-bill total has no single Item to attribute it to — falls back to account, unchanged).

**`lib/integrations/quickbooks/bill-mapper.ts`:** each line branches on `item.itemExternalId`:
- **Item line:** `DetailType: "ItemBasedExpenseLineDetail"`, `ItemBasedExpenseLineDetail: { ItemRef:
  { value: itemExternalId }, Qty: item.trackedInventory or has quantity ? item.quantity : 1,
  UnitPrice: item.unitPrice, ...(taxCode) TaxCodeRef, ...(tracking[0]) ClassRef, ...(customer)
  CustomerRef, ...(billable) BillableStatus }` — **no `AccountRef`** (QBO computes it from the Item).
  `Qty`/`UnitPrice` need the line's resolved quantity — `NormalizedLineItem.quantity` is already
  carried (existing field); a service/non-inventory item with no quantity sends `Qty: 1,
  UnitPrice: item.amount` (1 × the amount, per ADR 0015).
- **Account line:** unchanged (`AccountBasedExpenseLineDetail`, throws `line_missing_account` if
  neither `accountExternalId` nor `itemExternalId` is set — the mapping-error guard widens from "no
  account" to "no account and no item").

**`lib/integrations/xero/bill-mapper.ts`:** each line branches the same way: **item line** →
`ItemCode: item.itemExternalId`, `AccountCode: item.accountExternalId` (Xero item lines still send
the account — it's the Item's account, resolved read-only, not the ledger computing it the way QBO
does), `Quantity: item.quantity || 1`, `UnitAmount: item.unitPrice`, `TaxType`, `Tracking` as today.
**account line:** unchanged. **Xero `Warning` stripping an `ItemCode`** (per the ticket: "a Xero
`Warning` that strips an `ItemCode` as a failed post"): `createBill`'s existing `warnings[]` read
(`{quickbooks,xero}/client.ts`) is inspected in `attemptIntegrationPush` (`lib/integration-push.ts`
:146, alongside the existing `ledgerReadBackChecks` warn-Check write) — a warning whose text matches
Xero's item-code-stripped wording (verify the exact string against the sandbox/docs at build; a
substring match on `"Item"` + `"code"` is the fallback if Xero's wording varies) is NOT written as a
`ledger_warnings` warn Check but instead treated as a failed post: the push status flips to `failed`
(same path a hard API error takes) rather than `succeeded`-with-a-warning, since a stripped ItemCode
silently turned an item line into an account line at the ledger — exactly the "never silently drop
data" rule the map's Notes state.

Seams: both mappers × item vs account line × tracked/untracked quantity fallback →
`{quickbooks,xero}/bill-mapper.test.ts`; `line_missing_account` widened guard →
same file; Xero item-code-stripped-warning → failed post → `lib/integration-push.test.ts`; correction
resend (step 3) never touches an item line's `ItemRef`/`ItemCode` → `{quickbooks,xero}/
correction.test.ts` (already proves TaxCodeRef/TaxType resent untouched — add one item-line case).

## 5. Step 5 — Line match (backend)

**`lib/matching/line-match.ts`:** both PO lines and bill lines gain `itemExternalId: string | null`
in `LineMatchInput.poLineItems[]`/`invoiceLineItems[]` (resolved the same way as any invoice line —
the PO's own `resolveDocumentCodingItems` pass already runs item resolution against the PO's
supplier, per ticket §5 "PO lines resolve Items the same way"). `bestPoLineIndex` gains an
item-first branch: **before** the description-similarity scan, if the invoice line carries an
`itemExternalId` and exactly one PO line carries the same `itemExternalId`, that PO line is the
match (`similarity: 1`, bypassing `LINE_MATCH_THRESHOLD`). If the invoice line's item matches **more
than one** PO line (a PO with the same Item on two rows) or **no** PO line, fall through to the
existing description-similarity scan — never guess between two Item-matching candidates. **Two
different Items never auto-pair**: when both sides carry an `itemExternalId` and they differ, that
pair is excluded from the similarity scan entirely (the bill line stays unmatched at that PO line,
even if the description similarity would have been high) — a wrong Item pairing moves ledger stock
value, per ADR 0015's rejected "fuzzy match" option. With no Item on either side, behaviour is
unchanged (today's description-similarity scan). Quantity-consumption
(`SiblingConsumption`/allowance) and unit-price tolerance are unchanged — they operate on whatever
`poLineIndex` resolves to, item-matched or description-matched alike.

Seams: item-match-first (single candidate), item-match-ambiguous (>1 candidate falls through),
item-mismatch-excluded (two different Items never pair even at high description similarity),
no-item-on-either-side (today's behaviour) → `lib/matching/line-match.test.ts`.

## 6. Build gate

`npm test` green (every seam above, plus the full existing suite untouched), `tsc --noEmit` clean,
`/code-review` (Standards + Spec) at close with P0 = P1 = 0, per `CODING_STANDARDS.md`. No detector
run, no capture round — no rendering file in this ticket (G1/G2 skipped per the phase brief's
backend-only rule).
