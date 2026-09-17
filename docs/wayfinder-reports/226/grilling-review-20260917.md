# Grilling review — the four decision tickets the autopilot resolved on 2026-09-17

Map #226 · sessions 45–48 of the run detached at 2026-09-16T18:08Z · all four by **opus[1m]** · 4–8 min each · every question answered with its own `➡️` recommendation under the owner's standing delegation (2026-09-15).

This is the owner's audit pass: for every question, the options the agent put on the table, the one it took, and the rule or evidence it cited. Where the agent's choice is a user-facing rename or a removal, it is flagged **Owner check** — those are the ones worth reversing early if you disagree, since execution tickets already exist.

| Ticket | Question | Rounds / Qs | Outcome | Spawned |
|---|---|---|---|---|
| #276 | Are un-batchable Bill Pay rows selectable? | 2 / 5 | Selectable-then-left-out | #294 (fold-ins) |
| #277 | Does an approved expense claim become a Bill Pay row? | 3 / 13 | Yes, through Bill Pay | #295, ADR 0003 |
| #278 | Single-owner speed bump before a payment file leaves? | 2 / 12 | No bump; Approve becomes reversible | #296 |
| #283 | Does a typed queue's Details tab still ask "what type?" | 2 / 15 | No — type is the destination; "Direction" row + Move | #297, #298 (sign-off) |

---

## #276 — Bill Pay rows that cannot be batched (Scheduled · Needs bank details)

