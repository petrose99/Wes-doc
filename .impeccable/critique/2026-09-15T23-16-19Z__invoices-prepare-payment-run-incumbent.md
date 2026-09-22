---
target: "Incumbent Prepare-payment-run flow on the Invoices queue (bulk bar → ConfirmDialog → CSV download → nothing) — baseline for #229 Bill Pay, map #226"
total_score: 13
max_score: 40
na_heuristics: 
p0_count: 3
p1_count: 3
target_identity: "file:/home/ubuntu/Dev/Wes-doc/components/queue/invoice-queue.tsx"
target_fingerprint: "sha256:b017457e64f4ee280824a25c6ef9d5e8b4b4c010c31e56a9053b2f9afa25bb76"
target_path: /home/ubuntu/Dev/Wes-doc/components/queue/invoice-queue.tsx
timestamp: 2026-09-15T23-16-19Z
slug: invoices-prepare-payment-run-incumbent
---
Method: dual-agent (A: design review in the critique context from a code read of `invoice-queue.tsx` `PaymentRunAction` :187-216, `(queue)/invoices/page.tsx` :52-55, `(chrome)/bills/actions.ts`, `models/payment-runs.ts`, the download route, `za-eft-csv.ts`, `remittance.ts`, `bulk-approve-receipt.tsx`, `confirm-dialog.tsx`, `document-actions.tsx`, `queue-screen.tsx` :229-233 · B: general-purpose detector subagent — Playwright headless Chromium against the running dev server on :3000 with the pre-existing `live-server` on :8400, in-page `detect.js` at 1440×900 and 390×844 in both states, two seeded rows checked, dialog opened then dismissed with Escape so no run was written). Static `impeccable detect` NOT RUN — the binary was denied by the session's permission policy after a real attempt; the in-page overlay is the only deterministic evidence. Mode: Operate. Scored as the whole flow the Owner lives through, not the dialog alone: select rows → bulk bar → "Prepare payment run (n)" → confirm → CSV download → what comes after (no run list, no Mark as Paid / Sent, no pay-from account). Slug is a literal — `critique-storage slug` could not be run.

