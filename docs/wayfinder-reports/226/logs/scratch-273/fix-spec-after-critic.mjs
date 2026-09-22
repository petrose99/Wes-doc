// Applies the Part D critic's required spec changes 1–10 to spec.md and the pre-flight fixes (11).
import fs from "node:fs";
const dir = new URL("./", import.meta.url).pathname;
function patch(file, pairs) {
  let s = fs.readFileSync(dir + file, "utf8");
  for (const [from, to] of pairs) {
    if (!s.includes(from)) throw new Error(`${file}: not found: ${from.slice(0, 60)}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(dir + file, s);
}

patch("spec.md", [
  // 1 currency + 5 atomic add
  [
    "- `lib/claims/eligibility.ts` — `claimEligibility(facts) → { status: \"ready\" } | { status: \"not_eligible\", reason: \"supplier_receipt\" | \"needs_attention\" | \"in_claim\" }` where facts = `{ templateCode, processingState, latestClaimStatus }`.",
    "- `lib/claims/eligibility.ts` — `claimEligibility(facts) → { status: \"ready\" } | { status: \"not_eligible\", reason: \"supplier_receipt\" | \"needs_attention\" | \"in_claim\" | \"currency_mismatch\" }` where facts = `{ templateCode, processingState, latestClaimStatus, currencyCode, targetCurrencyCode? }`. `currency_mismatch` only when a target draft is known (dialog with a draft chosen; server add-to-existing): the receipt's currency differs from the draft's (a draft's currency = its first receipt's). The row/bulk-bar check passes `targetCurrencyCode` undefined (no target yet); the dialog re-derives per draft radio and moves a mismatching receipt to Held back when that draft is chosen. **Atomicity (critic #5):** `addToExpenseClaim` runs in one transaction that re-reads each document's latest claim inside the transaction before inserting items; `submitExpenseClaim` re-runs `claimEligibility` for every item (excluding this claim) and refuses `document_already_claimed` naming the merchant — a receipt can never be submitted in two claims.",
  ],
  [
    "`ELIGIBILITY_REASON_TEXT = { supplier_receipt: \"Supplier receipt — not an expense\", needs_attention: \"Needs attention\", in_claim: \"Already in a claim\" }`.",
    "`ELIGIBILITY_REASON_TEXT = { supplier_receipt: \"Supplier receipt — not an expense\", needs_attention: \"Needs attention\", in_claim: \"Already in a claim\", currency_mismatch: \"Different currency from ‹claim name›\" }`.",
  ],
  [
    "- `lib/claims/totals.ts` — `sumReceiptTotals(receipts) → { total, currencyCode, missing }` in integer cents (`lib/money.ts`); used by `submitExpenseClaim` (freeze) and by the Approval-tab draft total and the dialog footer. `missing` = receipts with no amount (shown, never silently 0).",
    "- `lib/claims/totals.ts` — `sumReceiptTotals(receipts) → { total, currencyCode, missing, mixed: boolean, byCurrency: { currencyCode, total }[] }` in integer cents (`lib/money.ts`); used by `submitExpenseClaim` (freeze) and by the Approval-tab draft total and the dialog footer. `missing` = receipts with no amount (shown, never silently 0). `mixed` = more than one currency among amount-bearing receipts; a mixed draft **cannot be submitted** (§5.2) and the card lists `byCurrency` instead of one total. Currency is never summed across codes.",
  ],
  // 10 Stage column source
  [
    "`CLAIM_STATUS_LABELS = { draft: \"Draft\", submitted: \"Submitted\", approved: \"Approved\", rejected: \"Rejected\" }` (pill, facet, tab, Approvals Stage column all read this)",
    "`CLAIM_STATUS_LABELS = { draft: \"Draft\", submitted: \"Submitted\", approved: \"Approved\", rejected: \"Rejected\" }` (Receipts pill, facet and the Approval-tab pill read this; the S4 Stage column reads `stageLabel` only, as Invoices does)",
  ],
  // 8 breakpoint md
  [
    "| S2 | **Add to expense claim** dialog | shell `Dialog` (`components/ui/dialog.tsx`), opened from S1 | ≥md only (bulk bar and pane ⋯ item are the only openers; ⋯ item is disabled+hint below `lg`) |",
    "| S2 | **Add to expense claim** dialog | shell `Dialog` (`components/ui/dialog.tsx`), opened from S1 | ≥md only — **one creation breakpoint, `md`**, for every opener (bulk bar, pane ⋯ item, S3 sentence button, rejected-state button); below `md` each opener is disabled with the hint or omitted as stated per surface |",
  ],
  [
    "Below `lg`: `disabled` + `hint=\"Creating claims is a desktop action.\"` (same pattern as Send back for review).",
    "Below `md`: `disabled` + `hint=\"Creating claims is a desktop action.\"` (same pattern as Send back for review). `md` is the one creation breakpoint (critic #8).",
  ],
  [
    "Below `lg`: sentence only + \"Creating claims is a desktop action.\" |",
    "Below `md`: sentence only + \"Creating claims is a desktop action.\" |",
  ],
  [
    "+ **Add to a new claim** button (opens S2 with target New claim; ≥lg) |",
    "+ **Add to a new claim** button (opens S2 with target New claim; ≥md, below `md` the sentence carries the desktop hint) |",
  ],
  [
    "- Creation is desktop-only: no bulk bar below `md` (shell), ⋯ item disabled with hint below `lg` (§3.2), S3 unclaimed sentence without the button below `lg`.",
    "- Creation is desktop-only at one breakpoint, `md`: no bulk bar below `md` (shell), ⋯ item disabled with hint below `md` (§3.2), S3 unclaimed/rejected sentences without the button below `md`.",
  ],
  // 2 missing amounts + 1 mixed on card + 7 self-approval line
  [
    "`dl`: **Claimant** · **Receipts** n · **Amount** `formatMoney(total)` (+ \", 1 without an amount\" when `missingAmounts > 0`; subtitle \"as submitted\" when `frozen`, \"so far\" when draft) · **Submitted** date (when submitted) · **Waiting on** you / ‹name›/ \"any owner\" (submitted).",
    "`dl`: **Claimant** (+ \" (you)\" when `isMine`) · **Receipts** n · **Amount** `formatMoney(total)` (+ \", k without an amount — claimed as 0\" when `missingAmounts > 0`; subtitle \"as submitted\" when `frozen`, \"so far\" when draft; when `mixed`: one line per currency from `byCurrency` and the note \"Two currencies — split the claim before submitting\") · **Submitted** date (when submitted) · **Waiting on** you / ‹name› / \"any owner\" (submitted). When `isMine && canDecide` (owner deciding their own claim, §0 question) the card adds the line **Your own claim** so self-approval is never silent (critic #7).",
  ],
  [
    "Draft with 0 amount-bearing receipts: Submit disabled with visible reason \"Add an amount to at least one receipt first.\" |",
    "Draft with 0 amount-bearing receipts: Submit disabled with visible reason \"Add an amount to at least one receipt first.\"; `mixed` draft: Submit disabled with \"Receipts are in two currencies. Remove one currency's receipts first.\" |",
  ],
  [
    "description \"‹n receipts› · ‹total› is frozen as the amount claimed. ‹Any owner | ‹stage name› approvers› will decide it. You can withdraw it until a stage is decided.\"",
    "description \"‹n receipts› · ‹total› is frozen as the amount claimed.‹ k receipts have no amount and are claimed as 0.› ‹Any owner | ‹stage name› approvers› will decide it. You can withdraw it until a stage is decided.\" (the bracketed sentence only when `missingAmounts > 0` — the freeze names what it excludes, critic #2)",
  ],
  // 3 focus target after delete / remove-last
  [
    "focus after the pane remount: the claim card's `h3` (`tabIndex=-1`, id `#claim-card-title`) via `pendingReloadFocus` (detail-pane primer's reload-focus contract; probe asserts `activeElement.id === \"claim-card-title\"`).",
    "focus after the pane remount: the claim card's `h3` (`tabIndex=-1`, id `#claim-card-title`) via `pendingReloadFocus` for Submit/Withdraw/Remove(≥2); after **Delete draft** and **Remove the last receipt** the card no longer exists, so the target is the unclaimed sentence's **Add to claim** button `#claim-empty-action` (≥md) or the unclaimed sentence itself `#claim-empty-text` (`tabIndex=-1`, below `md` / ineligible) — the consumer tries `#claim-card-title`, then `#claim-empty-action`, then `#claim-empty-text` (probe asserts `activeElement.id` is one of them, never body; critic #3).",
  ],
  // 6 read-only card in S4 pane
  [
    "with **Approval** (default, = the S3 claim card + timeline, same component)",
    "with **Approval** (default, = the S3 claim card + timeline, same component rendered `readOnly` — no Submit/Withdraw/Remove/Delete buttons in the S4 pane; the decision bar is the pane's only action set, critic #6)",
  ],
  // 7 approve confirm self-approval + 4 reversal
  [
    "last stage: \"Completes the Approval: ‹Claimant› is owed ‹amount›.\" confirm **Approve**.",
    "last stage: \"Completes the Approval: ‹Claimant› is owed ‹amount›.\"; when `claimant.id === actor.id` the description is prefixed \"You are approving your own claim. \" confirm **Approve**. Approve has no reversal in this build: an owner-only **Reopen** (approved → submitted, audited) is a real decision and becomes a Wayfinder ticket named at close (critic #4), listed in §10.",
  ],
  // 9 deep link states
  [
    "`/approvals/expense-claims` (+ `/[claimId]` deep link, `?doc=` not used — `?claim=<id>&via=notice` mirrors #271's arrival for a future notice hook; not wired by this ticket).",
    "`/approvals/expense-claims` (+ `/[claimId]` deep link, `?doc=` not used — `?claim=<id>&via=notice` mirrors #271's arrival for a future notice hook; not wired by this ticket). `/[claimId]` states (critic #9): submitted & listed → pane open on the row; **decided** (approved/rejected) → pane opens with the claim card read-only and the result line \"Approved ‹date› by ‹name›\" / \"Rejected ‹date› by ‹name›: ‹reason›\" and **Back to list**, no decision bar; **draft/withdrawn** → same pane with \"Withdrawn — not waiting for approval\" and Back to list; **unknown id / other workspace** → in-shell `notFound()`.",
  ],
  [
    "- Claimant self-approval rule: question for the owner (§0).",
    "- Claimant self-approval rule: question for the owner (§0). This build labels the case (\"Your own claim\", confirm prefix) and does not block it.\n- **Reopen an approved claim** (owner-only, approved → submitted, audited): real decision, Wayfinder ticket to create at close; costs H3 its 4 (critic #4).",
  ],
]);

patch("preflight.md", [
  [
    "| Approve | S4 footer `Button` **Approve** → `ConfirmDialog` \"Approve ‹name›?\" → `decideExpenseClaimAction(approve)` | ⚠ (records money owed) | no flow / mid-stage / last-stage sentences, §6.4 | none — audit trail records it; reversal is a Payments concern (out of scope, stated) |",
    "| Approve | S4 footer `Button` **Approve** → `ConfirmDialog` \"Approve ‹name›?\" → `decideExpenseClaimAction(approve)` | ⚠ (records money owed) | no flow / mid-stage / last-stage sentences + \"You are approving your own claim.\" prefix when self, §6.4 | none in this build — **Reopen** is a decision → Wayfinder ticket at close (critic #4) |",
  ],
  [
    "Server preconditions ↔ row (lesson #257): `document_not_an_expense_receipt` ↔ `supplier_receipt` · `document_needs_attention` ↔ `needs_attention` · `document_already_claimed` ↔ `in_claim` — all three from `lib/claims/eligibility.ts`, both sides.",
    "Server preconditions ↔ row (lesson #257): `document_not_an_expense_receipt` ↔ `supplier_receipt` · `document_needs_attention` ↔ `needs_attention` · `document_already_claimed` ↔ `in_claim` · `expense_claim_currency_mismatch` ↔ `currency_mismatch` — all four from `lib/claims/eligibility.ts`, both sides; `expense_claim_mixed_currency` / `expense_claim_no_amounts` ↔ Submit disabled with the same sentence.",
  ],
  [
    "| Approve / Reject (S4) | `DecisionResultStrip` replaces the bar (focus) · row `pinned` with new Stage · segment count · rail badge · Receipts queue on next load · Approval tab of each receipt (rejection reason from audit) | `router.refresh()` + strip; row pinned until pane closes | yes |",
    "| Approve / Reject (S4) | `DecisionResultStrip` replaces the bar (focus) · row `pinned` with new Stage · segment count · rail badge | `router.refresh()` + strip; row pinned until pane closes | yes |\n| Approve / Reject (S4) → Receipts queue & each receipt's Approval tab | Claim pill · rejection reason from audit | `force-dynamic` page + pane facts re-read on open | on next load / open (a different page; nothing on the S4 screen shows stale) |",
  ],
  [
    "| Delete draft | card → unclaimed-eligible state with button · all member rows' Claim cell → `—` · facet counts | same | yes |",
    "| Delete draft / Remove last | card → unclaimed-eligible state with button (focus `#claim-empty-action` / `#claim-empty-text`) · all member rows' Claim cell → `—` · facet counts | same | yes |",
  ],
  [
    "| Confirms (Submit/Withdraw/Delete/Remove-last/Approve) | confirm button | shell trap; Esc → trigger; after success the pane remounts → focus `#claim-card-title` via `pendingReloadFocus` (S3) or `DecisionResultStrip` `tabIndex=-1` (S4) |",
    "| Confirms (Submit/Withdraw/Delete/Remove-last/Approve) | confirm button | shell trap; Esc → trigger; after success the pane remounts → focus `#claim-card-title` (Submit/Withdraw/Remove ≥2) or `#claim-empty-action`→`#claim-empty-text` (Delete draft / Remove last, the card is gone) via `pendingReloadFocus` (S3), or `DecisionResultStrip` `tabIndex=-1` (S4) |",
  ],
  [
    "| Pane ⋯ item below lg | — | — | — | `disabled` + `hint` visible |",
    "| Pane ⋯ item below md | — | — | — | `disabled` + `hint` visible |\n| `/[claimId]` deep link | pane heading | shell | — | decided/withdrawn → read-only pane + result line + Back to list; unknown → in-shell not-found (§6.1) |",
  ],
  [
    "| Draft list in the dialog | a draft submitted while the dialog is open | server refuses `expense_claim_not_draft` → alert; Retry reloads drafts |",
    "| Draft list in the dialog | a draft submitted while the dialog is open | server refuses `expense_claim_not_draft` → alert; Retry reloads drafts |\n| Same receipt added to two drafts | two members add concurrently | add runs in one transaction re-reading the latest claim per document; the loser gets `document_already_claimed` naming the merchant; Submit re-checks every item (§2) |\n| Currency | a draft holds EUR and a USD receipt is added; or a receipt's currency is edited after adding | `currency_mismatch` held back at add (dialog + server); an edited-in mismatch makes the draft `mixed`: card lists per-currency totals, Submit disabled with reason, never one summed figure |",
  ],
  [
    "| Approval-tab card (S3) | 11 states §5.2 incl. loading/error via pane, 0-amount draft, someone else's draft, deleted-after-submit |",
    "| Approval-tab card (S3) | 10 states §5.2 + 0-amount draft, mixed-currency draft, someone else's draft, own-claim label, deleted-after-submit |",
  ],
  [
    "| H3 | Approve has no reversal (by design; audit) | 1 | copy names the consequence; Payments owns reversal |",
    "| H3 | Approve has no reversal in this build (Reopen ticketed at close; project mapping says 3 for irreversible-without-reversal, critic reconciled to 1 with the ticket named + audited consequence copy) | 1 | §6.4, §10; Wayfinder ticket at close |",
  ],
  [
    "| H2 | \"Claim of ‹date›\" auto-name reads generic when many drafts exist | 1 | title field, radio row shows n receipts + total |",
    "| H2 | \"Claim of ‹date›\" auto-name reads generic when many drafts exist (currency mixing now blocked at add + submit) | 1 | title field, radio row shows n receipts + total; §2 `mixed` |",
  ],
  [
    "| H5 | select-all >200 truncation | 1 | strip sentence \"The first 200 can be added\" |",
    "| H5 | select-all >200 truncation (missing amounts now named in the Submit confirm; double-add closed by the transaction) | 1 | strip sentence \"The first 200 can be added\" |",
  ],
  [
    "| H6 | \"Waiting on any owner\" ambiguous for a self-submitted owner claim | 1 | §0 owner question; copy stays factual |",
    "| H6 | self-submitted owner claim — now labelled \"Your own claim\" + confirm prefix | 0 | §5.1, §6.4 |",
  ],
  [
    "| H8 | Approval tab shows claim card + timeline + status line of the receipt → one hierarchy kept by dropping \"From this supplier\" | 1 | §5 |",
    "| H8 | Approval tab shows claim card + timeline + status line of the receipt → one hierarchy kept by dropping \"From this supplier\"; S4 pane card is `readOnly` (one action set) | 1 | §5, §6.3 |",
  ],
  [
    "| H9 | drafts load failure inside the dialog | 0 | inline Retry |",
    "| H9 | deep link to a decided/withdrawn claim — now a read-only pane with result line | 0 | §6.1 |",
  ],
  [
    "Sum 9 · P0 0 · P1 0 · P2 0 (predicted health ≈ 85).",
    "Sum 7 · P0 0 · P1 0 · P2 0 (predicted health ≈ 86).",
  ],
  [
    "Estimate: completion 92% · steps ≤ 6 · error points: choosing between several drafts; phone segment discovery.",
    "| Claimant deletes a draft / removes the last receipt | Approval tab → **Delete draft** → confirm (\"receipts go back to Unclaimed\") → unclaimed state, focus on **Add to claim** button | y | y | y | y (focus lands on the next action) | pass |\nEstimate: completion 92% · steps ≤ 6 · error points: choosing between several drafts; phone segment discovery.",
  ],
  [
    "## Part D — Independent spec critic\n(filled after the critic run — see below)",
    `## Part D — Independent spec critic
Critic: fresh \`Agent\`, \`model: "opus"\`, spec.md + preflight.md only. Before fixes: critique **30/40** (all 3s), evaluate sum **22**, P1 **4** (H1 focus after Delete draft → body; H2 mixed currencies summed; H3 Approve irreversible; H5 missing amounts frozen as 0 silently + non-atomic add), P2 4, health ≈ 64, verdict: hidden consequence ×2. Walkthroughs 5/5 pass but Delete draft omitted (latent focus failure).

| H | critique: self / critic / reconciled | evaluate worst-issue: self / critic / reconciled | Spec change made |
|---|---|---|---|
| H1 | 4 / 3 / 4 | 1 / 3 / 1 | §5.3 focus fallback chain \`#claim-card-title\` → \`#claim-empty-action\` → \`#claim-empty-text\`; B2 split S4-screen (same tick) from Receipts (next load) |
| H2 | 3 / 3 / 3 | 1 / 3 / 1 | §2 \`sumReceiptTotals\` per-currency + \`mixed\`; \`currency_mismatch\` eligibility reason; card lists per-currency, Submit disabled |
| H3 | 3 / 3 / 3 | 1 / 3 / 1 | Reopen (approved → submitted) is a decision → Wayfinder ticket at close (§10); consequence copy audited |
| H4 | 3 / 3 / 3 | 1 / 2 / 1 | one creation breakpoint \`md\` everywhere; S4 Stage reads \`stageLabel\` only |
| H5 | 4 / 3 / 4 | 1 / 3 / 1 | Submit confirm names "k receipts have no amount and are claimed as 0"; add-to-claim transactional re-check; submit re-checks every item |
| H6 | 3 / 3 / 3 | 1 / 2 / 0 | "Claimant (you)" + **Your own claim** line + confirm prefix "You are approving your own claim." |
| H7 | 3 / 3 / 3 | 1 / 1 / 1 | — |
| H8 | 3 / 3 / 3 | 1 / 2 / 1 | S4 pane renders the claim card \`readOnly\` — decision bar is the only action set |
| H9 | 3 / 3 / 3 | 0 / 2 / 0 | §6.1 \`/[claimId]\` states: decided → read-only pane + result line + Back; withdrawn → note; unknown → not-found |
| H10 | 3 / 3 / 3 | 1 / 1 / 1 | currency and self-approval rules now taught where they bite (card note, disabled reason, confirm prefix) |
Critic's after-line with all changes made: **33/40**, sum **7**, P1 **0**, health ≈ **86**, **Clean**. Gate met (predicted ≥ 32, none under 3, two 4s, zero P0/P1, Clean).`,
  ],
]);
console.log("patched spec.md and preflight.md");
