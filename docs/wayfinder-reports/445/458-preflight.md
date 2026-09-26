# #458 pre-flight (filled before code) — spec: `458-spec.md` (§6 is the only surface)

Scope: Part A–E cover step 6 (Accounting › Supplier accounts table + Forget confirm). Steps 1–5 are backend; their
contracts are the seams in spec §1–§5 and CODING_STANDARDS (backend floor).

## A — Excellence targets
| H | Target | What a 4 looks like here | Spec |
|---|---|---|---|
| H1 | 4 | Forget → row gone, toast, focus on the neighbour's Forget in one tick (`revalidatePath` + `router.refresh()`); every held part (Tax code, Tracking, Location) visible as text on its row; a stale reference says so beside its value | §6 Row layout, Accessibility |
| H5 | 4 | Forget (now deletes the whole set) confirmed with consequence copy naming what stops being pre-filled and what doesn't change; a reference gone from the ledger is flagged and never pre-filled; posting is blocked server-side (gate) for any held value the ledger can't take | §6 Copy, §3, §4 |
Others built to a solid 3.

## B1 — Actions
| Action | Control | Destructive? | Consequence copy? | Reversal |
|---|---|---|---|---|
| Forget a supplier's usual account (+ set) | row button "Forget" → ConfirmDialog "Forget" | Yes (deletes rule row) | Yes §6: stops pre-filling ‹parts›; posted bills unchanged; next approval re-learns | none by undo — re-learned from the next approval (stated in dialog) |
| Review / Leave them (reminder) | existing, unchanged | — | existing | existing |
Callee: `forgetSupplierAccountRuleAction` `integration-connection-actions.ts:161` → `deleteSupplierAccountRule` `models/supplier-account-rules.ts:23` (deleteMany scoped by workspaceId+connectionId+id — the whole row, so the set goes with it; no shape change needed). Auth: `guardIntegrations(workspaceId)` (Owner) at :162. Check: 1 UI caller (`supplier-accounts-table.tsx`).

## B2 — Freshness
| Mutation | Views | Mechanism | Same tick |
|---|---|---|---|
| Forget | table row, filter results, empty state (last rule), reminder line | `revalidatePath(integrations)` + `router.refresh()` on success; toast | yes |
| Save review (backend) | persisted Checks on the bill | `refreshLineCodingChecks` after `resolveDocumentCodingItems` | yes (server) |
| Sync accounts (backend) | persisted Checks on every reviewed, unposted bill of the connection; selection reason | `refreshLineCodingChecksForConnection` at end of sync; eligibility computed fresh; push gate recomputes from snapshot | yes (server) |
| Sync accounts | "no longer in ‹ledger›" parentheticals | server-rendered page; the Sync action already revalidates integrations | yes |

## B3 — Vocabulary
| Concept | Term | Where | Casing |
|---|---|---|---|
| the rule | usual account | column, dialog title, toast, intro, note, aria-label | lower (column "Usual account") |
| tax code | Tax code | detail line, dialog, Check titles | capital T (glossary) |
| tracking | the ledger's category name ("Class", Xero's own); "Tracking" in prose | detail line; dialog/intro | as ledger / capital |
| location | Location | detail line, dialog | capital (glossary) |
| ledger name | QuickBooks / Xero (PROVIDER_LABELS) | parenthetical, Checks | proper |
| forget | Forget / Forgot | button, confirm, toast | sentence |
Banned in UI: rule, coding set, class (generic), department, TaxType.

## B4 — Primitives
| Need | Primitive |
|---|---|
| confirm | `components/ui/confirm-dialog.tsx` ConfirmDialog (destructive, `restoreFocusTo` RefObject, `children` for alert) |
| table | existing native table in the same file |
| toast | sonner |
| stale fact | the archived-account parenthetical pattern `:112` + amber tone of the reminder line |
| Forget button | existing text-button classes (looks like a link-button, not a pill) |
New primitive: none. No `window.confirm`.

## B5 — Focus / keys / failure
| Surface | Initial focus | Trap/Esc/return | Keys | Failure |
|---|---|---|---|---|
| Forget confirm | Cancel (ConfirmDialog destructive default, `:83`) | trap; Esc/Cancel → the row's `#forget-rule-‹id›` (RefObject; opener not disabled at open) | Tab, Enter, Esc | try/catch: server error → alert "Couldn't forget it. ‹msg›"; throw/offline → "Couldn't reach DocuBite…"; stays open, retryable, nothing removed |
| Forget success | — | toast → pending index (state) → close → refresh; effect on `rules` focuses the visible row at that index / last row / intro `#supplier-accounts-intro` `tabIndex=-1` / empty text; supersedes ConfirmDialog's opener return; never body | — | — |
| Forget button | — | — | Enter/Space | disabled while `pending` |

