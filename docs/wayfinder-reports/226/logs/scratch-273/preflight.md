# Pre-flight — #273 Build expense claims in place (filled; template: scripts/wayfinder-autopilot/preflight.md)

Spec: `spec.md` beside this file. Surfaces: S1 Receipts queue (bulk bar, ⋯, Claim column/facet) · S2 Add to expense claim dialog · S3 Approval tab claim section · S4 Approvals › Expense claims (list + pane + decision bar) · S5 phone (segments, cards, sheets) · S6 closures · S7 server. Mode: **Operate** everywhere. Touches money + approval → critic on `opus`.

## Part A — Two excellence targets
| H | Target | What a 4 looks like here | Spec |
|---|---|---|---|
| H1 Status | 4 | Every claim mutation (add, submit, withdraw, remove, delete, approve, reject) → `router.refresh()` + `onMutated("changed")` + one toast, so the Claim column, facet counts, pane header suffix, Approval-tab card, Ready to Approve badge and segment count all re-read the same server rows in the same tick; the row's number and the pane's number come from one function (`sumReceiptTotals`, `items.length`); decision replaces the bar with `DecisionResultStrip` that takes focus; "Waiting on you / ‹name›" states location in the flow. | §3.4, §5.3, §6.4–6.5, B2 |
| H5 Prevention | 4 | Every ⚠ action (Submit, Withdraw, Delete draft, Remove last, Approve, Reject) goes through the shell `ConfirmDialog`/`ReasonDialog` whose description names the consequence (frozen amount, money owed, receipts released); no radio pre-selected when a choice exists; ineligible receipts are held back with a visible reason on the row *and* re-validated server-side through the same `claimEligibility`; disabled controls always carry a visible reason; max-200 edge stated; offline disables with `OFFLINE_REASON`. | §2, §4.1–4.3, §5.3, §6.4, B1 |
| H2–H4, H6–H10 | 3 | glossary terms only (Expense claim, Claimant, Approver, Approval, Ready to Approve, Unclaimed); shell primitives only (`Dialog`, `ConfirmDialog`, `ReasonDialog`, `QueueScreen`, `QueueSegments`, `PaneFrame`, `ItemizedRecapTable`, `EligibilityStrip`, `DecisionResultStrip`, `AuditLog`, `ApprovalTimeline`); labels on every control; bulk add + two-click decide; one hierarchy per screen; every error at its source naming the receipt; the rule taught where it bites (dialog description, unclaimed sentence, facet comment). | §8–§9 |