## Design Health Score — 13/40 (Poor)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 1 | Confirm → `requestSubmit()` → server redirect to the CSV (`bills/actions.ts:22`). No toast, no receipt, no row change: a row that is now in a draft run looks identical to one that is not (`StatePills` `ledger` pill only carries the ledger's `paymentStatus`, `row-cells.tsx:61`). `revalidatePath('/bills')` (`actions.ts:21`) targets the legacy redirect page (`(chrome)/bills/page.tsx:17`), so the queue the operator is standing on is not revalidated. Rows the server drops (`already_in_active_run`, `missing_supplier`, `missing_bank_account`, `payment-runs.ts:55-63`) go only into the audit `detail.skipped` (`:109`); the screen never says "2 of 5 were left out". |
| 2 | Match System / Real World | 2 | Title and "No money moves" (`invoice-queue.tsx:205-206`) are honest and in the operator's language. But the strip inside a *payment* dialog reads "Eligible for Approval (n of m)" (`bulk-approve-receipt.tsx:25`); recap dates are ISO `2026-09-20` (`:71`) while the table beneath shows "Sep 20, 2026"; `formatMoney` falls back to **USD** when a row has no currency code (`:124`) on a ZA-EFT product. |
| 3 | User Control and Freedom | 1 | Cancel/Escape work. After Confirm there is no exit: the run is persisted as `draft` (`payment-runs.ts:88`) and cannot be voided, edited or un-prepared from any surface; `PaymentRunItem.active` exists for exactly that (`:36`) and nothing sets it. No per-row amount, no partial payment, no pay-from account — the selection is the whole decision. |
| 4 | Consistency and Standards | 2 | Same `ConfirmDialog` + `EligibilityStrip` + `ItemizedRecapTable` grammar as bulk Approve (good). But `ConfirmDialog` is `max-w-sm` (`confirm-dialog.tsx:86`) and its own doc says "a confirm dialog that grows a form should be a Dialog" (`:26-27`) — the five-column recap is clipped at both widths (B: 387px table in a 344px / 302px wrapper, Due column cut). Approve gets a post-action receipt modal; Prepare payment run gets none, by the component's own admission (`bulk-approve-receipt.tsx:41-43`). |
| 5 | Error Prevention | 1 | **No approval gate.** `payableBills` (`page.tsx:54`) tests `blockedByCheck`, `cancelledAt`, `total > 0`, not-paid — never `approvalStatus`/`status`. A `not_started`, `in_progress` or `rejected` invoice is payable; the ledger push requires `stage: "approved"` (per the Finance snapshot). The strip's "n of m" counts only `blockedByCheck`; the server additionally drops rows for missing bank account / supplier / already-in-run, so the dialog can promise 5 and the file carry 3 with no warning. Duplicate-payment protection exists (`alreadyInRun`, `:35-39`) but is invisible before confirm. |
| 6 | Recognition Rather Than Recall | 1 | Nothing on screen says which invoices are already in a run, when the last run was, or what was in it. `listPaymentRuns` (`payment-runs.ts:141`) has no caller; the re-download route (`download/route.ts`) is reachable only by a URL nobody is shown. Next Friday the Owner must *remember*. |
| 7 | Flexibility and Efficiency | 2 | Bulk selection, select-all, owner-only gating done server-side too (`actions.ts:15`). No amount-to-pay, no pay-from, no way to build a run from a saved view without re-ticking rows; no keyboard accelerator; button hidden (not disabled-with-reason) for non-owners and for selections with zero payable rows (`invoice-queue.tsx:197`). |
| 8 | Aesthetic and Minimalist Design | 2 | Dialog is spare and the recap is the right idea. Detector: `flat-type-hierarchy` (body 14 / h2 16 / h1 18), `nested-cards` on the recap wrapper and footer row, `cramped-padding` on both "Prepare payment run" buttons (0px vertical padding at 12px text). At 390 the bulk bar wraps to two rows (h 89px) with Delete landing beside the payment button. |
| 9 | Error Recovery | 0 | Every failure is a thrown string — `owner_only`, `no_documents_selected` (`actions.ts:15,18`), `no_payable_bills_after_filtering` (`payment-runs.ts:75`) — from a form `action`, so it lands on `workspaces/[workspaceId]/error.tsx`: "This page could not be loaded. Something went wrong on our side." plus a Sentry digest. Selecting two invoices that were both in last week's run produces an *outage screen*, not "these are already in run payment-run-2026-09-08-1435.csv". `validatePaymentInstructions` (`za-eft-csv.ts:35`) is written to return every problem at once and is never called. |
| 10 | Help and Documentation | 1 | "Downloads a payment file for the eligible invoices below. No money moves." is the whole help. Nothing says which bank portals accept the file, what to do after the upload, or that per-supplier remittance advices exist — they are built (`payment-runs.ts:82`) and discarded by the only caller (`actions.ts:20` destructures `{ run }`). |

## Design Specificity Verdict

**LLM assessment:** The *policy* is specific and good — "prepare, don't execute", owner-only, server-side dedupe, a CSV that stays outside the payment-licence perimeter (`za-eft-csv.ts:6-9`). The *surface* is category-interchangeable: an outline button on a generic bulk bar, a `max-w-sm` confirm with a clipped table, a browser download. Nothing shows the Vic-style Bill Pay shape the tour findings already record (Amount To Pay, Pay From, Create Batch, Mark as Paid, a Payment Batches queue) and nothing carries the queue's own language (processing glyph, Approved pill) into the decision. A competitor's logo drops straight in.

**Deterministic scan (static):** not run — `impeccable detect` was denied by the permission policy after a real attempt. Recorded as unavailable, not clean.

**In-page detector (Assessment B):**

| State | 1440×900 | 390×844 |
|---|---|---|
| Two rows checked, bulk bar visible | 6 | 7 |
| Prepare-payment-run confirm open | 11 | 11 |

