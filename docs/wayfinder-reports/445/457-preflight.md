# #457 pre-flight (filled before code) — spec: `457-spec.md`

## A — Excellence targets
| H | Target | What a 4 looks like here | Spec |
|---|---|---|---|
| H1 | 4 | Change → Currency row, Companies table column, connection card and toast all say ZAR in one tick (revalidatePath + router.refresh); lock reason and ledger status always visible as text | §5.2–5.4 |
| H5 | 4 | Change confirmed with its consequence (peg, count re-converted); creation forms can only produce allowed pairs; locked row has no control; lock re-checked server-side at submit; push never posts on an unread or differing ledger | §1, §3, §5.1, §5.3 |
Others built to a solid 3.

## B1 — Actions
| Action | Control | Destructive? | Consequence copy? | Reversal |
|---|---|---|---|---|
| Change company currency | Currency row "Change"; card "Switch this company to ZAR" | No (1:1 peg) | Yes, §5.3 description with count | Change back via same control until locked |
| Create company with country/currency | new-company form, Add company dialog | No | Hints §5.1 | Change dialog until locked |
| Migration | script only (no UI) | Yes (data) | dry-run prints plan + support list | idempotent; audit rows record `from` |
Check: `changeCompanyCurrencyAction` has 2 callers (company-detail via dialog, integrations card via dialog).

## B2 — Freshness
| Mutation | Views | Mechanism | Same tick |
|---|---|---|---|
| Change currency | pane row, Companies table Currency column, card mismatch line, amounts on queues | `revalidatePath` (companies, integrations) + `router.refresh()` | yes |
| Ledger read at push | card line | stored on connection; page is server-rendered on load | on next load (stated: card is not live) |

## B3 — Vocabulary
| Concept | Term | Where | Casing |
|---|---|---|---|
| the currency | company currency | label, dialog title, toast, card | sentence |
| ledger's currency | home currency (QuickBooks) / base currency (Xero) | card locked line only | lower |
| posting | posted / unposted | lock reason, dialog | lower |
| payment batch | payment batch | lock reason | lower |
| role | Owner | card | capital (glossary) |
Amounts: ISO code always (`LSL 1,234.50`), never M/R.

## B4 — Primitives
| Need | Primitive |
|---|---|
| confirm | `components/ui/confirm-dialog.tsx` ConfirmDialog (wrapped once, used by 2 callers) |
| selects | the native `<select>` + classes both forms use today (`companies-queue.tsx:325`) |
| toast | sonner `toast` |
| warning line | existing amber text tone of "needs reconnect" + lucide icon |
New: `company-country-currency-fields.tsx` (shared by the two forms — prevents two copies), `change-currency-dialog.tsx` (a ConfirmDialog wrapper, not a new primitive).

## B5 — Focus / keys / failure
| Surface | Initial focus | Trap/Esc/return | Keys | Failure |
|---|---|---|---|---|
| Change dialog | "Change to ZAR" (ConfirmDialog non-destructive default) | Radix trap, Esc closes, return to opener (`restoreFocusTo`) | Tab, Enter | alert line in dialog, stays open, retry; locked → confirmDisabled + reason |
| Creation forms | first field (existing) | Add company: dialog trap/Esc/return (existing) | Tab, arrows in select | existing error line, values kept |
| Card Switch | — | returns focus to Switch | Enter/Space | as dialog |

## B6 — Time axis
| Entity | Can change between | Shows / does |
|---|---|---|
| Lock | dialog open → submit (a push succeeds, a batch is created) | server re-reads lock in the transaction; refuses with the lock reason |
| Ledger currency | connect → push (Owner changes it in Xero) | fresh read before each push; mismatch → Check fails, no post |
| Ledger currency | read fails | push retried, never posts on a guess; card says couldn't read |
| Unposted count | dialog open → submit | count re-computed server-side; toast states the actual count |
| Migration | re-run | idempotent via audit row; locked companies untouched |

## C — Coverage
| Type | States | H1 | H3 | H5 | H6 | H9 |
|---|---|---|---|---|---|---|
| form fields | LS, ZA, detected non-LS/ZA → ZA | hint updates | Cancel existing | only allowed pairs | labels + hints | refusal copy §1 |
| row | owner-unlocked, locked, non-owner, ZA | lock reason text | — | no control when locked | reason in text | — |
| dialog | idle, busy, error, locked-since | toast + refresh | Cancel/Esc | consequence copy | title names target | alert line |
| card line | null, equal, differs×3 outcomes | text | — | no post | fact + outcome | outcome says the fix |

## D — Spec critic (opus): see below

## E — evaluate prediction
| H | Worst issue still permitted | Sev |
|---|---|---|
| H1 | card ledger line only refreshes on page load (not live) | 1 |
| H2 | "home"/"base" currency varies by provider — provider's own word | 0 |
| H3 | none — Cancel/Esc, reversible until lock | 0 |
| H4 | none if B3 holds | 0 |
| H5 | none | 0 |
| H6 | none | 0 |
| H7 | no shortcut for Change (rare act) | 1 |
| H8 | card line adds a row when unread (intended) | 0 |
| H9 | generic network failure copy | 1 |
| H10 | lock rule taught only in the LS hint and the lock reason | 1 |
Sum 4 · P0 0 · P1 0. Walkthroughs: create LS company (4 steps pass) · Owner switches to ZAR from card (3 pass) · Member sees mismatch, knows to ask (1 pass) · Owner of locked company reads why (1 pass). Anti-patterns: none (no pre-selection beyond the country default, no hidden cost — count shown). Verdict Clean. Predicted critique 34 (H1 4, H5 4, rest 3).
