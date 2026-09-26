# #457 Standards review (3351eee...HEAD)

## P0 — none found.
Workspace scoping, secret handling, migration additivity and glossary vocabulary all check out.
`models/company-currency.ts`, `models/company-currency-migration.ts`, `lib/integrations/ledger-currency.ts`
all route cross-workspace reads through `unscoped()` with a "why" comment (Standard 1). The
migration (`prisma/migrations/20260926090000_add_company_currency_lock/migration.sql`) only adds
columns and changes future defaults — additive (Standard 7). "Company currency" and "Company" are
already glossary entries in `CONTEXT.md:312-318` (Standard 8) — no missing-glossary P0.

## P1
1. **`models/company-currency.ts:56-72` (`changeCompanyCurrency`) — the "waits" claim in the
   docstring overstates what the lock buys (Standard 5 / correctness).** The `SELECT ... FOR
   UPDATE` on `workspaces` serialises against another currency change, and the in-flight check
   (`tx.integrationPush.count({ status: "pending", leaseUntil: { gt: now } })`) catches pushes
   *already leased* at read time. It does not block `attemptIntegrationPush`'s claim
   (`lib/integration-push.ts:38`, a plain `updateMany` on `IntegrationPush`, no workspace-row
   lock) from leasing a fresh push in the instant after the check runs and before the currency
   commit. `gateLedgerCurrency` re-reads the currency live so no wrong-currency post actually
   slips through, but the comment's "a concurrent push success ... waits" promise is not literally
   true for a push that claims in that window — worth tightening the comment or closing the gap
   (e.g. have the claim also take a workspace advisory lock) so a future reader doesn't rely on a
   guarantee that isn't there. P1 because it's a documented invariant claim about serialisation
   that the code doesn't fully deliver, not because a bad post is currently possible.

## P2
2. **`app/(app)/workspaces/[workspaceId]/admin/companies/actions.ts:198-210`
   (`changeCompanyCurrencyAction`) — cross-org membership check reads two rows before the role
   check.** `headFor(workspaceId)` / `headFor(companyId)` run before `roleOn(companyId, user.id)`
   confirms the caller has any standing on the target at all; an unauthenticated-for-that-company
   caller can still trigger two extra reads (org id comparison) before being refused. Low
   severity — no data returned, just wasted reads — but Standard 5 ("no action trusts an id the
   client sent without re-scoping it") is best read as check role/scope first. Not exploitable,
   worth a nit only.

## P3 (smells, judgement calls)
3. **Duplicated Data Clump** — the `{ locked ? { ...lock, at: lock.at.toISOString() } : lock }`
   serialisation is repeated verbatim in `loadCompanyDetailAction` and
   `changeCompanyCurrencyAction` (`admin/companies/actions.ts:82` and `:207`). Small, but a third
   call site would want a shared `toCurrencyLockView(lock)` helper.
4. **Mysterious Name** — `unposted(workspaceId)` (`models/company-currency.ts:29`) reads as "not
   yet posted" but its actual predicate is "no *succeeded* push exists," silently treating a
   failed/pending push's document as still eligible for re-conversion. Correct per the ADR, but
   the name doesn't signal the push-status nuance to a reader of `countUnpostedDocuments` or
   `migrateOne`.
5. **Feature Envy (minor)** — `lockEvidence` in `models/company-currency-migration.ts:24-36`
   reaches into `IntegrationPush`/`PaymentRun` internals to reconstruct a lock rather than asking
   a model function owned by those tables; acceptable as a one-off backfill script but would be a
   smell if reused.

No findings in `lib/integration-push.ts`'s push gate ordering (`gateLedgerCurrency` runs for every
push kind including bank statements, matching the ADR), or in the `IntegrationConnection` /
`Workspace` migration additivity.