**Context.** Bill Pay (#251) has three bulk actions — Create batch, Mark as paid, Set Pay From — each with a different eligibility set. The 34/40 critique flagged an H7 issue: the user only learns "1 of 7 eligible" inside the Create-batch dialog.

| # | Question | Options on the table | Chosen | Why |
|---|---|---|---|---|
| Q1 | Selection model | (a) keep selectable-then-left-out · (b) per-row `selectable` predicate · (c) predicate for Scheduled rows only | **(a)** | Vic's bulk grammar (tour §6 69–71): select anything, confirm carries "Eligible (N of M)". Three actions have three eligibility sets, so a checkbox predicate would be their union = every row; un-checking Needs-bank-details rows would remove Mark as paid / Set Pay From from exactly the rows that need them. Approvals has no checkbox column so is not a counter-precedent. H4 consistency. |
| Q2 | Where "1 of 7" is learned | in the dialog only (today) · on the bar at selection · both | **On the bar at selection, dialog strip stays** — hint "k of n selected can't be batched — each row says why" when eligible < selected | H7 finding in the critique; Intent "make intent visible"; H5 confirm stays. |
| Q3 | Bulk Set Pay From on Scheduled rows | write anyway (today) · skip with `(n)` suffix like Mark as paid | **Skip with `(n)` suffix** | Pane already hides it for Scheduled (`:157`); bulk today silently writes under a batch that already fixed the account — Intent "transparent consequences"; smallest reversible option. |
| Q4 | Per-row affordance for un-batchable rows | subtitle only · muted/disabled checkbox | **Subtitle only** | Row *is* selectable for two of three actions; a muted checkbox would misstate that (Intent cat. 1 visual misdirection); craft floor: no decorative state. |
| Q5 | Where the execution lands | new task · fold into #277/#278 | **Small task #294** | Two-line edits, no schema; #277/#278 are grilling tickets and cannot carry execution. |

**Decision.** Keep every Bill Pay row selectable; each bulk action reports what it can do with the selection on the bar and in the confirm. No per-row predicate.

**Owner check.** Nothing user-visible is renamed or removed. Low risk.

---

## #277 — An approved Expense claim becomes a Bill Pay row and a Payment-batch line?

**Context.** Bill Pay + batches shipped on #251; claims on #273. Today an approved claim ends at "‹Claimant› is owed ‹amount›" and nothing follows — a Dead End (catalog cat. 9). Vic has no reimbursements, so "Vic wins ties" cannot settle this; precedents are #229 (payments grammar), #247 (claims), ADR 0001 (derived paid state), #233 (one word, one meaning). Ethical stance stated up front: a person's bank account is personal data — minimum collection, workspace-scoped, masked, audited.

### Round 1 — the fork

| # | Question | Options on the table | Chosen | Why |
|---|---|---|---|---|
| Q1 | Does an approved claim enter Bill Pay at all? | (a) yes, a Bill Pay row with the Claimant as payee · (b) no, claim gains *Mark as reimbursed*, transfer outside · (c) hybrid: outside by default, into Bill Pay once bank details exist | **(a)** | Otherwise Dead End (cat. 9). Bill Pay's glossary is "the queue from which batches are created"; the ZA EFT CSV is payee-agnostic. Missing Invoice #/terms/discount are empty columns, not a different concept (#229 d.5 already renders "—"). (c) is (a) with the row hidden when undecidable, which #229 d.7 explicitly rejected for suppliers. |
| Q2 | Where do the Claimant's bank details live? | (a) `WorkspaceMember` · (b) `User` · (c) a `Supplier` of kind "person" | **(a)** | Privacy by default: each workspace holds only what it pays, details go with the membership. (b) leaks one company's payroll-ish data into every workspace. (c) puts a person in the vendor master — supplier matching, statements, posting would treat them as a vendor (cat. 9 Inconsistent Patterns, real posting risk). |
| Q3 | Who enters details; required to submit a claim? | (a) required at Submit · (b) optional, self-service from Account menu/tab, owner-editable; missing → *Needs bank details* row | **(b)** | Approval is about whether money is owed, not whether it can be paid yet; gating Submit blocks the Approver on the Claimant's admin. #229 d.7 already has the undecidable-with-reason row. Owner-editable copy lands in Admin › Users (#286). |
| Q4 | Data model | (a) `PaymentRunItem` gains nullable `expenseClaimId` (exactly one of documentId/expenseClaimId) + `ExpenseClaimPayment` mirroring `InvoicePayment` · (b) separate `PaymentRunClaimItem` table and file path | **(a)** | One batch, one items list, one file writer, one double-batching guard (`(workspaceId, expenseClaimId, active)` unique). Payment record separate because `InvoicePayment` is invoice-keyed and its ledger-confirmation source doesn't apply. |

### Round 2 — the row, the batch, the file

| # | Question | Options on the table | Chosen | Why |
|---|---|---|---|---|
| Q5 | What the Bill Pay columns say for a claim | (implicit: keep "Supplier" header · rename · hide empty columns) | **Header Supplier → Payee** on Bill Pay only; Claimant name + small *Claim* mark (never colour alone); Invoice # → claim title or "Expense claim"; Invoice date → submitted; Terms "—", no discount ever; Due → approval date **with no countdown**; totals frozen and read-only | #229 d.5 applied verbatim; a manufactured countdown is Fabricated Urgency (cat. 3). Phone card slots (#235) unchanged. |
| Q6 | Same batch as supplier bills, or claims-only batches? | same batch · own batch | **Same batch**, claim lines under a **Reimbursements** group after suppliers | #229 d.4 invariant is one batch = one payer account = one currency = one file; bank doesn't care who the beneficiary is; claims-only batches double the owner's approvals for nothing. File row: `beneficiary_name` = Claimant, references = "Expense claim ‹title/date›". |
| Q7 | Partial payment of a claim? | allow 0 < amount ≤ due (as bills) · no | **No** | #247 d.1 "one frozen amount"; partial contradicts what the Approver approved. Amount read-only; Mark as paid writes the full amount. Partial reimbursement = a new claim. |
| Q8 | Processing state vs paid state | add a fifth status pill · derive paid from payment records | **Derived from claim payment records only**; `ExpenseClaim.status` untouched; pill stays *Approved*; timeline gains *Paid · date · by* | ADR 0001 without its ledger source (claims are never reconciled); #233 one-word rule forbids a fifth pill. Unpaid → Scheduled (held by a batch) → Paid (recorded). |
| Q9 | Who sees the account number? | show in UI · masked | **Masked everywhere** (bank + last four); full number only in the file; editable by Claimant and owners; every change audited; removal doesn't touch rows already in a batch | #229 d.4 Payer-account convention. |
| Q10 | Mark as paid / Remove payment record on claims | special-case · identical to bills | **Identical to bills** — server-confirmed, no Undo, Remove needs a reason | ADR 0001 consequences; one grammar. |

### Round 3 — edges

| # | Question | Chosen | Why |
|---|---|---|---|
| Q11 | Does the Claimant get a "you've been paid" notice? | **Not now — fog** on the map | No evidence claimants poll for it; would ride #246's email grammar. |
| Q12 | Claimant who has left the workspace | Row shows *Needs bank details · No longer a member*; owner can still Mark as paid by hand | Real conditions; `submitterId` kept (SetNull only on User delete). |
| Q13 | Currency | Single-currency by construction, batches under #229's one-currency rule; null (legacy) → *Needs currency* | `models/expense-claims.ts:45`. |

**Decision.** Yes; Payee column; bank details on `WorkspaceMember`; same batch under a Reimbursements group; frozen total, no partial; paid state derived from claim payment records only. ADR 0003 written, CONTEXT.md updated (Payee added; Claimant, Bill Pay, Payment batch sharpened). Execution → **#295**. Input posted on #286 for owner-editable bank details in Admin › Users.

**Owner check.**
- *Supplier → Payee* column header rename on Bill Pay (user-facing).
- Members' bank details become a new personal-data field on the membership — confirm you're comfortable with the privacy stance (masked, audited, workspace-scoped) before #295 builds it.

---

## #278 — The single-owner speed bump before a payment file leaves

**Context.** Sole owner of a small workspace, paying their own suppliers from their own account, often on the phone (#232) with a discount countdown (#229 Q5). Money never moves in DocuBite; the bank portal has its own authorisation. Fact found in code: **an Approved batch has no reversal today** — `rejectPaymentBatch` throws `payment_batch_not_pending`, no withdraw; its invoices stay Scheduled until marked paid.

### Round 1

| # | Question | Options on the table | Chosen | Why |
|---|---|---|---|---|
| Q1 | What risk is the bump for? | fraud (second signature) · error (wrong amount/account/duplicate) | **Error, not fraud** | One owner = own money, told plainly (Intent autonomy). Fraud control needs roles/thresholds → fog line, after Users (#286). |
| Q2 | Where is the point of no return? | add friction before Approve · make Approve reversible | **Make Approve reversible** — Reject with a reason until marked paid | Intent: friction ∝ consequence; cheaper to lower the consequence. With reversal, the annotation is the ethical floor: a self-approved mistake costs one Reject. Vic's batch → approve → export has no confirm ceremony either. |
| Q3 | Type the batch name to approve? | yes · no | **No** | Typed confirm is for destruction; Approve destroys nothing and is now reversible. Worst-case phone interaction (keyboard over sheet over pane). |
| Q4 | Require a comment on self-approval? | yes · no | **No** | Mandatory reasons degrade to "ok" within days and bury the real one. DocuBite's reason fields are all on reversals (#229 Q6) — keep it that way. |
| Q5 | Cooling-off between Approve and Download? | timer · none | **None** | Software the owner owns can't hold their money to a timer; the bank is the real cooling-off. Collides with the discount countdown (`daysLeft` 0). |
| Q6 | Special treatment for the *first* file out of a workspace? | first-run friction · none | **None** | The confirm already states the consequence every time; first-run belongs to #264's How DocuBite works. |

### Round 2 — with Approve reversible

| # | Question | Options on the table | Chosen | Why |
|---|---|---|---|---|
| Q7 | Name and target state of the reversal | *Withdraw approval* → Pending · *Reject* → Rejected | **Reject → Rejected**, same `ReasonDialog`, invoices back on Bill Pay | One term per concept; the error case needs invoices re-batched, which Pending wouldn't give. No new state or label. |
| Q8 | Batch whose file was downloaded — still rejectable? | block · allow with a warning | **Allow**, with a download-fact line: "The payment file was downloaded on ‹date› by ‹name›. If it has already been uploaded to the bank, mark the batch as paid instead." | Download is a fact not a state (#229 Q2); transparent consequence, no block. |
| Q9 | Self-approval copy | keep "…approving it yourself is allowed and recorded as such." · tighten | **Tightened:** "You submitted this batch. Approving it yourself is recorded on the audit trail; you can still reject it until it is marked paid." | `clarify`: consequence first, no hedging ("allowed", "as such"). Same amber note on pane and confirm. |
| Q10 | Phone | — | **Nothing new** — existing `ReasonDialog` on the below-lg pane | #232. |
| Q11 | Does this reintroduce a persisted Draft? | — | **No** | #229. |
| Q12 | What stays in the fog? | — | Thresholds, second signature, payments role for members | Needs Users (#286); members still cannot approve. |

**Decision.** No speed bump; Approve becomes reversible (Reject with reason until Paid, with a download-fact line); self-approval note tightened. Glossary updated, no ADR. Execution → **#296**.

**Owner check.** This *removes* a hard guarantee (Approved batches were immutable) in favour of reversibility. If your accountant or bank process relies on "Approved = final", say so before #296 builds.

---

## #283 — Does a typed queue's Details tab still ask "What type of document is this?"

**Context established from code before asking.** Two type axes exist and are conflated: `Document.docType` (the typed-queue destination) and `codingData.documentType` (expense · sale · … — the accounting category the ledger push maps to payable/receivable). The Details-tab chooser sets the **category**, not the queue type, and gates Save review ("Choose Expense or Sale first"). Classification already writes both with defaults per type. `reclassifyDocumentAction` exists with **no UI caller**. Vic shows Doc Type as a read-only field in the detail list. Incumbent critique from code: **19/40**.

### Round 1

| # | Question | Options on the table | Chosen | Why |
|---|---|---|---|---|
| Q1 | Reframe: the chooser isn't the type question | decide type only · decide both type and category | **Both** | Deciding only "type" leaves the identical control asking something else. Domain-modeling: one term per concept. |
| Q2 | Is the type the destination? | (a) yes, no Type row on typed queues · (b) keep an editable Type row | **(a)** | #243 d3 made the queue the assertion; Vic tour line 77; a wrong type is a *move*, not an edit. |
| Q3 | Where does the category go? | (a) field-table row on Invoice/Receipt · (b) keep the chooser · (c) drop the category | **(a)** | #231 d11 — the field table drives the pane. PO/Payslip locked to expense; Statement/secondary = other (no row). (c) fails: ledger direction needs it. Defaults mean the row is never empty. |
| Q4 | Save-review gate and `category_unconfirmed` blocker | keep gate · retire gate | **Save review confirms it; "Choose Expense or Sale first" gate retires**; blocker stays for AI-classified docs nobody reviewed | Defaults exist for every type. |
| Q5 | Where "this is not an invoice" lives | (a) pane ⋯ menu · (b) pane header · (c) Status line | **(a) ⋯ → Move to another queue…** | #234 caps header ≤96px, secondary actions go through ⋯; #233 restricts the Status line to five processing words. |
| Q6 | Move's shape | submenu · dialog | **`ConfirmDialog` with a radiogroup**: three other typed queues first, then *Other types* captioned "found in Search only" | H5 confirm-with-consequence; #245. Reversal = same action from the destination, no Undo (#227). |
| Q7 | After the move | — | Pane closes, row leaves, toast "Moved to Receipts — Open" with `from=` hop, audit event "Moved to Receipts (was Invoice)" | H1; #244; records #243 d12's counter-metric for the first time. |
| Q8 | When is Move disabled? | — | While approval pending (#227 d6); once Posted or Paid (#248); PO with matched invoices (#228). Reason in the caption, never `title`-only (#231 d22). Offline → toast, row stays. | Fortify. |
| Q9 | Search and legacy docs | — | Search keeps a read-only *Type* line (mixed context); same Move item moves secondary types *into* a typed queue; typed queues show no Type line | CONTEXT.md Search. |
| Q10 | Bulk Move? | now · later | **Not now — fog** | Smallest reversible option until audit shows mis-typed batches. |
| Q11 | Removal protocol | delete now · replace now, delete on sign-off | **Replace now; deletion of the chooser and `setDocumentTypeAction` on sign-off #298** | #237 protocol. |

### Round 2

| # | Question | Options on the table | Chosen | Why |
|---|---|---|---|---|
| Q12 | The word for Expense · Sale | *Category* · *Direction* · *Kind* | **Direction**, values **Payable · Receivable** | "Category" already means the spending category (queue column + Admin table); "Expense" collides with *Expense claim* (#247). `integration-push.ts:167` already maps to payable/receivable — user-facing words become the ledger's own. Stored values unchanged. |
| Q13 | Field table shape | — | Canonical `category` row on Invoice/Receipt, Editable/Required on, no ✕, no queue column; PO locked with footnote "Purchase orders are always Expense" | #252 lock-reason pattern. |
| Q14 | Keyboard and announcement | — | Dialog traps focus on the radiogroup, Esc back to ⋯, confirm returns focus to next row, toast in polite live region | `include`. |
| Q15 | Phone and full mode | — | Inherit via `PaneFrame` and shared `ConfirmDialog`; nothing phone-specific | B4 primitive reuse. |

**Decision.** Type is the destination; the Details tab stops asking on typed queues; category becomes the field-table row *Direction* (Payable · Receivable), defaulted per type and confirmed by Save review; wrong type = ⋯ *Move to another queue…* with a consequence confirm and the three disable rules; Search keeps a read-only Type line. Glossary: *Document type* and *Direction* added. Execution → **#297**, sign-off → **#298**.

**Owner check.**
- **Expense/Sale → Payable/Receivable** is a user-facing rename decided by the one-term rule. The agent itself flagged it: reverse on #297 if you prefer the incumbent words (stored values don't change either way).
- #298 needs your sign-off by name to delete the retired chooser and `setDocumentTypeAction` once #297 ships.

---

## Cross-cutting observations

- **Every choice cited a precedent, not taste.** The most-leaned-on rules: #229 (payments grammar, 9 citations), one-term-per-concept (#233 / domain-modeling, 5), "smallest reversible option" (4), and the Intent anti-pattern catalog (Dead End, Fabricated Urgency, Inconsistent Patterns, visual misdirection).
- **Three "no" streaks were consistent.** No typed confirms, no mandatory reasons on forward actions, no timers — all three grounded in the same principle (friction ∝ consequence, autonomy over the owner's own money).
- **Two things it correctly refused to decide:** claimant paid-notice (#277 Q11) and bulk Move (#283 Q10) — both parked as fog with a stated evidence trigger.
- **Recurring tooling gap:** `impeccable context` was denied by the sandbox in all four sessions; each fell back to reading PRODUCT.md by hand. A permission rule for `.claude/skills/impeccable/scripts/impeccable` would remove that.
- **Four items need you** (all listed above under *Owner check*): the Payee rename, the member bank-details privacy stance, Approved-batch reversibility, and the Payable/Receivable rename. Execution tickets #295–#297 are on the frontier now, so the autopilot will build them unless you say otherwise.

Sources: `276.md`, `277.md`, `278.md`, `283.md`, `logs/scratch-278/grilling.md`, `logs/scratch-283/grilling.md`, `logs/scratch-276/resolution.md`, and the resolution comments on each issue.

---

## Owner sign-off — 2026-09-17

All four flagged items confirmed by the owner as decided:

1. **Payee** column header on Bill Pay — confirmed.
2. **Member bank details** on `WorkspaceMember` (masked, workspace-scoped, audited, self-service + owner-editable) — confirmed.
3. **Approved batches rejectable until Paid** — confirmed; no speed bump.
4. **Direction: Payable · Receivable** — confirmed; stored values unchanged.

No decision reopened. #295, #296, #297 proceed as specified.
