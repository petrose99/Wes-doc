# #458 spec critic — independent (2026-09-26)

Read: `458-spec.md`, `458-preflight.md`, `458-recon.md`, ADR 0014, CONTEXT.md (Tax code / Tax basis / Tracking /
Location / Supplier account rule), CODING_STANDARDS.md, `supplier-accounts-table.tsx`, `confirm-dialog.tsx`,
`integration-connection-actions.ts:86-100,159-172`, `models/supplier-account-rules.ts:23`,
`models/accounting-entities.ts:15`, `lib/integrations/ledger-currency.ts:29`, `lib/integrations/sync.ts:16`,
`lib/workspace-scope.ts`. Scored as if §6 were built exactly as written.

## 1. Critique (Nielsen 0–4, 4 = excellent) — §6 surface

| H | Score | What earns it / what costs it |
|---|---|---|
| H1 Visibility | 3 | Earns: every held part shown as text on its row; toast + refresh + focus move. Costs: the order of dialog close vs `router.refresh()` is not stated, and neither is the offline message (see H9). |
| H2 Real world | 3 | Earns: the ledger's own category name ("Class: Leribe"), Tax code label with its percent. Costs: a QuickBooks Owner reads "Class: …" in the row, then "Tracking" in the intro, the empty state and the Forget description. The dialog should name the held category ("its Tax code and Class"), not the generic word. |
| H3 Control | 3 | Earns: Cancel gets initial focus, Esc and Cancel return focus to the opener, and the dialog says the rule is re-learned. Costs: Forget is all-or-nothing. An Owner who wants to drop only a stale Class loses the account too. That is acceptable until #369, but the spec should say so. |
| H4 Consistency | 3 | Costs: one cell ends up with two phrasings and two tones for the same fact. The archived account at `:112` reads "(X's account was archived in QuickBooks)" in slate-600. The new stale part reads "(no longer in QuickBooks)" with amber-700. The spec says it copies `:112` ("as the archived-account copy does"), but it doesn't. Amber also already means "action waiting" on the reminder line just below. |
| H5 Error prevention | 4 | Earns: a confirm with consequence copy (what stops being pre-filled, what doesn't change, how it comes back), Cancel as the default, and a stale value never pre-filled. |
| H6 Recognition | 3 | Costs: a missing reference renders "Unknown (no longer in ‹ledger›)", which throws away what the value was. The account column already has `formatUnresolvedAccountId` for this. Reuse the same pattern. |
| H7 Flexibility | 3 | A filter above 20 rows; nothing more is needed for a settings table. |
| H8 Minimalism | 3 | Costs: the panel note (page.tsx) and the table intro say nearly the same thing in two adjacent paragraphs. At 390 the account cell stacks account, detail line and reminder in a 4-column table, and "keeps its existing 390 behaviour" is not stated as a width rule. |
| H9 Recovery | 2 | Costs: the S6 offline state has no mechanism behind it. `forget` has no try/catch (`:65-69`). When a server action rejects offline it throws inside `startTransition(async)`, and React 19 sends that to the route's `error.tsx`, so the Accounting page is replaced rather than showing an alert line. "Couldn't forget it. ‹server message›" also has no server message offline. Secondary: "(no longer in ‹ledger›)" states the fact but not its consequence (it won't be pre-filled; Forget or the next approval replaces it). |
| H10 Help | 3 | Earns: the intro teaches "Tax code only pre-filled on lines kept on this account". Costs: that rule is taught only there, and it is duplicated in the panel note. |
| **Total** | **30/40** | Good band. Below the pre-flight's predicted 34 and the close bar of ≥ 32 as specified; about 33–34 once the P1/P2 fixes below are applied. |

## 2. Evaluate (worst-issue severity, 0 = none … 4 = catastrophic)

| H | Sev | Worst issue |
|---|---|---|
| H1 | 1 | "no longer in ‹ledger›" refreshes only on sync; dialog-close/refresh order unspecified |
| H2 | 1 | "Tracking" in prose vs "Class" in the row for QBO |
| H3 | 1 | no per-part clear; not undoable (stated) |
| H4 | 1 | two stale phrasings/tones in one cell |
| H5 | 0 | — |
| H6 | 1 | "Unknown" discards the held id |
| H7 | 1 | filter only |
| H8 | 1 | note + intro duplicate |
| H9 | **3** | offline Forget throws to `error.tsx` (no catch); no offline copy |
| H10 | 1 | pre-fill rule taught once |

Sum 11. **Predicted health ≈ 76 as written.** It rises to about 88 once H9 is fixed, which brings the sum to 9 with every heuristic at ≤ 1, meeting the closing bar. As written the spec fails the closing bar, because H9 is above 1.
Walkthroughs: Owner reads a set (pass). Owner forgets (pass). Owner spots a stale Class (hesitation: what does it mean for the next bill?). Owner forgets while offline (failure: page error). Member reads (pass).
**Anti-pattern verdict: Clean.** Nothing is pre-selected, Cancel is the default, the consequence is stated, and there is no confirmshaming.

## 3. Structure — backend steps 1–5 vs CODING_STANDARDS

- **P1 — never post on a guess (§1).** The spec says "a missing preference reads as `false`". For `vat` that is a guess, and it leads straight to the failure the ADR exists to prevent: vat=false gives no TaxCodeRef, basis forced to `none`, and `TotalAmt` sent on a VAT company. **Fix:** a missing `TaxPrefs.UsingSalesTax` (or a missing `OfferingSku`) makes `deriveQuickBooksCapabilities` return null, so `readLedgerCapabilities` throws retryable and the gate refuses. Keep false-when-missing only for the tracking, location and billable flags, where false blocks rather than drops. Add that branch to the `ledger-capabilities.test.ts` seam.
- **P1 — workspace scoping (Std 1).**
  - (a) `readLedgerCapabilities(connectionId, …)` carries no workspaceId. Its precedent `readLedgerCurrency(connection: LedgerConnection, now, reuseMs)` takes the connection row and writes with `updateMany({id, workspaceId})`. **Fix:** give it the same signature and scoped write.
  - (b) `SupplierAccountRule` is not in `WORKSPACE_SCOPED_MODELS` (`lib/workspace-scope.ts`), yet step 2 migrates it. **Fix:** add it in step 2's commit, or hand it off by name as a pre-existing gap.
  - (c) `listAccountingEntitiesIncludingInactive(workspaceId, entityType)` (`models/accounting-entities.ts:15`) is typed `"account"|"vendor"|"tax_rate"` and has no connection filter. **Fix:** step 6 (or step 1) must widen the union and add `connectionId`. The spec claims it is "already used". It is, but not for these types.
- **P1 — stale-Check freshness (§4).** Persisted line-coding Checks refresh only on Save review and `runDeterministicChecks`. Sync, which changes capabilities and references, refreshes nothing. After an Owner follows "Turn ‹Class› tracking on in ‹ledger›" and syncs, the fail stays. And if `lineCodingFails` in `resolveSelectionEligibility` comes from the persisted rows, the queue still refuses. The spec never says where `lineCodingFails` is computed. **Fix:** name it as computed fresh with `checkLineCoding` from the stored capabilities and references at selection time, and have `syncAccountingEntities` call `refreshLineCodingChecks` for that connection's unposted documents. Add both to the seams.
- **P1 — step ordering (§4 vs §5).** Step 4's `gateLineCoding` is "computed from … the snapshot", but the snapshot fields (`taxCode`, `tracking`, `taxBasis`, `location`, …) are only added to `NormalizedBill` in step 5. **Fix:** move the `NormalizedBill`/`NormalizedLineItem` field additions and `normalizeBillFromDocument` into step 4 (the gate's input), and leave step 5 the mappers, read-back and correction.
- **P1 — error codes need sentences (Std 9).** `quickbooks_feature_not_supported` (5030) gets no `action-helpers.ts` sentence, and the 5030 → re-read → terminal path has no seam in any step. **Fix:** add a sentence row ("QuickBooks turned down a field this plan doesn't offer. Sync accounts, then check the bill.") and an `integration-push.test.ts` seam.
- **P1 — honest fix sentences (§4, whole spec).** Until #369 ships there is no control to pick a Tax code, a Tracking option or a Customer. So "Pick a Tax code ‹ledger› has", "Give each line a Tax code", "Pick another ‹category›" and "Pick a Customer" name actions that don't exist. The Customer and Billable Checks can't fire yet, which makes those harmless. The tax-code ones can fire. In addition, "save review to use the account's default" is false for a `manual` value, since §3 keeps manual values. **Fix:** until #369, give each tax-code and tracking sentence only its reachable half ("…or set a default tax code on its account in ‹ledger›, sync, then save review"), and record that #369 restores the "Pick…" clause.
- **P2 — post-success writes (Std 3/4).** Say that the `ledger_vat_differs`/`ledger_warnings` writes happen after the push is marked posted and never throw the push back into retry.
- **P2 — Xero tracking by name.** Names snapshotted at enqueue break if a category or option is renamed before a retry. Say so and have the gate check it, or note that Xero's error falls back to the permanent path.
- Additive migration: OK (nullable columns, no enum change). The Xero tax_rate externalId switching Name → TaxType is safe because nothing reads tax_rate ids yet, and 0 bills have been posted. Pure-before-I/O: OK (`ledger-capabilities`, `line-coding`, `checks/line-coding` are pure with tests). Idempotent retry/snapshot: OK in intent (step 5), subject to the ordering fix.

