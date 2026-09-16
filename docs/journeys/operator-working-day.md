# The operator's working day — journey map

Resolves [Chart the operator's working day end to end (#239)](https://github.com/petrose99/docubite/issues/239) on [Map: Make the operator app work like Vic.ai (#226)](https://github.com/petrose99/docubite/issues/226). Charted against the distilled app at `0181754` (after #238). Diagram: [operator-working-day.html](./operator-working-day.html).

This is a map of **what exists and where it breaks**, not a spec. Every seam below is either a ticket (a decision) or an item on the polish task (#249). Vocabulary is CONTEXT.md's; screens are named as the rail names them.

## 1. Who walks it

Three people act on a row, and in a small business they are often one person. They are charted as three lanes, not one composite, because the code gives them different powers:

| Lane | Who | Can | Cannot |
|---|---|---|---|
| **Reviewer** | bookkeeper or finance lead, 50–500 documents a month, desktop, time-pressured | review, correct, resolve checks, start an Approval, export | decide an Approval stage they are not named on |
| **Approver** | whoever `canDecideStage` names; on the phone as often as the desktop | Approve · Reject · Send back for review on Ready to Approve | edit fields, resolve checks, push to ledger |
| **Owner** | workspace owner | prepare a payment run, push to ledger, lock a period, manage the connection | — |

The day is habit-shaped and recurring (kishōtenketsu: open → work → the thing that blocks → close), not a hero's journey. Assumptions carried from PRODUCT.md and not yet validated with users: the persona, the volume, and that the phone is the Approver's device.

## 2. The day, end to end

Stages run left to right; lanes run top to bottom. **Seam** marks a hand-off that fails today; the number is the ticket.

### Before: intake (Seam #243, P0)

Documents arrive by email forward (`/api/inbound-email`, off unless `inboundEmail.enabled`), by API (`POST /api/v1/documents`), or by upload. **No Queue screen, rail item or phone tab offers upload**: the only upload control lives on the unplugged Worksheets hub, the flagged Dashboard, and `/pipeline`, which nothing links to. The inbound address is shown only under Settings › Email. A new Document lands `queued` and surfaces on the typed queue for its type (unclassified → Archive).

- Reviewer must know: that intake exists, where the address is, that upload is not on the screen they are on. **Assumption of Context** at the first step of the day.
- Phone: `MobileUploadButtons` has no call sites and points at an unplugged route (polish, #249).

### 1. Open the workspace → Invoices

`/workspaces/<id>` lands on the Invoices queue (#237/#238). What needs me is read from the rail badges and the queue's own counts. Two numbers share the name "Invoices": the badge counts `pipelineCounts.review`, the header counts the filtered rows (already #233). The tour still points at a target the rail no longer renders (#241). The old Dashboard's ranked next-best-action (review > awaiting placement > failed) ranked the same destinations the rail now orders — Invoices first, Exceptions last (§2) — so the rail carries it; no ranked element returns to the queue (#242).

### 2. Work the queue: Invoices → Purchase Orders → Receipts → Bank Statements → Exceptions

Order decided on #239 Q11: Invoices first with the Needs-attention chip, Exceptions last for whatever the typed queues did not clear.

On every queue: row → Detail pane in place (fields beside source; tabs Details · Note · Approval · Audit · Checks); ↑/↓/Esc; sticky Reject · Approve. Filters live in the URL and survive refresh, but the rail links are bare, so leaving a queue and returning drops every chip and the sort (part of #244).

The lifecycle is spelled five ways on the way through (row pill, leading glyph, pane stepper, PO/Bank raw-status pill, Invoices Status facet), three of them on one Invoices row. Owned by #233; the journey only records where the operator meets it.

**After Approve or Reject the operator stays on the row** and sees its Server-confirmed state; ↓ moves on (Q3). Today a row that leaves the filtered list makes the pane vanish silently with the URL still pointing at it (#249).

Bank Statements stop at reviewed; matching and reconciliation are a Close-lane step (Q17). Health Checks and Close both answer "is the bank reconciled" (fog on the map).

### 3. The thing that blocks: a check fails

A blocked invoice is answered six ways, two of them disagreeing: Invoices pill "Needs attention · 1" ↔ Exceptions row "Open"/"In review" ↔ pane stage strip "Checks" ↔ Checks tab "No open checks on this document" ↔ Details tab flag ↔ pane footer. Exceptions critique: 24/40, two P0s.

Decided (Q4): **the Checks tab owns resolution on whichever queue the operator is on; Exceptions is the cross-type list of the same rows opening the same pane.** Today the Exceptions row carries no invoice number, amount ("—") or due state, so the Reviewer arrives carrying all of it from Invoices, and there is no way back to the invoice once resolved (Seam #244; row identity and the Checks-tab contradiction are #249).

### 4. Hand to the Approver

Reviewer starts an Approval from the Invoices bulk bar (#227). The Approver's lane begins **by habit**: nothing notifies anyone; the rail badge on Ready to Approve is the only signal and the phone has no rail (Seam #246, blocked by #236). On the desktop the Approver works Ready to Approve with the same pane, read-only fields, sticky Reject · Approve, Send back for review with a reason. Not eligible rows stay visible with the reason.

**Phone is the Approver's lane only** (Q7, #189, #232): open → Ready to Approve → Approval Context → decide → back to the list. Everything else on the phone is read-only. Today the tab bar is Invoices · Exceptions · Finance-or-Archive · Settings, three queues have no phone entry, and the pane opens full-screen with working Approve/Reject.

### 5. After approval: ledger and payment (Owner lane)

**Finance is not on the daily route** (Q5). Today: push to ledger lives twice (document card, Finance batch list); the push outcome is a toast and a card that unmounts on success; a failed row has no reason and no link to its document; the route 404s when the ledger flag is off, with copy that reads as a removal. Finance critique: 14/40. Push becomes a queue bulk action with Partial outcomes and Finance shrinks to the connection and "Open ledger" (Seam #248, blocked by #229).

The payment run lives on the Invoices bulk bar (owner-only), downloads a CSV, revalidates `/bills`, and **has no approval gate** while the ledger push requires approved: two rules for "what do I pay" (gate → #249; rule recorded on #229). Bill Pay (#229) becomes the payment run's home; "did I already pay this" has no answer today.

A row does not say "pushed": Synced comes from the ledger payment sync, not the push record (#248).

### 6. Side path: a supplier calls → Archive

Archive is off the daily arc (Q10): a lookup. Today it lists `status: reviewed`, which includes invoices still in approval, under "permanent record"; it is a second grammar (centred cards, native selects, full reloads, no pane); opening a card lands in the typed queue with Approve/Reject live and no way back; origin context (`q`, facets, page, view) is dropped. Archive critique: 17/40; in-page detector 38 real findings at 1440. Seam #245 (fate) and #244 (way back); contrast and 10px text → #249.

### 7. Done for today

**The empty queue is the done state** (Q6). No summary surface (per #237). Invoices' empty state carries the day's outcome ("Nothing needs you. n approved today, m sent to the ledger") — `fortify` inventories it on the execution ticket that touches the empty state. Rail badges at zero are the second signal.

### Month-end variant: Close (Owner lane)

Close is where the ledger pushes and payment runs end up: period lock, sign/override per item (bank recon, AP aging, accruals, VAT workpaper). On the map as one lane, no screen detail; its shape waits for #231 ("Close" is still a bare verb, 11 rail stops).

## 3. Every hand-off between surfaces

| # | From → To | Trigger | What travels | What the person must remember today | Seam |
|---|---|---|---|---|---|
| H1 | Email / API / upload → typed queue | document arrives | doc type, `queued` state | that intake exists, the inbound address | #243 |
| H2 | Rail badge → Invoices | open workspace | nothing (badge count ≠ header count) | which number is "real" | #233 |
| H3 | Queue A → Queue B (rail) | click rail | nothing; filters and sort dropped | the chips they had on | #244 |
| H4 | Row → Detail pane | click / Enter | row id in URL; queue stays | — | — |
| H5 | Pane → next row after decision | ↓ | position | — | polish (#249: vanishing pane) |
| H6 | Invoices row (Needs attention) → Exceptions row | rail | document id only | invoice number, amount, due state, anchored field, the pill, their filter | #244, #249 |
| H7 | Exceptions pane → back to invoice | none exists | — | everything | #244 |
| H8 | Invoices bulk bar → Approval started → Ready to Approve | Start | Approval run | that the Approver must be told | #246 |
| H9 | Approver desktop ↔ phone | habit | Ready to Approve view | — | #232 |
| H10 | Approved rows → Finance push | rail | approved set (silently minus rows that fail to normalise) | why 12 became 9 | #248, #249 |
| H11 | Finance failed row → document | none exists | — | which document, why it failed | #244, #249 |
| H12 | Invoices bulk bar → payment run CSV | Prepare payment run | file download; revalidates `/bills` | that it happened; which rows | #229, #249 (gate) |
| H13 | Archive card → typed queue + pane | click | document id; `q`/facets/page/view dropped | where they were in Archive | #244, #245 |
| H14 | Pane "Open in new tab" → standalone page | menu | `?full=1`; Back → `/pipeline` | the queue they left | #249 |
| H15 | Global search → result | Enter | links to `/pipeline?doc=` (no nav) | — | #249 |
| H16 | Receipts pane → Create expense claim | menu | full reload to `?mode=claims`, unplugged surface rendered inside Receipts | pane state | #247 |
| H17 | Day → Close | month-end | ledger facts | which runs and pushes happened | #231 (fog: Health vs Close) |

## 4. Where two surfaces answer the same question

| Question | Answered by | Owner |
|---|---|---|
| How many invoices need me? | rail badge, phone tab badge, Invoices header count | #233 |
| What is wrong with this invoice? | row pill, stage strip, Checks tab, Details flag, pane footer, Exceptions row | #233 (words), #249 (Checks tab), #239 Q4 (Checks tab owns resolution) |
| How many exceptions? | rail badge, phone tab badge, Exceptions header | consistent today |
| What is wrong in the workspace? | Exceptions, Health Checks | fog on the map |
| What do I pay? | Invoices payable filter (no approval check), Finance push list (approved only) | #249 gate, #229 |
| What happened to this document? | pane Audit tab, Activity screen | acceptable: same stream, two scopes |
| How far is the approval? | Approval tab, stepper | #233 |
| Where is this document? | queue Closed facet, Archive | #245 |
| Is the bank reconciled? | Health Checks card, Close item | fog |

## 5. Decisions taken on this ticket

| Q | Decision |
|---|---|
| Q1 | Three lanes (Reviewer · Approver · Owner), one map; no composite persona |
| Q2 | Intake is part of the day and a P0 seam → #243 |
| Q3 | After Approve/Reject stay on the row with the Server-confirmed state; ↓ moves on; no auto-advance |
| Q4 | The Checks tab owns resolution on any queue; Exceptions is the list of the same rows |
| Q5 | Finance is off the daily route → #248 (blocked by #229) |
| Q6 | The empty queue is "done for today"; no summary surface |
| Q7 | Phone is the Approver's lane only; everything else read-only |
| Q8 | Multi-workspace day stays fog until #231 |
| Q9 | Markdown map + HTML diagram in `docs/journeys/` |
| Q10 | Archive is a lookup side-path, off the daily arc → #245 |
| Q11 | Reviewer's order: Invoices → POs → Receipts → Bank Statements → Exceptions last |
| Q12 | Approver works by habit today; notification → #246 |
| Q13 | One way-back pattern, one ticket → #244 |
| Q14 | Approval-before-payment: gate fixed in place (#249), rule recorded on #229 |
| Q15 | Expense claims kept on Receipts, reshaped as a pane action → #247 |
| Q16 | Close on the map as the Owner's month-end lane; shape waits for #231 |
| Q17 | Bank Statements stop at reviewed; reconciliation is a Close-lane step |
| Q18 | Seam split: six grilling tickets + one polish task (#249) |

## 6. Evidence

- Inventory of the distilled app at `0181754` (this session; file:line refs in the ticket comment).
- Critiques (dual-agent, in-page detector at 1440/390): Invoices 25/40 (#225 baseline); Exceptions 24/40, Finance 14/40, Archive 17/40 — `.impeccable/critique/2026-09-15T22-25-51Z__*`.
- Vic tour §6, `docs/vic-ai-ux-tour-findings.md`.

## 7. Not on this map

Multi-workspace day (fog, waits for #231) · keyboard accelerators (#240) · first-run help (#241) · the flagged Dashboard (#242) · PO mismatch resolution (#228) · Bill Pay and Payment Batches (#229) · Admin (#231) · phone approval screens (#232).