## B6 — Time axis
| Entity | Can change between | Shows / does |
|---|---|---|
| Rule | another Owner forgets it / an approval re-learns it while the dialog is open | deleteMany is idempotent (0 rows = success); refresh shows current row |
| Reference | Owner archives a tax code / option in the ledger after learning | next sync marks inactive → "(no longer in ‹ledger›)"; not pre-filled; Check blocks if held |
| Capabilities | Owner turns off class tracking between Save review and post | push gate reads fresh capabilities, refuses with the Check; review task opened |
| Push snapshot | coding edited after a push was queued | retry resends the snapshot (Standard 3); gate checks the snapshot |

## C — Coverage
| Type | States | H1 | H3 | H5 | H6 | H9 |
|---|---|---|---|---|---|---|
| table/row | full, account-only, stale ref, reminder, Xero 2-tracking, non-owner, empty; long supplier/option names wrap between parts at both widths | detail line text | — | stale ref flagged | category label = ledger's name | parenthetical names the fix context |
| dialog | idle, busy, error | toast + refresh + focus | Cancel/Esc/return | consequence copy | title names supplier | alert line, retry |
| empty state | no rules | — | — | — | explains what fills it | — |
Loading: server-rendered; no client loading state. Offline: S6.

## D — Spec critic (opus — schema; `458-critic.md`): 30/40, health ≈ 76, 7 P1 as first written → spec rev 2
| H | critique self / critic / reconciled | evaluate worst self / critic / reconciled | Spec change (rev 2) |
|---|---|---|---|
| H1 | 4 / 3 / 4 | 1 / 1 / 1 | success order toast→focus-state→close→refresh; focus effect on visible rows (§6 Mechanism); sync refreshes Checks (§4a) |
| H2 | 3 / 3 / 3 | 0 / 1 / 0 | copy uses the ledger's category names, never generic "Tracking" (§6 Copy) |
| H3 | 3 / 3 / 3 | 1 / 1 / 1 | all-or-nothing Forget named; per-part clear deferred to #369 (§0) |
| H4 | 3 / 3 / 3 | 0 / 1 / 0 | one stale phrasing, slate tone like `:112`, amber kept for reminders (§6 Row) |
| H5 | 4 / 4 / 4 | 0 / 0 / 0 | VAT unreadable → never post (§1 invariant) |
| H6 | 3 / 3 / 3 | 1 / 1 / 0 | missing ref keeps its id via `formatUnresolvedAccountId` (§6 Row) |
| H7 | 3 / 3 / 3 | 1 / 1 / 1 | — (settings table; filter >20) |
| H8 | 3 / 3 / 3 | 0 / 1 / 0 | panel note cut to one clause; intro carries the rule (§6 Copy) |
| H9 | 3 / 2 / 3 | 1 / 3 / 1 | try/catch + offline alert copy (§6 Mechanism/Copy); honest fix sentences (§4 table); 5030 + unreadable sentences |
| H10 | 3 / 3 / 3 | 1 / 1 / 1 | stale parenthetical states the consequence ("not pre-filled") |
Structure P1s fixed: never-guess VAT (§1); scoped `readLedgerCapabilities(connection)` + `SupplierAccountRule` in
WORKSPACE_SCOPED_MODELS (§1) + list widened with `connectionId` (§2); fresh eligibility + sync refresh (§4a/b);
snapshot fields moved to step 4 (§4); 5030 sentence + seam (§4d); reachable-only fix sentences (§4). P2s: post-success
writes never retry (§5); Xero rename → permanent path (§5); CONTEXT Tax code entry updated (§3).
Sizing (critic): steps 1 and 5 too big → re-sequenced within 6: 1 capabilities+migration · 2 reference sync ·
3 rules+line model (old 2+3) · 4 snapshot+Checks+gate+5030 · 5 mappers+read-back+correction · 6 surface. 6 states,
12 frames. Within limits.
Reconciled: 32/40 (two 4s), worst-issue sum 5, P0 0 · P1 0, verdict Clean, health ≈ 88. Gate met.

## E — evaluate prediction (self)
| H | Worst issue still permitted | Sev |
|---|---|---|
| H1 | "no longer in ‹ledger›" refreshes only on sync/page load | 1 |
| H2 | category name is the ledger's own (intended) | 0 |
| H3 | Forget not undoable (stated; re-learns) | 1 |
| H4 | none if B3 holds | 0 |
| H5 | none | 0 |
| H6 | detail line needs reading past the account on 390 wrap | 1 |
| H7 | no accelerator on the list beyond the filter (>20) | 1 |
| H8 | detail line adds a row of text per supplier | 0 |
| H9 | generic network message in the alert line | 1 |
| H10 | "Tax code pre-fills only on lines kept on this account" taught only in the intro | 1 |
Self sum 6 · P0 0 · P1 0. Walkthroughs: Owner reads a supplier's set (2 steps pass) · Owner forgets a supplier (3 pass) · Owner spots a stale Class (1 pass) · Member reads the set (1 pass). Anti-patterns: none (no pre-selection; consequence shown; Cancel default). Verdict Clean. Predicted critique 34 (H1 4, H5 4, rest 3).
