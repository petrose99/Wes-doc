# #457 Spec review

Scope: `git diff 3351eee...HEAD` over lib/models/worker/prisma/app/components/scripts. Compared
against `457-spec.md` (§9 binding over §1-§7) and ticket #457.

## Findings

### (a) Missing/partial requirements
None found. Checked and present: allowed-pair model (`lib/geo/company-currency.ts`), schema
defaults + lock columns (`prisma/schema.prisma`), recorded lock on push success and on
`PaymentRun`/`PaymentBatch` create (§9.1), `SELECT...FOR UPDATE` serialisation + push-in-flight
refusal (§9.3), `requeueLedgerCurrencyFailures` wired into `changeCompanyCurrency` (§9.4),
`checkLedgerCurrency` run for every push kind including bank statements, with 60s reuse (§9.5),
`ledgerCurrencyOutcome` pure fn matching all five outcomes plus support-list case (§9.6), migration
lock-backfill + audit `noticePending` + resumable notice pass (§9.7), rate-date preservation via
`applyFxToDocument` reuse (§9.8), focus management after Switch/Change (§9.9), one "Company
currency" label everywhere (§10). `formatCurrency` matches the exact spec format (U+00A0, minus
after code, verified by `lib/money.test.ts`). Both grep checks in spec §4 (`Intl.NumberFormat`
currency callers, bare `"USD"` literals) return exactly the files the spec allows. Seed data matches
§2 (Riverside LS/LSL, Harbor Lights ZA/ZAR, Northwind ZA/ZAR, Pine Street LS/LSL). All 67 targeted
unit tests pass.

### (b) Scope creep
- `role="alert"` added to `new-workspace-form.tsx`'s generic error paragraph (not asked for by this
  spec, though a reasonable a11y carry-over). P3.
- `app/(app)/workspaces/[workspaceId]/admin/integrations/page.tsx`: wrapped a static string in
  `{"..."}` (no behaviour change) — noise, not scope creep. P3.

### (c) Implemented but questionable
- `app/(app)/workspaces/[workspaceId]/action-helpers.ts` BILLING_MESSAGES: `ledger_currency_differs`
  → generic "Your ledger keeps its books in a different currency from this company." and
  `ledger_currency_unreadable` → "Couldn't read your ledger's currency yet...". Spec §3: "maps both
  codes to the detail copy / 'Couldn't read Xero's currency yet...'" implies provider-specific text;
  this map is provider-agnostic (can't be, since the file is static). In practice this path looks
  unreachable for a user-facing toast — the real "Checks" tab renders the review task's own
  raw stored detail (`ledger_currency_differs: <provider fact>`) via
  `app/(app)/workspaces/[workspaceId]/actions.ts:303` `ledgerRetry.detail`, not through
  `errorMessage`. P3 — cosmetic mismatch in a fallback path, not user/ledger visible in the
  documented flow.
- `components/admin/company-detail.tsx`: `focusCurrencyOnMount` is a **module-level** (not
  component-local) boolean shared by every mounted `CompanyDetail` instance. Only one Companies
  pane is ever mounted at a time in this app today, so it's benign, but it's a latent bug if that
  assumption ever changes (e.g. two panes, or a fast unmount/remount race). P2.
- `app/api/webhooks/nango/route.ts:111` calls `readLedgerCurrency` at connect for every provider
  including `sage`; harmless (the internal `fetchLedgerCurrency` returns null for non-QBO/Xero and
  `readLedgerCurrency` no-ops), but is dead work on the `sage` connect path not scoped out by the
  spec's "Sage is `live: false`" exclusion. P3.

## Severity counts
P0: 0
P1: 0
P2: 1 — `components/admin/company-detail.tsx` module-level `focusCurrencyOnMount` shared across
instances (spec §9.9 focus-after-Switch/Change).
P3: 3 — see above.
