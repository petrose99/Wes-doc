# #273 — Expense claims in place: spec (Intent `specify` · `fortify` · `articulate` · `include`; Impeccable `shape` · `layout` · `typeset` · `clarify`)

Decisions come from #247 (14 decisions) and are not re-decided here; this file makes them buildable. Mode: **Operate**. Vic has no expense claims; precedents are #227/#236 (Approvals), #232/#257 (phone), #233/#258 (status words), #234/#259 (pane header, ⋯), #246/#271 (notice). Words verbatim from CONTEXT.md: **Expense claim**, **Claimant**, **Ready to Approve**, **Approver**, **Approval**.

## 0. Context (Intent)

- **Claimant**: a member who paid for something personally, on the desktop Receipts queue, usually a Reviewer; batches a few receipts at the end of a week; wants the money back with the least ceremony; interrupted often (pane state must survive).
- **Approver**: an owner (no flow) or the stage's named approver (Default approval flow, #253), on desktop or phone Ready to Approve; wants to decide in one look — who, how much, what for — and move on.
- Constraints: `expense-approvals` capability gates the whole feature; a workspace without it sees nothing new. Creating claims is desktop-only (#247 d13). No schema change: `ExpenseClaim`/`ExpenseClaimItem` are sufficient (`@@unique([claimId, documentId])` already allows a receipt in several claims over time; rejected releases). The rejection reason is stored in the audit event `detail.reason` and read back from the trail.
- Ethical stance: approving a claim records money owed to a person — every ⚠ action names that consequence; nothing is pre-selected; withdraw is as easy as submit.
- Assumed (not on #247): an owner may decide their own submitted claim (no flow) — #278 covers self-approval labelling for Payments; a claims equivalent is a question for the owner (see hand-off "Needs the owner"), not a rule this build invents.
- Success: a Claimant adds receipts to a claim without leaving the queue (tour #11); an Approver decides a claim in Ready to Approve with the same bar as an invoice; no state on the row disagrees with the pane.

## 1. Surfaces and routes

| # | Surface | Route / mount | Widths |
|---|---|---|---|
| S1 | Receipts queue: bulk bar **Add to claim**, pane ⋯ **Add to claim**, Claim column, Claim facet | `(queue)/receipts` (`components/queue/receipt-queue.tsx`) | ≥md creation; column/facet all widths (column `priority: low`, not a phone slot except the existing pill) |
| S2 | **Add to expense claim** dialog | shell `Dialog` (`components/ui/dialog.tsx`), opened from S1 | ≥md only — **one creation breakpoint, `md`**, for every opener (bulk bar, pane ⋯ item, S3 sentence button, rejected-state button); below `md` each opener is disabled with the hint or omitted as stated per surface |
| S3 | Receipt's **Approval tab** showing its claim | `components/queue/history-tabs.tsx` `ApprovalTab` — new claim section, facts from `getQueueDetailAction` | all |
| S4 | **Approvals › Expense claims** view | `(queue)/approvals/expense-claims/page.tsx` + `[claimId]/page.tsx` + `loading.tsx`; `components/queue/expense-claim-queue.tsx` | all; cards below `lg` like the other two views |
| S5 | Phone: segment **Claims (n)**, cards, decision sheets | `QueueSegments` (`shortLabel`), `QueueScreen cards`, `ReasonDialog`/`ConfirmDialog` `placement="sheet"` | <lg |
| S6 | Closures | `receipts?mode=claims` → in-shell `notFound()`; `(chrome)/expenses` → in-shell `notFound()` (its redirect to `?mode=claims` goes). `ExpenseClaimsPage`, `ExpenseClaimForm`, `ExpenseClaimRow`, workflow picker: **unreferenced, not deleted** (#274) | — |
| S7 | Server | `models/expense-claims.ts` (eligibility rewrite, `withdrawExpenseClaim`, `listExpenseClaimRows`, claim facts, reject reason), `models/receipts.ts` (claim projection), `models/approvals.ts` `countReadyToApprove` (+ claims), `lib/claims/*` (pure helpers, client-safe), `expense-claim-actions.ts` (add/withdraw/decide with reason) | — |

Capability gate: `getWorkspaceCapabilities(ws).has("expense-approvals")` → S1 column/facet/actions, S3 claim section, S4 route (404 in-shell) and segment, S5 segment, badge contribution. One boolean `claimsEnabled` computed server-side per page and passed down; never checked in a client component.

## 2. Data contracts (single functions, never two computations — lesson #250 H8)

- `lib/claims/eligibility.ts` — `claimEligibility(facts) → { status: "ready" } | { status: "not_eligible", reason: "supplier_receipt" | "needs_attention" | "in_claim" | "currency_mismatch" }` where facts = `{ templateCode, processingState, latestClaimStatus, currencyCode, targetCurrencyCode? }`. `currency_mismatch` only when a target draft is known (dialog with a draft chosen; server add-to-existing): the receipt's currency differs from the draft's (a draft's currency = its first receipt's). The row/bulk-bar check passes `targetCurrencyCode` undefined (no target yet); the dialog re-derives per draft radio and moves a mismatching receipt to Held back when that draft is chosen. **Atomicity (critic #5):** `addToExpenseClaim` runs in one transaction that re-reads each document's latest claim inside the transaction before inserting items; `submitExpenseClaim` re-runs `claimEligibility` for every item (excluding this claim) and refuses `document_already_claimed` naming the merchant — a receipt can never be submitted in two claims. **The server (`validateClaimableDocuments`) and the row (`ReceiptRow.claimEligibility`) both call it** (lesson #257 B1: every server precondition mirrored on the row, same sentence both sides). Rules (#247 d7): template `expense_receipt` · `processingState !== "needs_attention"` · latest claim not in `draft | submitted | approved` (a rejected claim releases).
- `lib/claims/labels.ts` — `CLAIM_STATUS_LABELS = { draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Rejected" }` (Receipts pill, facet and the Approval-tab pill read this; the S4 Stage column reads `stageLabel` only, as Invoices does); `claimName(claim) = claim.title ?? \`Claim of ${formatDate(claim.createdAt)}\``; `ELIGIBILITY_REASON_TEXT = { supplier_receipt: "Supplier receipt — not an expense", needs_attention: "Needs attention", in_claim: "Already in a claim", currency_mismatch: "Different currency from ‹claim name›" }`.
- `lib/claims/totals.ts` — `sumReceiptTotals(receipts) → { total, currencyCode, missing, mixed: boolean, byCurrency: { currencyCode, total }[] }` in integer cents (`lib/money.ts`); used by `submitExpenseClaim` (freeze) and by the Approval-tab draft total and the dialog footer. `missing` = receipts with no amount (shown, never silently 0). `mixed` = more than one currency among amount-bearing receipts; a mixed draft **cannot be submitted** (§5.2) and the card lists `byCurrency` instead of one total. Currency is never summed across codes.
- `ReceiptRow` gains: `claim: { id, status, title, createdAt, claimantId, claimantName } | null` (latest claim by `createdAt`), `claimEligibility` (above). `claimId`/`claimStatus` stay as derived aliases until #274's cleanup.
- `DocumentHistory.facts.claim` (via `getQueueDetailAction`): `{ id, name, status, claimant: { id, name }, isMine, isOwner, receiptCount, total, currencyCode, missingAmounts, frozen: boolean, canSubmit, canWithdraw, canDelete, canRemove, stages, decisions, currentStageIndex, waitingOn, waitingOnYou, rejection: { reason, by, at } | null, deletedReceiptCount } | null`, plus `claimEligibility` for the unclaimed case. `deletedReceiptCount = auditItemCount − items.length` (from `expense_claim_submitted.detail.itemCount`).
- `ExpenseClaimRow` (S4): `{ claimId, name, claimant: { id, name }, receiptCount, total, currencyCode, stage: ApprovalStageInfo, submittedAt, canDecide, nextStageName, firstDocumentId }`. `canDecide` = `canDecideStage` with a flow, else `actor.role === "owner"`.
- `countReadyToApprove` adds submitted claims the actor can decide; the rail badge and phone tab badge inherit it (one function).
- Server refusals are sentences (`lib/claims/refusals.ts`): `document_not_an_expense_receipt` → "‹Merchant› is a supplier receipt, not an expense." · `document_needs_attention` → "‹Merchant› needs attention before it can be claimed." · `document_already_claimed` → "‹Merchant› is already in a claim." · `expense_claim_not_draft` → "This claim was already submitted." · `expense_claim_stage_decided` → "A stage was already decided; this claim can't be withdrawn." · `stage_requires_owner` → "Only this stage's approver can decide it." · `expense_claim_not_submitted` → "This claim was already decided." Every action returns `{ success:false, error: sentence }`, never a code.

## 3. S1 — Receipts queue

### 3.1 Bulk bar
- `DocumentBulkActions extra` slot: **Add to claim** (`Button size=sm variant=outline`, `FolderPlus` icon 14px), between Export and Delete. Disabled with visible reason when **no selected row is eligible**: the bar shows "None of these can be claimed" as the same `text-xs text-slate-600` line the Approve strip uses (visible, not `sr-only` — lesson #252). Enabled when ≥1 eligible; the dialog handles partial.
- Label constant: **Add to claim** on the bar, on the ⋯ item, and as the dialog's opener name in tests. Dialog title: **Add to expense claim** (#247 d11). Submit: **Add n receipts** (n = eligible count; "Add 1 receipt").

### 3.2 Pane ⋯
- `PaneMenuItem` **Add to claim** for the open receipt, after `DocumentMenuTopItems`, before Delete. Hidden when the receipt is in an open/approved claim (in_claim) — the Approval tab is the place then. Below `md`: `disabled` + `hint="Creating claims is a desktop action."` (same pattern as Send back for review). `md` is the one creation breakpoint (critic #8). Dialog state is owned above `PaneMenu` (Radix unmount contract, detail-pane primer) — the dialog is rendered by `ReceiptQueue`, opened via `setClaimDialog({ ids: [receipt.documentId], opener: "pane" })`.
- Ineligible single receipt (not in claim): item enabled; the dialog opens in its "nothing eligible" state naming the reason (one path, one explanation — never a silent no-op).

### 3.3 Claim column
- `key: "claim"`, label **Claim**, `priority: "low"`, `phone: "pill"` (existing), cell: `—` when `claim === null`; else `ClaimPill` (label from `CLAIM_STATUS_LABELS`; tones: Draft slate · Submitted blue · Approved emerald · Rejected red — the existing palette, #247 d10) over a `text-xs text-slate-600 truncate` subtitle = `claimName` when `claimantId === me`, else `claimantName`. Card (`<md`): pill only, as today; the card label appends `, claim ‹status›`.
- Facet **Claim**: `param: "claim"`, options `unclaimed · draft · submitted · approved · rejected` (labels Unclaimed + `CLAIM_STATUS_LABELS`); server-side in `listWorkspaceReceipts` (`claimFilter`); the old `claimed` value no longer matches → ignored (filtered-empty shows if combined).
- Column, facet, bulk action, ⋯ item and the Approval-tab claim section all key off `claimsEnabled`.

### 3.4 Freshness (B2)
After any claim mutation from this queue (dialog add, tab submit/withdraw/remove/delete): `router.refresh()` (rows re-read server-side: Claim column, facet counts) **and** `onMutated("changed")` for the open pane (Approval tab re-reads facts), toast once. Selection after the dialog: the held-back ids stay selected, the added ids are cleared (tour #11 "scoped receipt on close") — the operator is left looking at what still needs them.

## 4. S2 — Add to expense claim dialog

Shell `Dialog`, `width="max-w-lg"`, `placement="center"` (desktop-only surface), `initialFocus` = the first radio of the target group (`#claim-target-new`), `data-inner`. Title **Add to expense claim**. Description (visible): "The receipts you selected, grouped into one claim for approval."

### 4.1 Body, top to bottom
1. **Eligibility strip** — `EligibilityStrip eligible={n} total={m}` (`components/typed-destinations/bulk-approve-receipt.tsx`), same sentence family as bulk Approve: "3 of 4 can be added".
2. **Receipts table** — `ItemizedRecapTable` records: merchant · amount · date, one table for the eligible rows; below it, when `heldBack.length > 0`, an `<h3>` "Held back" and a second `ItemizedRecapTable` whose trailing column is the reason from `ELIGIBILITY_REASON_TEXT`. `ItemizedRecord` gets an optional `note` (the reason); no bespoke table.
3. **Target** — `fieldset` legend "Add to": radiogroup, keyboard ↑/↓, no pre-selection when the operator has ≥1 draft (H5/anti-pattern: no pre-selection) — **except** when they have no drafts, then **New claim** is the only option and is selected (nothing to choose). Options: **New claim** with an inline optional text field `Title (optional)` (`maxLength 80`, placeholder "e.g. Berlin trip, September") revealed when selected; then **one of my draft claims**: each draft as a radio labelled `claimName · n receipts · ‹draft total›` (loaded on open via `listMyDraftClaimsAction`; skeleton rows while loading; "Couldn't load your drafts. Retry" inline with a Retry button on failure — New claim stays usable).
4. **Footer** — Cancel (`variant=ghost`) · **Add n receipts** (primary emerald). Primary disabled with visible reason under the footer (`role=status`, `text-[13px] text-slate-600`) when: no eligible rows ("None of these can be claimed."), no target chosen ("Choose a claim."), offline (`OFFLINE_REASON`), pending ("Adding…" as the button label, `aria-busy`).

### 4.2 Behaviour
- Submit → `addToExpenseClaimAction(ws, { documentIds, target: { new: { title } } | { claimId } })` → server re-validates each receipt with `claimEligibility`; result `{ success, data: { claimId, name, added: ids, heldBack: [{ id, reason }] } }`. On success: close, toast "Added 3 receipts to ‹name›" (or "…and 1 held back" when the server held back a row the client thought eligible — time-axis), B2 refresh, selection scoped. On refusal: dialog stays open, inline `role=alert` sentence above the footer, inputs kept, Retry = the same button.
- Escape / Cancel / backdrop close with nothing written; focus returns to the opener (bulk-bar button or the pane's ⋯ trigger — `Dialog` returns to the captured opener; the ⋯ trigger is what was focused when the menu item was clicked, verified by probe).
- Busy: the whole dialog is locked (`aria-busy` on the form, controls disabled, Esc ignored while pending — same as `ReasonDialog`).
- Max 200 receipts per claim (model); the eligibility strip's total caps at the selection; if `selected > 200` the strip says "The first 200 can be added" — an edge the bulk bar can produce with select-all.

### 4.3 States (fortify)
| State | Rendering |
|---|---|
| nothing eligible | strip "0 of n can be added", Held back table with reasons, target section hidden, primary disabled "None of these can be claimed.", Cancel is the exit |
| partial | strip "n of m", both tables, target enabled |
| all eligible, no drafts | strip, one table, New claim pre-selected (sole option), title field shown |
| drafts loading | skeleton radios (2 rows), New claim usable |
| drafts failed | inline sentence + Retry, New claim usable |
| busy | locked, "Adding…" |
| server refusal | alert sentence, inputs kept |
| offline | primary disabled with `OFFLINE_REASON`; re-enables on `online` |
| long content | merchant `truncate` at 24ch with `title`, table scrolls inside the dialog (`max-h-[40vh] overflow-auto`), footer stays visible |

## 5. S3 — Approval tab of a receipt (claim section)

Rendered by `ApprovalTab` **above** the existing timeline when `facts.claim !== null || claimsEnabled`. For a receipt the claim *is* its approval unit (#247 d4); the existing invoice-only parts (PO match, From this supplier) render as today for non-claim documents; for a receipt in a claim the section order is: claim card → stage timeline (`ApprovalTimeline` fed with the claim's `decisions`/`pendingStages`, the #232 component) → nothing else (no "From this supplier" on a receipt in a claim — one hierarchy).

### 5.1 The claim card (a `<section aria-labelledby>`, not a nested Card — plain `dl` under an `h3`)
`h3` = `claimName` with the `ClaimPill` beside it; `dl`: **Claimant** (+ " (you)" when `isMine`) · **Receipts** n · **Amount** `formatMoney(total)` (+ ", k without an amount — claimed as 0" when `missingAmounts > 0`; subtitle "as submitted" when `frozen`, "so far" when draft; when `mixed`: one line per currency from `byCurrency` and the note "Two currencies — split the claim before submitting") · **Submitted** date (when submitted) · **Waiting on** you / ‹name› / "any owner" (submitted). When `isMine && canDecide` (owner deciding their own claim, §0 question) the card adds the line **Your own claim** so self-approval is never silent (critic #7).

### 5.2 States (fortify, #247 d12)
| State | Copy and controls |
|---|---|
| unclaimed, eligible | "Not in an expense claim. Select it and use **Add to claim**." — the bold phrase is a real button that opens S2 for this receipt (lesson #264: a sentence naming an action is a control). Below `md`: sentence only + "Creating claims is a desktop action." |
| unclaimed, ineligible | "Not in an expense claim. ‹reason sentence›." (no button) |
| draft, mine or I am an owner | card + buttons: **Submit for approval** (primary) · **Remove this receipt** (outline) · **Delete draft** (red text button, `tone=danger`). Draft with 0 amount-bearing receipts: Submit disabled with visible reason "Add an amount to at least one receipt first."; `mixed` draft: Submit disabled with "Receipts are in two currencies. Remove one currency's receipts first." |
| draft, someone else's | card, read-only, line "‹Claimant›'s draft — only they or an owner can change it." |
| submitted, undecided, mine or owner | card + **Withdraw** (outline) |
| submitted, a stage decided, or not mine | card, read-only; "Waiting on ‹stage approver›" |
| approved | card, pill Approved, "Approved ‹date› by ‹name›"; Status line of the receipt may carry *In an approved claim · ‹date›* (#247 d9) |
| rejected | card, pill Rejected, "Rejected ‹date› by ‹name›: ‹reason›" + **Add to a new claim** button (opens S2 with target New claim; ≥md, below `md` the sentence carries the desktop hint) |
| loading | the pane's skeleton (existing) |
| error | the pane's existing error rendering |

### 5.3 Actions and confirms (B1 — every ⚠ names its consequence; shell `ConfirmDialog`)
- **Submit for approval** → `ConfirmDialog` title "Submit ‹name› for approval?", description "‹n receipts› · ‹total› is frozen as the amount claimed.‹ k receipts have no amount and are claimed as 0.› ‹Any owner | ‹stage name› approvers› will decide it. You can withdraw it until a stage is decided." (the bracketed sentence only when `missingAmounts > 0` — the freeze names what it excludes, critic #2) confirm **Submit for approval**. Server: `submitExpenseClaim` with `workflowId = workspace default flow` (#253 `getDefaultApprovalFlow`) else null. Success toast "Submitted ‹name›".
- **Withdraw** → `ConfirmDialog` "Withdraw ‹name›?", "It goes back to draft and leaves Ready to Approve. You can edit it and submit it again." confirm **Withdraw**. Server `withdrawExpenseClaim`: allowed while `status === "submitted"` and no `expense_claim_stage_decided` event for this claim; actor is Claimant or owner; resets `total/currencyCode/submittedAt/currentStageIndex/workflowId` to null (the freeze is re-taken on the next submit); audit `expense_claim_withdrawn`.
- **Remove this receipt** → no confirm when the draft has ≥2 receipts (reversible: Add to claim again); toast "Removed from ‹name›". When it is the last receipt → `ConfirmDialog` "Remove the last receipt?", "‹name› would be empty, so the draft is deleted too." confirm **Remove and delete draft**.
- **Delete draft** → `ConfirmDialog destructive` "Delete ‹name›?", "Its n receipts go back to Unclaimed. This cannot be undone." confirm **Delete draft**.
- All four: busy label on the confirm button ("Submitting…"), server refusal shown inside the dialog (`role=alert`, dialog stays open), offline → the trigger button disabled with `OFFLINE_REASON` beside it. Success → `onMutated("changed")` + `router.refresh()`; focus after the pane remount: the claim card's `h3` (`tabIndex=-1`, id `#claim-card-title`) via `pendingReloadFocus` for Submit/Withdraw/Remove(≥2); after **Delete draft** and **Remove the last receipt** the card no longer exists, so the target is the unclaimed sentence's **Add to claim** button `#claim-empty-action` (≥md) or the unclaimed sentence itself `#claim-empty-text` (`tabIndex=-1`, below `md` / ineligible) — the consumer tries `#claim-card-title`, then `#claim-empty-action`, then `#claim-empty-text` (probe asserts `activeElement.id` is one of them, never body; critic #3).

## 6. S4 — Approvals › Expense claims

### 6.1 Route and page
`/approvals/expense-claims` (+ `/[claimId]` deep link, `?doc=` not used — `?claim=<id>&via=notice` mirrors #271's arrival for a future notice hook; not wired by this ticket). `/[claimId]` states (critic #9): submitted & listed → pane open on the row; **decided** (approved/rejected) → pane opens with the claim card read-only and the result line "Approved ‹date› by ‹name›" / "Rejected ‹date› by ‹name›: ‹reason›" and **Back to list**, no decision bar; **draft/withdrawn** → same pane with "Withdrawn — not waiting for approval" and Back to list; **unknown id / other workspace** → in-shell `notFound()`. `notFound()` without `review-queue` **or** `expense-approvals`. Page loads `listExpenseClaimRows(ws, actor)` (all submitted claims; `approver=me` default = `canDecide`; `?approver=anyone` widens), plus the other two views' rows for segment counts through `lib/approvals/filters.ts` (`filterExpenseClaimRows`).

### 6.2 List
`QueueScreen<ExpenseClaimRow>`, title "Expense claims" (h1 ≥lg), `band` = `QueueSegments` with three segments: Invoice approvals · PO mismatches · **Expense claims** (`shortLabel` "Invoices" · "PO mismatches" · "Claims" below `md` so three fit at 390; `aria-label` always the full label + count). Columns: **Claimant** (title cell, subtitle `claimName`) · **Claim** (name; `priority: low`) · **Receipts** (n, right, tabular) · **Amount** (`formatMoney`, right, tabular, `phone: "trailing"`) · **Stage** (`stageLabel`, same as Invoices; `phone: "pill"`) · **Submitted** (date, `phone: "subtitle"` joined with "n receipts"). Leading glyph: the same `ProcessingStateGlyph` mapping the Invoices view uses. Facets: Approver (Me · Anyone) · Status (Waiting on me · Waiting on others) — the Invoices view's `APPROVAL_INVOICE_FACETS` minus Not eligible (claims have no hard checks; state that in the facet source comment). Sort: Submitted (oldest first, default) · Amount. Cards below `lg`: `title: "Ready to Approve"`, label = "‹Claimant›, ‹amount›, ‹name›, n receipts, ‹stage›". Empty: `done: { body: "Anything you can decide will show here." }` + the "N waiting on other approvers" link (same as Invoices); filtered-empty from the shell.

### 6.3 Pane
`loadDetail(claimId)` → `getExpenseClaimDetailAction` renders `ExpenseClaimDetail` inside the shared `PaneFrame` (rowName = Claimant, suffix `claimName · amount`; `paneStatus` = "Waiting on you · 1 of 1 · Owner" line). Body = source strip (the picked receipt's file, toggle on `sessionStorage["dp.source"]`) + the shared tab strip (extract `PaneTabs` from `split-pane.tsx` if not already a primitive — B4 row) with **Approval** (default, = the S3 claim card + timeline, same component rendered `readOnly` — no Submit/Withdraw/Remove/Delete buttons in the S4 pane; the decision bar is the pane's only action set, critic #6) · **Details** (the receipts list: merchant · amount · date, each a `button` "Show ‹merchant›" that sets the source strip; the picked one `aria-pressed`; a secondary `Open on Receipts` link per row with `withOrigin(…, here)`) · **Audit** (the claim's audit events through `AuditLog`). Deleted-receipt note in the Approval card when `deletedReceiptCount > 0`: "1 receipt was deleted after submission. The amount is as submitted."

### 6.4 Decision bar (sticky footer, #227 decisions 8–10)
Same footer contract as `approval-invoice-queue.tsx`: **Reject** (outline) · **Approve** (primary); `disabledReason` visible in the bar: offline → `OFFLINE_REASON`; `!canDecide` → "Only this stage's approver can decide it."; pending → "Approving…"/"Rejecting…" (`aria-live`). Reject → `ReasonDialog` (`placement` sheet <md), title "Reject ‹name›?", description "‹Claimant› gets your reason. The claim's n receipts are released to be claimed again.", submit **Reject**, reason required (textarea, initial focus). Approve → `ConfirmDialog` "Approve ‹name›?", description no flow: "Records that ‹Claimant› is owed ‹amount›. Receipts stay as they are." · with flow, not last stage: "Approving moves it to ‹nextStageName›." · last stage: "Completes the Approval: ‹Claimant› is owed ‹amount›."; when `claimant.id === actor.id` the description is prefixed "You are approving your own claim. " confirm **Approve**. Approve has no reversal in this build: an owner-only **Reopen** (approved → submitted, audited) is a real decision and becomes a Wayfinder ticket named at close (critic #4), listed in §10. Server-confirmed: `decideExpenseClaimAction(ws, claimId, decision, reason)` → `DecisionResultStrip` replaces the bar ("Approved · just now" / refusal sentence; takes focus; Back to list · Next to approve); the row stays `pinned` until the pane closes. Reject with reason writes `detail.reason` on the audit event (read back by S3 rejected state).

### 6.5 Freshness
Decision → `router.refresh()` (rows, segment counts, rail badge via layout) + result strip; the Receipts queue reads the new status on its next load (`force-dynamic`).

## 7. S5 — Phone (<lg)
- Segments: three, `shortLabel` below `md`; ←/→ across all three; count always shown incl. `(0)`.
- Expense claims cards: `QueueCard` from the column phone slots; card accessible name as §6.2. Pane = the full-screen sheet (`DetailPane` below `lg`), Approval tab first; decision sheets = `placement="sheet"` (`ReasonDialog`, `ConfirmDialog`), 48px half-width footers, Escape innermost-only with the typed reason kept.
- Creation is desktop-only at one breakpoint, `md`: no bulk bar below `md` (shell), ⋯ item disabled with hint below `md` (§3.2), S3 unclaimed/rejected sentences without the button below `md`.
- Type: h1 20px on 16px body below `lg`, controls ≥44px (`h-11`) — per breakpoint, stated here (lesson #257 H8).

## 8. Layout / typeset / clarify (Impeccable)
- Claim card: `dl` grid `grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm` exactly as the PO-match `dl`; `h3` = `text-sm font-semibold text-slate-900` (not the uppercase eyebrow style — the name is a heading, not a kicker); pill inline after it with `ml-2`. Buttons row `mt-3 flex flex-wrap gap-2`, `Button size=sm`.
- Dialog: description under the title; tables `text-sm tabular-nums`; radio rows `min-h-10` with the label as the whole row's click target; title field `mt-2 ml-6`.
- Approvals columns: amounts right-aligned tabular; Claimant is the title cell (the person is what the Approver scans for). No colour beyond the shell's pills; emerald only on Approved and primary actions.
- Copy: sentence case everywhere; verbs are the action ("Add 3 receipts", "Submit for approval", "Withdraw", "Reject", "Approve"); every disabled control has a visible reason; every error names the receipt by merchant.
- Numbers on the row and the pane come from one function each (`sumReceiptTotals`, `items.length`).

## 9. Accessibility (include)
- Dialog: focus enters the first radio (or the primary when only New claim); Tab order strip → tables (not focusable) → radios → title field (when New claim) → Cancel → Add; Esc closes, focus returns to opener; `aria-describedby` on the primary → the reason line when disabled; `role=alert` for refusals.
- Approval-tab buttons: in DOM order after the `dl`; each confirm's focus returns to its trigger; after a successful mutation the remount focuses `#claim-card-title`.
- Segments: `role=tablist` links, full name in `aria-label` ("Expense claims, 2").
- Cards: explicit comma-separated `aria-label`; no nested `<a>`/`<button>` inside the card (Details' Open on Receipts link lives in the pane).
- Decision sheets: 44px controls, reason textarea labelled, initial focus textarea; result strip `tabIndex=-1` takes focus.
- Colour never alone: pill words carry the state; the picked receipt in Details is `aria-pressed` + a left check icon with label.
- Reduced motion: no new motion; the shell Dialog has none (N/A-pass).

## 10. Not in scope / pending
- Deleting `ExpenseClaimsPage`, `ExpenseClaimForm`, `ExpenseClaimRow`, the workflow picker, `lib/modules` navItem: **pending owner sign-off on #274** — unreferenced only.
- Approval notice for claims: the sender (#271) keys on `ReviewTask`; extending it to claims is a follow-up ticket named at close, not silently added.
- Claimant self-approval rule: question for the owner (§0). This build labels the case ("Your own claim", confirm prefix) and does not block it.
- **Reopen an approved claim** (owner-only, approved → submitted, audited): real decision, Wayfinder ticket to create at close; costs H3 its 4 (critic #4).