Shell baseline at both widths: 5 (`overused-font`, `layout-transition`, `dark-glow` on `body`; `ai-color-palette` ×2 on the workspace-switcher avatar) — repo-wide false positives per the Invoices and Finance snapshots. Net surface findings: **bulk bar 1 @1440 / 2 @390** — `cramped-padding` on the "Prepare payment run (2)" button (0px vertical padding, 12px text), plus the wrap at 390; **dialog 6 / 6** — `cramped-padding` + `nested-cards` on `div.max-h-64.overflow-y-auto` (the recap wrapper), `cramped-padding` on the confirm button, `nested-cards` on the footer button row, `flat-type-hierarchy`. All six are real.

**Measured (B):** checkboxes 16×16 in the row; bulk bar `position: static`, 89px tall at 390 (two rows); dialog recap table 387px wide inside a 344px (1440) / 302px (390) scroll wrapper — the Due column is cut at both widths; dialog title h2 16px over 14px body.

**Keyboard (B, 1440, dialog open):** `role="alertdialog"` with `aria-modal`, but `document.activeElement` stays on the opener button — `ConfirmDialog` only moves focus when `children` contains a `textarea, input, select` (`confirm-dialog.tsx:48-54`) and suppresses both `autoFocus`es when `children` is present (`:93-94`). Tab from there walks the page underneath the overlay until it happens to enter the portal. Escape closes and returns focus correctly.

Screenshots: `/tmp/scratch229/bulk-1440.png`, `/tmp/scratch229/confirm-1440.png`, `/tmp/scratch229/bulk-390.png`, `/tmp/scratch229/confirm-390.png`. The dialog was dismissed with Escape; no payment run was written to the dev DB.

## Overall Impression

A well-reasoned back end wearing no clothes. The model knows about draft/sent status, active items, skipped reasons, remittance advices and re-download; the operator sees an outline button, a small dialog and a file in the Downloads folder. The single biggest opportunity is the one #229 names: give the run a *home* (a Bill Pay queue that carries approval, pay-from and amount; a Payment Batches list that answers "did I already pay this") so that Confirm is the middle of the flow rather than its end.

## What's Working

- "No money moves" and "Prepare" (not "Pay") are honest verbs for a prepare-only product; the licence-perimeter reasoning in `za-eft-csv.ts` is exactly the kind of constraint the copy should keep surfacing.
- Confirm carries an itemised recap (vendor / number / amount / due) before any financial write — the Server-confirmed-action pattern, shared with Approve.
- Server-side defence in depth: owner check, cancelled check, amount check and already-in-active-run dedupe all re-run in `preparePaymentRun` regardless of what the client sent.
- Escape / backdrop cancel and focus return to the opener behave.

## Priority Issues