## Part B — Contracts
### B1 · Action reachability and reversal
| Action | Control (component, label) | Destructive? | Consequence copy | Reversal |
|---|---|---|---|---|
| Add to claim (bulk) | `DocumentBulkActions extra` → `Button` **Add to claim** → S2 dialog → `addToExpenseClaimAction` | no | dialog description + strip "n of m can be added"; held-back reasons per row | **Remove this receipt** on the Approval tab (draft) |
| Add to claim (single, pane ⋯) | `PaneMenuItem` **Add to claim** (dialog state lives in `ReceiptQueue`, not in the menu) | no | same dialog | same |
| Add to a new claim (rejected receipt) | Approval-tab `Button` **Add to a new claim** → S2 with New claim | no | same dialog | same |
| Submit for approval | Approval-tab `Button` → `ConfirmDialog` "Submit ‹name› for approval?" → `submitExpenseClaimAction` | ⚠ (freezes total, enters Ready to Approve) | "‹n receipts› · ‹total› is frozen as the amount claimed. ‹Any owner / ‹stage›› will decide it. You can withdraw it until a stage is decided." | **Withdraw** |
| Withdraw | Approval-tab `Button` → `ConfirmDialog` "Withdraw ‹name›?" → `withdrawExpenseClaimAction` (new) | ⚠ (leaves Ready to Approve) | "It goes back to draft and leaves Ready to Approve. You can edit it and submit it again." | Submit again |
| Remove this receipt (≥2 left) | Approval-tab `Button` → `removeReceiptFromClaimAction` | no | toast "Removed from ‹name›" | Add to claim again |
| Remove this receipt (last) | same button → `ConfirmDialog` "Remove the last receipt?" | ⚠ (deletes draft) | "‹name› would be empty, so the draft is deleted too." | Add to claim → New claim |
| Delete draft | Approval-tab `Button tone=danger` → `ConfirmDialog destructive` "Delete ‹name›?" → `deleteExpenseClaimAction` | ⚠ irreversible | "Its n receipts go back to Unclaimed. This cannot be undone." | none — receipts are untouched; the draft holds nothing but its title (stated in copy) |
| Approve | S4 footer `Button` **Approve** → `ConfirmDialog` "Approve ‹name›?" → `decideExpenseClaimAction(approve)` | ⚠ (records money owed) | no flow / mid-stage / last-stage sentences + "You are approving your own claim." prefix when self, §6.4 | none in this build — **Reopen** is a decision → Wayfinder ticket at close (critic #4) |
| Reject | S4 footer `Button` **Reject** → `ReasonDialog` (reason required) → `decideExpenseClaimAction(reject, reason)` | ⚠ (releases receipts) | "‹Claimant› gets your reason. The claim's n receipts are released to be claimed again." | Claimant re-claims via **Add to a new claim** |
| Show ‹merchant› (pane Details) | `button aria-pressed` | no | — | pick another |
| Open on Receipts | `<a>` with `withOrigin` | no | — | origin strip back |

Server preconditions ↔ row (lesson #257): `document_not_an_expense_receipt` ↔ `supplier_receipt` · `document_needs_attention` ↔ `needs_attention` · `document_already_claimed` ↔ `in_claim` · `expense_claim_currency_mismatch` ↔ `currency_mismatch` — all four from `lib/claims/eligibility.ts`, both sides; `expense_claim_mixed_currency` / `expense_claim_no_amounts` ↔ Submit disabled with the same sentence. `expense_claim_not_draft` ↔ Submit/Remove/Delete hidden unless `status==="draft"`; `expense_claim_stage_decided` ↔ Withdraw hidden unless `canWithdraw`; `stage_requires_owner` ↔ footer `disabledReason` "Only this stage's approver can decide it."; `expense_claim_not_submitted` ↔ result strip replaces the bar.

Check before measuring: every exported action in `expense-claim-actions.ts` has ≥1 caller in `components` (`grep -rn <name> components app`); `grep -rn "window.confirm\|alert(" <new files>` empty; every assert/throw name in `models/expense-claims.ts` maps to a reason string in `lib/claims/*`; no `<a`/`<button` inside `QueueCard` subtree for the claims columns' `phoneRender`.

### B2 · View freshness
| Mutation | Views | Mechanism | Same tick |
|---|---|---|---|
| Add to claim | Claim column pill+subtitle · facet counts · selection (added ids cleared) · open pane Approval tab · toast | `router.refresh()` + `onMutated("changed")` + `setSelection(heldBack)` | yes (rows and facts re-read server-side; selection local) |
| Submit | Approval-tab card (pill Submitted, Amount "as submitted", Waiting on) · Claim column · Ready to Approve badge · Approvals segment count · toast | `onMutated("changed")` + `router.refresh()` (layout re-reads `countReadyToApprove`) | yes |
| Withdraw | same as Submit in reverse; claim leaves S4 list | same | yes |
| Remove receipt | card Receipts n / Amount "so far" · row's Claim cell → `—` · toast | same | yes |
| Delete draft / Remove last | card → unclaimed-eligible state with button (focus `#claim-empty-action` / `#claim-empty-text`) · all member rows' Claim cell → `—` · facet counts | same | yes |
| Approve / Reject (S4) | `DecisionResultStrip` replaces the bar (focus) · row `pinned` with new Stage · segment count · rail badge | `router.refresh()` + strip; row pinned until pane closes | yes |
| Approve / Reject (S4) → Receipts queue & each receipt's Approval tab | Claim pill · rejection reason from audit | `force-dynamic` page + pane facts re-read on open | on next load / open (a different page; nothing on the S4 screen shows stale) |
| Add (partial server hold-back) | toast "…and 1 held back" · Claim column for the added only | result payload drives the toast; refresh for rows | yes |
Rule: no optimistic state on any claim row; every number is server-read (CONTEXT: server truth after mutation).

### B3 · Vocabulary
| Concept | Term | Appears on | Casing |
|---|---|---|---|
| the unit | **Expense claim** (glossary); "claim" alone inside a sentence after the first mention | dialog title, S4 title, segment, tab card | sentence |
| the act of adding | **Add to claim** (control) / **Add to expense claim** (dialog title) / toast "Added n receipts to ‹name›" | bulk bar, ⋯ item, unclaimed sentence button, dialog, toast | sentence |
| the person | **Claimant** | column title cell, `dl`, confirm copy | sentence |
| the decider | **Approver** / "any owner" | Waiting on, facet Approver | sentence |
| the queue | **Ready to Approve** | withdraw copy, phone card title | as CONTEXT (Title Case proper noun) |
| statuses | `CLAIM_STATUS_LABELS` Draft · Submitted · Approved · Rejected; **Unclaimed** for none | pill, facet, tab card, Stage column | one map |
| the amount | **Amount** (+ "as submitted" / "so far") | dl, column, confirms | sentence |
| the rejected receipt's re-entry | **Add to a new claim** | Approval tab rejected state | sentence |
| ineligibility reasons | `ELIGIBILITY_REASON_TEXT` (3) and `lib/claims/refusals.ts` sentences | dialog Held back column, unclaimed sentence, server refusal alert | one map each; the row reason and the server sentence share nouns |
Check: extract strings from new/changed files (`scratch-273/part-b-checks.mjs` B3); no "Expense report", "Reimbursement", "Claim request", "Submit claim"/"Submit for approval" mix, no Title Case column labels; no hand-written status word outside `lib/claims/labels.ts` (lesson #258).

### B4 · Primitive reuse
| Need | Shell primitive | New? |
|---|---|---|
| dialog (S2) | `components/ui/dialog.tsx` `Dialog` (`initialFocus`, `data-inner`, focus-return) | no |
| confirms | `ConfirmDialog` (`destructive`, busy label, inline alert) | no |
| reject with reason | `ReasonDialog` (`placement="sheet"` <md) | no |
| eligibility sentence | `EligibilityStrip` (bulk-approve-receipt.tsx) | no |
| receipts tables in dialog | `ItemizedRecapTable` — `ItemizedRecord` gains optional `note` | extend, not new (reason: held-back reason column; one table component) |
| pill | existing `ClaimPill` / shell `Pill` tones | no; `ClaimPill` reads `CLAIM_STATUS_LABELS` |
| list + cards + facets + sort | `QueueScreen<ExpenseClaimRow>` | no |
| segments | `QueueSegments` — gains `shortLabel` | extend (three segments at 390) |
| pane frame / tabs | `PaneFrame` + `PaneTabs` (extract from `split-pane.tsx` if not exported — B4 row, `extract`-class change, no new look) | extract only |
| stage timeline | `ApprovalTimeline` (#232) | no |
| audit | `AuditLog` | no |
| decision footer + result | Invoices' footer contract + `DecisionResultStrip` | no |
| menu item | `PaneMenuItem` (`disabled`+`hint`) | no |
| bulk button | `Button size=sm variant=outline` in `extra` slot | no |
| claim card | `<section>` + `h3` + `dl` in the PO-match style — **not** a nested `Card` | no |
| radios in dialog | native `input type=radio` in `fieldset`, styled as the shell's existing radio rows (Payments batch dialog) | no |
Looks-like rule (#253): `ClaimPill` never carries a click; the picked receipt in Details is a `button aria-pressed`, not a pill. Cells inside `QueueCard`: `phoneRender` for Claim (pill only, no link), Amount, Stage — none render `<a>`/`<button>` (#261).

### B5 · Focus, keys and failure path
| Surface | Initial focus | Trap + Esc + return-to | Keys | On failure |
|---|---|---|---|---|
| S2 dialog | first radio `#claim-target-new` (or primary **Add n receipts** when no target choice / nothing eligible → Cancel) | `Dialog` trap; Esc closes (ignored while busy); returns to bulk-bar button or the pane ⋯ trigger (captured at open; the trigger is enabled at that moment) | ↑/↓ radios, Tab order §9 | refusal → `role=alert` sentence above footer, inputs kept, same button retries; drafts load failure → inline "Couldn't load your drafts." + **Retry**, New claim stays usable; offline → primary disabled with `OFFLINE_REASON` |
| Confirms (Submit/Withdraw/Delete/Remove-last/Approve) | confirm button | shell trap; Esc → trigger; after success the pane remounts → focus `#claim-card-title` (Submit/Withdraw/Remove ≥2) or `#claim-empty-action`→`#claim-empty-text` (Delete draft / Remove last, the card is gone) via `pendingReloadFocus` (S3), or `DecisionResultStrip` `tabIndex=-1` (S4) | Enter confirms | refusal inside the dialog `role=alert`, dialog stays open; server sentence from `refusals.ts` |
| ReasonDialog (Reject) | textarea | shell; Esc innermost-only keeps typed reason (phone sheet) | Enter in textarea = newline, submit by button | same as confirms |
| Pane ⋯ item below md | — | — | — | `disabled` + `hint` visible |
| `/[claimId]` deep link | pane heading | shell | — | decided/withdrawn → read-only pane + result line + Back to list; unknown → in-shell not-found (§6.1) |
| S4 list rows / cards | first row via existing `pendingFocus="rows"` | existing | j/k, Enter, / | pane load error → shell error rendering |
| Details tab "Show ‹merchant›" | — | — | Enter/Space | source fetch failure → existing source-strip error |
| Open on Receipts `<a>` | — | — | — | route guard: `receipts/page.tsx` has `?mode=claims` → `notFound()` only; `?doc=` still served (checked in build, lesson #262) |
| Segments | — | — | ←/→ | — |
Check: keyboard probe per contract per width; `activeElement` never `body`/`DIV` after any mutation (`#claim-card-title` or the strip); `grep -n "reloadKey" components/queue/history-tabs.tsx` mutation path has a matching `pendingReloadFocus`.

### B6 · Time-axis and concurrency
| Entity | What can change | Surface shows / does |
|---|---|---|
| Receipt eligibility between selection and Add | another user claims it, its state flips to needs_attention, it is deleted | server re-runs `claimEligibility` per id; result `heldBack[]` → toast "…and 1 held back", dialog closes, rows refresh; nothing silently added |
| Draft total between tab view and Submit | a receipt's amount edited / removed by another member | Submit's confirm shows the total computed **at confirm open** from server facts; `submitExpenseClaim` freezes its own recomputation and the toast/card show the frozen number ("as submitted") — the confirm copy says the amount is frozen *on submit* |
| Claim between Withdraw click and server | a stage was decided meanwhile | server refuses `expense_claim_stage_decided` → sentence in the dialog; refresh shows the decided state |
| Claim between Approve open and confirm | another approver decided it / it was withdrawn | `expense_claim_not_submitted` → result strip carries the refusal sentence; row refreshes out of the list |
| Receipt deleted after submission | `items.length < audit itemCount` | card note "1 receipt was deleted after submission. The amount is as submitted."; frozen total untouched |
| Draft list in the dialog | a draft submitted while the dialog is open | server refuses `expense_claim_not_draft` → alert; Retry reloads drafts |
| Same receipt added to two drafts | two members add concurrently | add runs in one transaction re-reading the latest claim per document; the loser gets `document_already_claimed` naming the merchant; Submit re-checks every item (§2) |
| Currency | a draft holds EUR and a USD receipt is added; or a receipt's currency is edited after adding | `currency_mismatch` held back at add (dialog + server); an edited-in mismatch makes the draft `mixed`: card lists per-currency totals, Submit disabled with reason, never one summed figure |
| Default flow changed between drafts | workspace flow edited | flow is resolved at submit time; confirm copy names the flow resolved at open ("‹stage› approvers") — same query |
| Offline mid-dialog | `online` event | primary toggles with `OFFLINE_REASON`; inputs kept |

## Part C — Coverage by component type
| Type | States | Feedback (H1) | Exit (H3) | Prevention (H5) | Labels (H6) | Error copy (H9) |
|---|---|---|---|---|---|---|
| Bulk bar (S1) | none-eligible (disabled + visible line) · ≥1 eligible · >200 selected | dialog opens; toast after | Clear selection (shell) | disabled-with-reason | **Add to claim** + icon | — |
| Column/facet (S1) | `—` · pill+subtitle · facet zero-results (shell filtered-empty) · legacy `claim=claimed` ignored | pill from server | Clear filters (shell) | — | Claim / Unclaimed + 4 statuses | — |
| Dialog (S2) | 9 states §4.3 incl. drafts loading/failed, busy, offline, long content, >200 | strip counts, busy label, toast | Cancel/Esc/backdrop, focus-return | no pre-selection; held-back visible; server re-validate | legend "Add to", radio rows, title field | alert sentence names the receipt |
| Approval-tab card (S3) | 10 states §5.2 + 0-amount draft, mixed-currency draft, someone else's draft, own-claim label, deleted-after-submit | card re-read after each action; toast | confirm Cancel; focus to `#claim-card-title` | confirms with consequence; disabled Submit with reason | `dl` terms; buttons verbs | refusal sentence in dialog |
| List (S4) | empty done · filtered-empty · loading (`loading.tsx` skeleton) · denied (`notFound` without capability) · long claimant/name truncate | counts on segments | facets Clear | — | column labels; card `aria-label` | — |
| Pane (S4) | loading skeleton · load error · deleted-receipt note · no source (receipt file missing → strip empty state, existing) | header suffix | Back to list / Esc (shell) | — | tabs Approval/Details/Audit | shell pane error |
| Decision bar (S4) | can decide · cannot (reason) · offline · pending · decided (strip) | strip takes focus | Cancel in dialogs; Back/Next in strip | confirms; reason required | Reject / Approve | strip refusal sentence |
| Segments (S5) | 3 with counts incl. (0) | count | ←/→ | — | full name in `aria-label` | — |
| Cards (S5) | as list | — | Back (history) | — | comma `aria-label` | — |
| Sheets (S5) | as confirms | — | Esc innermost | 44px controls | — | as confirms |
| Toast | success · partial hold-back | one per mutation | auto | — | names claim | — |
No GAP left: the `receipts?mode=claims` and `/expenses` closures render the in-shell not-found (existing) — stated in spec §S6.

## Part D — Independent spec critic
Critic: fresh `Agent`, `model: "opus"`, spec.md + preflight.md only. Before fixes: critique **30/40** (all 3s), evaluate sum **22**, P1 **4** (H1 focus after Delete draft → body; H2 mixed currencies summed; H3 Approve irreversible; H5 missing amounts frozen as 0 silently + non-atomic add), P2 4, health ≈ 64, verdict: hidden consequence ×2. Walkthroughs 5/5 pass but Delete draft omitted (latent focus failure).

| H | critique: self / critic / reconciled | evaluate worst-issue: self / critic / reconciled | Spec change made |
|---|---|---|---|
| H1 | 4 / 3 / 4 | 1 / 3 / 1 | §5.3 focus fallback chain `#claim-card-title` → `#claim-empty-action` → `#claim-empty-text`; B2 split S4-screen (same tick) from Receipts (next load) |
| H2 | 3 / 3 / 3 | 1 / 3 / 1 | §2 `sumReceiptTotals` per-currency + `mixed`; `currency_mismatch` eligibility reason; card lists per-currency, Submit disabled |
| H3 | 3 / 3 / 3 | 1 / 3 / 1 | Reopen (approved → submitted) is a decision → Wayfinder ticket at close (§10); consequence copy audited |
| H4 | 3 / 3 / 3 | 1 / 2 / 1 | one creation breakpoint `md` everywhere; S4 Stage reads `stageLabel` only |
| H5 | 4 / 3 / 4 | 1 / 3 / 1 | Submit confirm names "k receipts have no amount and are claimed as 0"; add-to-claim transactional re-check; submit re-checks every item |
| H6 | 3 / 3 / 3 | 1 / 2 / 0 | "Claimant (you)" + **Your own claim** line + confirm prefix "You are approving your own claim." |
| H7 | 3 / 3 / 3 | 1 / 1 / 1 | — |
| H8 | 3 / 3 / 3 | 1 / 2 / 1 | S4 pane renders the claim card `readOnly` — decision bar is the only action set |
| H9 | 3 / 3 / 3 | 0 / 2 / 0 | §6.1 `/[claimId]` states: decided → read-only pane + result line + Back; withdrawn → note; unknown → not-found |
| H10 | 3 / 3 / 3 | 1 / 1 / 1 | currency and self-approval rules now taught where they bite (card note, disabled reason, confirm prefix) |
Critic's after-line with all changes made: **33/40**, sum **7**, P1 **0**, health ≈ **86**, **Clean**. Gate met (predicted ≥ 32, none under 3, two 4s, zero P0/P1, Clean).

## Part E — Predict evaluate
### E1
| H | Worst issue still permitted | Sev | Fix |
|---|---|---|---|
| H1 | rail badge lag if the layout is not re-rendered by `router.refresh()` from the pane — verified in #257 (badge is layout-read) | 1 | B2 |
| H2 | "Claim of ‹date›" auto-name reads generic when many drafts exist (currency mixing now blocked at add + submit) | 1 | title field, radio row shows n receipts + total; §2 `mixed` |
| H3 | Approve has no reversal in this build (Reopen ticketed at close; project mapping says 3 for irreversible-without-reversal, critic reconciled to 1 with the ticket named + audited consequence copy) | 1 | §6.4, §10; Wayfinder ticket at close |
| H4 | `ClaimPill` tones vs Invoices Stage pill tones differ (two palettes on one Approvals band) | 1 | Stage column on S4 uses `stageLabel` pill exactly as Invoices; `ClaimPill` only on Receipts |
| H5 | select-all >200 truncation (missing amounts now named in the Submit confirm; double-add closed by the transaction) | 1 | strip sentence "The first 200 can be added" |
| H6 | self-submitted owner claim — now labelled "Your own claim" + confirm prefix | 0 | §5.1, §6.4 |
| H7 | no keyboard accelerator for Add to claim | 1 | bulk + `?` sheet lists existing shortcuts; none added by design (stated) |
| H8 | Approval tab shows claim card + timeline + status line of the receipt → one hierarchy kept by dropping "From this supplier"; S4 pane card is `readOnly` (one action set) | 1 | §5, §6.3 |
| H9 | deep link to a decided/withdrawn claim — now a read-only pane with result line | 0 | §6.1 |
| H10 | rule "creating claims is desktop-only" taught only at the disabled item/sentence | 1 | hint text + unclaimed sentence |
Sum 7 · P0 0 · P1 0 · P2 0 (predicted health ≈ 86).

### E2 Walkthroughs
| Task | Step | try | notice | associate | progress | Rating |
|---|---|---|---|---|---|---|
| Claimant batches 4 receipts into a new claim (desktop) | select rows → **Add to claim** → dialog (strip "3 of 4", held-back reason) → New claim (sole/pre-selected or chosen) → title → **Add 3 receipts** → toast, held-back row stays selected | y | y (bar button beside Export) | y (title + strip) | y (toast + Claim pills) | pass |
| Claimant submits from the Approval tab | open a claimed receipt → Approval tab → card → **Submit for approval** → confirm names total + who decides → toast, pill Submitted, focus on card title | y | y (tab first for claims) | y | y | pass |
| Claimant withdraws after a typo | Approval tab → **Withdraw** → confirm → Draft, edit, Submit | y | y | y ("back to draft") | y | pass |
| Approver decides on phone | Ready to Approve → segment Claims (n) → card → sheet pane Approval tab (who/how much/what for) → **Approve** → confirm sentence → result strip → Next | y | y (segment count) | y (money-owed sentence) | y (strip takes focus) | pass, 1 hesitation (three segments at 390 — short labels) |
| Approver rejects with reason; Claimant re-claims | Reject → reason → strip; Claimant's Approval tab: Rejected + reason + **Add to a new claim** | y | y | y | y | pass |
| Claimant deletes a draft / removes the last receipt | Approval tab → **Delete draft** → confirm ("receipts go back to Unclaimed") → unclaimed state, focus on **Add to claim** button | y | y | y | y (focus lands on the next action) | pass |
Estimate: completion 92% · steps ≤ 6 · error points: choosing between several drafts; phone segment discovery.

### E3 Anti-patterns
Pre-selection: none when a choice exists (New claim pre-selected only as the sole option). Hidden consequence: none — freeze, money owed, release all in confirm copy. Guilt copy: none. Buried exit: Cancel/Esc/backdrop on every dialog; Withdraw beside Submit. Forced continuity: n/a. Asymmetric friction: submit and withdraw are both one confirm. Misleading label: buttons name the act ("Add 3 receipts", not "Save"). Verdict: Clean.

## Part G — Predicted vs measured
(filled at close)
