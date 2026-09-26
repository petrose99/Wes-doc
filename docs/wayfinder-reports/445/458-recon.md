# #458 recon — code facts at spec time (2026-09-26, base 9acaa96)

1. **Schema.** `IntegrationConnection` `prisma/schema.prisma:1327` — no capabilities column (ledgerCurrency/ReadAt
   precedent at :1346). Reference data is ONE model `AccountingEntity` :2172 (`entityType` "account"|"vendor"|"tax_rate",
   `externalId`, `code?`, `name`, `active`, `raw Json?`, `syncedAt`; unique (connectionId, entityType, externalId)).
   `SupplierAccountRule` :2217 (supplierName, accountExternalId, lastUsedAt; unique (connectionId, supplierName)).
   `IntegrationPush.payload` :1376 is the NormalizedBill snapshot. Latest migration `20260926090000_add_company_currency_lock`.
2. **Clients.** QBO `lib/integrations/quickbooks/client.ts`: listAccounts :63, listVendors :68, listTaxCodes :73
   (`select Id, Name, Active from TaxCode` — no rates), createBill :107 returns `{id}` only, getHomeCurrency :164 (the
   only `/preferences` reads with getBookCloseDate :157), updateBillAccounts :196 (re-reads Line, swaps AccountRef only).
   No CompanyInfo read. Xero `lib/integrations/xero/client.ts`: listAccounts :38, listTaxRates :59 (`{name, active}` —
   drops TaxType/rate), createBill :89 `{id}` only, getBaseCurrency :124, updateBillAccounts :165. No TrackingCategories.
   Errors `lib/integrations/errors.ts`: classifyHttpStatus :38 by status only; `quickbooks/errors.ts:6` ignores the body —
   5030 is never recognised.
3. **Sync.** `syncAccountingEntities(connectionId)` `lib/integrations/sync.ts:16`: upsert rows, mark unseen inactive
   (:36), guess Default (:42). Xero TaxRate Name as externalId at :101. Triggers: Nango creation webhook
   `app/api/webhooks/nango/route.ts:105`; `syncAccountingEntitiesAction` `integration-connection-actions.ts:86` (Sync
   accounts button, `integrations-manager.tsx:206`); Sage pick :148. No schedule.
4. **codingData.** No zod; documented at `schema.prisma:611-623`. `items[i]` = `LineAccountRow`
   `lib/finance/line-account-resolution.ts:15` (`account_external_id`, `account_source`, `account_archived_fallback?`).
   Written by `resolveDocumentCodingItems` `models/documents.ts:659`, called from `updateDocumentReview` :835 on every
   Save review. Bill mapping `lib/integration-bill-mapping.ts`: NormalizedLineItem :10, NormalizedBill :22 (no
   subtotal/tax), BillMappingError :34, reconcileLineItemRounding :84 (lines sum to gross total),
   normalizeBillFromDocument :123. Totals in `reviewedData`: `subtotal`, `tax_total`, `total` (`lib/domains/finance.ts:26-29`).
5. **Checks.** `lib/checks/types.ts` CheckResult; no registry — `runDeterministicChecks` `models/document-checks.ts:60`;
   `FAIL_BY_DEFAULT` :41 (everything else downgraded to warn in persistCheckResult :208). Eligibility
   `resolveSelectionEligibility` `lib/integration-push-selection.ts:13` ignores check results; same criteria in
   `pushDocumentToConnection` `integration-push-actions.ts:26`. Push-time hard block precedent: `gateLedgerCurrency` →
   `failPreflight` `lib/integration-push.ts:105-125` (review task + IntegrationPermanentError). Error copy map
   `app/(app)/workspaces/[workspaceId]/action-helpers.ts:84`.
6. **Mappers.** `quickbooks/bill-mapper.ts:10` and `xero/bill-mapper.ts:10` send Account only; QBO sends `TotalAmt: total`.
   Correction path `account-correction-actions.ts:126` → both `updateBillAccounts` (re-read + resend lines; tax kept).
   `pushToQuickbooks`/`pushToXero` `lib/integration-push.ts:71-81`; `attemptIntegrationPush` :146 keeps only the id.
7. **Rules.** `learnSupplierAccountRuleFromApproval(workspaceId, documentId)` `models/documents.ts:763` (largest
   `reviewedData.line_items[i].amount` with an account; returns a change only when the account is retargeted);
   callers `review-actions.ts:56,80,238`. Pre-fill `resolveLineAccount` `line-account-resolution.ts:31` (rule → Default).
   Corrections: `findBillsAffectedByAccountChange` ~:455, `findAccountCorrectionReminders` :497. `touchSupplierAccountRuleUsage` :816.
   `listSupplierAccountRules` `models/supplier-account-rules.ts:13`.
8. **UI.** `app/(app)/workspaces/[workspaceId]/admin/integrations/page.tsx:112` renders
   `components/settings/supplier-accounts-table.tsx` (row :108, Usual account :110-127, Forget :131 — no confirm). No test.
9. **Tests.** `lib/integrations/{quickbooks,xero}/{bill-mapper,client,correction,default-account-guess}.test.ts`,
   `lib/integrations/sync.test.ts`, `lib/integration-bill-mapping.test.ts`, `lib/integration-push{,-selection}.test.ts`,
   `lib/checks/*.test.ts`, `models/document-checks.test.ts`, `models/documents.test.ts` (learn at :695),
   `models/supplier-account-rules.test.ts`, `lib/finance/line-account-resolution.test.ts`, `app/api/webhooks/nango/route.test.ts`.
10. **classJob.** `components/documents/line-items-editor.tsx:118-122,211,226,462,487-513` — stub, never passed; #369 replaces it.