## 4. Contradictions — ADR 0014 / CONTEXT

- None with ADR 0014. The spec's 24 h freshness read at push goes beyond the ADR's "connect, every sync, after 5030" but doesn't contradict it.
- CONTEXT **Tax code** says "pre-filled from the ledger's default for the line's Account". The spec (and the Supplier account rule entry) put the supplier's Tax code first when the line keeps the rule's Account. **Fix:** update the Tax code entry in step 3's commit (Std 8).
- CONTEXT **Supplier account rule**: "where an Owner can change or forget it". The table has no change control. This predates the ticket and is not in scope, but worth one line in "Not in this ticket".
- ADR "posted bills read 'not set when posted'": no surface owns it here, so name it under #369's deferral.

## 5. Part B contracts — hollow spots

- B2 omits Sync → persisted line-coding Checks (see the P1 above).
- B5 "opener not disabled at open" is true, but on success every row's Forget is `disabled={pending}` when ConfirmDialog's cleanup focuses the opener. That focus falls on a disabled or unmounted node, and only the pending-focus effect rescues it. State that the effect runs on the `rules` change after the dialog unmounts, and targets **visible** (filtered) rows.
- B5/C "failure: stays open, alert line": no mechanism is given for a thrown action (the H9 P1).
- B6 "deleteMany idempotent (0 rows = success)": confirmed (`supplier-account-rules.ts:23-25`, the action returns success).
- B1 and B4: sound. ConfirmDialog does focus Cancel for destructive dialogs (`confirm-dialog.tsx:83`), even though its doc comment says Confirm.