- **[P0] Payment eligibility ignores approval.** `page.tsx:54` lets an unapproved, in-review or rejected invoice into a payment file while the ledger push demands `approved`. Two rules for "what do I pay", and the more dangerous one is the looser one. Fix: `payable` requires `approvalStatus === "approved"` (or `status === "reviewed"` with no open review task, per `DocumentPaneActions:146`), and the strip names the rule ("Approved and payable (n of m)"). This is #249's decision; record it there, do not silently re-decide here. `/impeccable harden`.
- **[P0] The flow ends in a dead end.** After the download there is no list of runs, no per-row "in run …" fact, no Mark as Sent / Mark as Paid, and `markPaymentRunSent` / `listPaymentRuns` have no callers. The dedupe is therefore *invisible*: the Owner cannot see that Friday's rows were already prepared on Tuesday. Fix: a Payment Batches surface reading `listPaymentRuns`, a `ledger`-style pill "In run · 8 Sep" on the row, and a "Mark as sent to bank" action on the run. This is #229's scope. `/impeccable shape`.
- **[P0] Business rules surface as an outage.** Thrown strings from the form action (`owner_only`, `no_payable_bills_after_filtering`) render `error.tsx`'s "Something went wrong on our side" with a Sentry digest. "Everything you picked is already in an active run" is the most likely real-world case and it reads as a crash. Fix: return a result object, keep the dialog open with the reason per row (use `validatePaymentInstructions`, which already exists for this), never redirect on failure. `/impeccable harden`.
- **[P1] The confirm promises more than the file contains.** Strip counts `blockedByCheck` only; the server also drops missing-bank-account / missing-supplier / already-in-run rows and tells no one. Fix: compute eligibility server-side (one round trip on dialog open) and show the held-back rows and their reasons in the recap, as the Approve receipt already does for held-back rows. `/impeccable harden`.
- **[P1] Wrong words in the payment dialog.** "Eligible for Approval" in a payment confirm; ISO dates against formatted dates one layer down; USD fallback for a missing currency. Fix: parametrise the strip's noun ("Payable"), format recap dates with the queue's `formatDate`, and never default a payment amount's currency — show "— currency missing" and exclude the row. `/impeccable clarify`.
- **[P1] Focus does not enter the alertdialog.** With `children` present and no input inside, neither button is auto-focused and no rAF focus fires; Tab walks the page under the scrim. Fix: when `children` has no form control, focus the dialog container (`tabIndex={-1}`) or the Cancel button. `/impeccable audit`.
- **[P2] The recap is clipped inside `max-w-sm`.** Five columns at 387px in a 344/302px wrapper cuts Due at both widths. Fix: promote the payment confirm to `Dialog` at `max-w-lg` (the component's own rule) or drop Type (always "Invoice" here). `/impeccable layout`.
- **[P2] Bulk bar rendering.** `cramped-padding` on the outline button; two-row wrap at 390 with Delete beside the payment action; 16×16 checkboxes for a money decision. `/impeccable adapt`.

## Persona Red Flags — Owner preparing Friday's payment run

- **Does approval gate it?** No. She filters `Unpaid only`, selects all, and the count in "Prepare payment run (14)" includes the three invoices her bookkeeper has not signed off. The row's Approved pill is the only tell, and the dialog's recap does not repeat it.
- **Can she see what was already in a run?** No. Tuesday's run covered six of these rows; nothing in the row, the bulk bar or the dialog says so. The server will silently drop those six — and if she selected *only* those six, she gets "This page could not be loaded".
- **What does she do after the download?** Guess. The file lands as `payment-run-2026-09-18-1435.csv`; no screen says "uploaded to the bank yet?", no Mark as Sent, no remittance advice to send the supplier although one was generated. The queue looks exactly as it did before she clicked, so "did it work?" is answered by the Downloads folder.
- **Alex (power user):** cannot set a pay-from account or adjust an amount; must re-tick rows every Friday; no shortcut; non-owner colleagues see no button and no reason.
- **Sam (keyboard / screen reader):** alertdialog announced but focus never arrives in it; Tab moves through the hidden page; the strip's status colour (emerald vs amber) is the only carrier of "some are ineligible" beyond the numbers.

## Minor Observations

`revalidatePath` targets a redirect page; the download route lets any member re-download while only owners can create (documented, fine, but unsurfaced); `paymentRunFilename` uses UTC so a 16:05 SAST run is stamped `1405`; remittance advice copy "has been processed to your bank account" is untrue at prepare time — it should say "has been scheduled"; `PaymentRunAction` returns `null` rather than a disabled button with a reason when nothing is payable, so the action is undiscoverable.

## Questions to Consider

1. If approval is the gate, is the Bill Pay queue simply the Invoices queue filtered to `approval=approved&unpaid=1` with a different bulk bar — or does it need its own columns (Amount to pay, Pay from, Terms) badly enough to be a separate surface (#229)?
2. Should Confirm write a `draft` run at all, or should the run only exist once the Owner says "sent to bank"? Today a mis-click leaves a permanent draft that silently blocks those rows from the next run.
3. Where do the remittance advices go — attached to the run, emailed from the supplier record, or cut until PDF exists? They are the one deliverable the marketing copy promises that the flow never shows.