## 6. Sizing

- **Build steps:** 6 (5 backend + 1 surface), exactly at the cap.
- **Captured states:** 6 (S1–S6), inside the cap of 10, which gives 12 frames across the two widths. That fits if the cap counts states; if it counts frames, drop S3 at 390 (text-only).
- **Too big for one session:**
  - Step 1: migration, a pure capability module, about 7 new or widened QBO calls with paging, 3 Xero changes, a Fault-body parser, the 5030 push path, sync of 3 new types, and `readLedgerCapabilities`.
  - Step 5: both mappers × 3 bases, the normalize and rounding change, the `createBill` return shape on both clients, the read-back warn, and correction tests for both providers.
  - Step 4 is heavy (11 Checks, refresh, eligibility, gate) but coherent.
- **Split within 6 steps:**
  - Merge step 2 into step 3. Both touch rule/pre-fill, and step 3 consumes step 2's fields, so this frees a slot.
  - Split step 1 into 1a (schema + `ledger-capabilities` + `getCompanyInfo`/`getPreferences`/`listTrackingCategories` + `readLedgerCapabilities`) and 1b (reference sync of the new types, the widened tax rates and account default tax code, and the Xero TaxType key).
  - Move the 5030 parse and push path into step 4 beside the gate.
  - Move the `NormalizedBill` fields and normalize into step 4 (this also fixes the ordering P1), leaving step 5 as mappers + `createBill` read-back + correction tests.
