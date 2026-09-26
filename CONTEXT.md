# TaxHacker Product Context

This glossary defines the product language used for the authenticated workspace experience and its document-to-ledger workflow.

## Authenticated workspace experience

**Workspace home**:
The Invoices queue. Opening a workspace lands the user on their work, not on a summary of it; "what needs me" is read from the rail badges and the queue's own counts. There is no separate overview surface.
_Avoid_: Dashboard, landing page, overview, next best action

**Unplugged surface**:
A feature the product no longer shows or routes to, kept only so it can be brought back deliberately. Worksheets, Expenses, Dictation and the old Dashboard are unplugged. An unplugged surface has no navigation entry, no row or bulk action, no badge, and its addresses do not open; it is never measured or polished, only deleted once the owner signs the removal.
_Avoid_: Hidden, deprecated, legacy

**Core workflow destinations**:
Invoices, Purchase Orders, Receipts, Bank Statements, Exceptions, Approvals, and Search: the permission-filtered peer surfaces representing typed intake, escalated work, and cross-type lookup. The booked outcome is not a surface: a document is posted from its own queue and stays there as a Posted row. The four typed intake destinations replace the former single "Documents" surface; there is no separate record of finished work — a finished document stays on its typed queue under Closed.
_Avoid_: Archive (as a destination), Library, permanent record, Attachments

**Search**:
The one cross-type lookup: a Queue screen whose rows are every document in the workspace that matches what was typed — any type, any processing state, archived included — with nothing listed until something is typed. Its rows open in the Detail pane in place; a typed row also offers to open on its own queue, which is a hop that carries Origin context. Documents of a type that has no queue of its own (contracts, delivery notes, payslips, tax forms, other) are found and opened here and nowhere else, except that a Delivery note also shows on the Purchase Order it is suggested against, and in the Purchase Orders view Delivery notes to confirm. Reached from the rail and, on desktop, the `/` key.
_Avoid_: Docu Search, Ask AI, global search (as a user-facing name), scope

**Closed**:
The section of every queue's Status facet that holds the rows nothing more will happen to: Posted, Paid, Cancelled, Archived. The default view is Open — In review, Needs attention, Approved, Touchless — so a finished document is one chip away, never elsewhere. Closed is a facet section, not a processing state.
_Avoid_: Done, History, Processed

**Archive** (verb):
Taking a document off every Open view without cancelling or deleting it, from the Detail pane's overflow menu; reversible from the same menu. An archived document is a Closed row with an Archived mark. "Archive" names only this action.
_Avoid_: Archive as a place, Store to library

**Document**:
The storage-and-extraction primitive underlying every typed destination. Every Invoice, Purchase Order, Receipt, and Bank Statement is a Document, but "Document" is no longer itself a user-facing destination — the user asserts which typed destination a Document belongs to at upload time, and that assertion is authoritative.
_Avoid_: Using "Document" as a destination name; unclassified/pending-classification states

**Intake**:
How a Document enters a workspace: added from the typed queue it belongs to, emailed to the workspace's inbound address, sent by WhatsApp to the deployment's WhatsApp number, or sent by API. Adding from a queue asserts that queue's type; email and WhatsApp intake default to Receipts and can be re-typed on the queue as today (Move to another queue). Logged-in phone capture (Arc C, #372) is deferred, evidence-gated on WhatsApp's 30-day channel share — until it ships, the phone does not add documents itself.
_Avoid_: Upload (as a user-facing verb), import, pipeline

**Inbound address**:
The workspace's own email address for intake. Shown wherever the operator sets out to add a document — the Add dialog and the first-use Empty queue — and under Admin › Configuration › Intake for who may send to it. Only exists on a deployment where email intake is switched on.
_Avoid_: Forwarding address, mailbox

**WhatsApp intake** (#372):
A second intake channel beside the inbound address: one WhatsApp Business number per deployment, inbound only — nothing is ever initiated from DocuBite's side. The firm links each sender's number to a workspace under Admin › Configuration › Intake (beside allowed email senders), the way allowed senders map email addresses. An unlinked number gets one reply saying so; a linked sender gets one reply per message acknowledging what was added or why it wasn't. Received documents default to Receipts. Rows carry a channel + sender attribution chip (*via WhatsApp · ‹name›*), shown on the queue row and the Detail pane's audit trail.
_Avoid_: Chatbot, WhatsApp bot (there is no conversation, only intake + one acknowledgement)

**Invoice**:
The typed destination for what a supplier sends the company to be paid or credited, and the name of its main document type. Absorbs the former Documents/Bills surface; aging is a filter chip and a saved view here, and paying an approved invoice happens on Bill Pay, not on this queue. Credit notes live here too: the queue's Type facet reads Invoice or Credit note, and the Open view shows both.
_Avoid_: Bills (as the destination's name — "invoice" is the word the company's VAT law, its CFO and its accounting firm use; the ledgers' "bill" names only their own record), supplier documents, payables

**Bill**:
The ledger's own record of a posted invoice — what QuickBooks and Xero call it. Used only when speaking of that record ("posted to Xero as a bill") and inside the proper name Bill Pay; the document in DocuBite is an invoice or a credit note, never a bill.
_Avoid_: bill for a document still in DocuBite

**Expense** (the ledger's):
The ledger's own record of a posted receipt — QuickBooks' Expense, Xero's Spend Money. Used only when speaking of that record ("posted to Xero as an expense"); the document in DocuBite is a receipt. Distinct from an Expense claim, which is DocuBite's bundle of receipts someone paid personally.
_Avoid_: expense for a document still in DocuBite, Expenses (as a destination)

**Credit note**:
A supplier's document that reduces what the company owes that supplier. It is its own document type in the Invoices destination, reviewed, approved and posted like an invoice. Its amount is always positive: the type says it is a credit, never a minus sign.
_Avoid_: Vendor credit, credit memo (the ledgers' names), negative invoice, refund (money back is a different thing)

**Credit allocation**:
Part of a Credit note applied to one invoice of the same supplier, which lowers that invoice's amount due. A Credit note can be split across several invoices, and an invoice can take several credits. It is not a Payment record and never creates or touches a Payment line. An invoice's amount due is its total less its Payment records and Credit allocations; one covered by credit alone reads Credited, never Paid.
_Avoid_: Credit payment, offset, applied payment

**Supplier credit**:
The part of a Credit note not yet allocated to any invoice. It stays with that supplier until a person allocates it.
_Avoid_: Credit balance (ambiguous with a ledger balance), store credit

**Recurring invoice**:
A supplier's invoice that a person has confirmed arrives on a regular cadence (weekly, monthly, quarterly or yearly) at a usual amount, either fixed or varying within a stated percentage — rent, a utility, a service contract. DocuBite suggests one when a supplier's invoice history shows the pattern, and a reviewer accepts, adjusts or dismisses it on that invoice; a reviewer can also state one from an invoice, and an Owner can add one for a supplier with no invoice yet. It is never assumed and never ended by DocuBite, applies to invoices only, and never makes a document or a ledger record of its own. An invoice whose amount falls outside it is an Unusual amount.
_Avoid_: Recurring bill, repeating bill, recurring transaction (the ledgers' template names), standing invoice

**Expected invoice**:
One period's invoice that a Recurring invoice predicts, dated from the supplier's issue date. It is met by the supplier's invoice issued in that period, skipped when a person marks it Not expected this period, and reads Not received once its grace period passes with neither. It is never a row in a queue and never a document.
_Avoid_: Missing bill, ghost invoice, placeholder bill

**Purchase Order**:
The typed destination for a purchase order, paired with Invoices for matching and cumulative line-item comparison against what has already been invoiced against it.

**Receipt**:
The typed destination for a receipt. Absorbs expense-claim creation as an action on selected rows rather than as its own destination: Add to claim on the bulk bar (and the pane's overflow for one row) opens a dialog in place, and the claim itself is read and submitted from the receipt's Approval tab. A receipt's own processing state is about its review; whether it sits in a claim is a separate fact, shown in the Claim column.

**Expense claim**:
A bundle of expense receipts one person paid for personally, submitted for approval as one amount frozen at submission. A draft belongs to its Claimant, who can add and remove receipts or delete it; once submitted it is an Approval — a row on the Approvals destination's Expense claims view, decided by the Approver of its stage (any owner where no flow applies) — and can be withdrawn back to draft only while no stage has been decided. Approving a claim records that its Claimant is owed the amount; it does not change any receipt's processing state. A rejected claim stays as a record and releases its receipts to be claimed again. A receipt can be in a claim only if it is an expense receipt, is not Needs attention, and is not already in an open or approved claim.
_Avoid_: Expense report, expenses (as a destination), reimbursement request

**Claimant**:
The person an Expense claim reimburses: the member who assembled and submitted it. Distinct from the Approver who decides it. Once the claim is approved the Claimant is a Payee on Bill Pay; their bank details belong to their membership of the workspace, shown masked, written only into the payment file.
_Avoid_: Submitter, employee

**Bank Statement**:
The typed destination for a bank statement. The reviewer asserts the issuing institution; the first statement for that institution becomes its saved layout, and later uploads are checked against it for drift. A Bank Statement is DocuBite's proof that an invoice or receipt was paid outside DocuBite: once a Statement match is confirmed, the document reads Paid and names the statement line as its evidence. It never settles a Payment line — that is the rail's alone. It is never posted; its lines reach the ledger through the ledger's own statement import.
_Avoid_: bank feed (DocuBite is not one)

**Statement match**:
A suggested pairing of one debit line on a Bank Statement with an unpaid Invoice or Receipt that has no Payment line: same amount exactly, dated from the document's date up to 60 days after it. It is never confirmed by itself. When one line fits two documents, both are listed and neither is picked. Any member who can approve confirms it (Confirm paid) or dismisses it (Not this). Confirming marks the document Paid, and Undo returns it to Unpaid, from either side, until the document goes onto a Payment line. The queue counts the unconfirmed ones as Payments to confirm.
_Avoid_: reconciliation, bank match, reconciled (only the ledger reconciles)

**Check**:
A tri-valued (pass/warn/fail), explainable comparison that states in plain language why a value is flagged, anchored to the field, cell, or row it concerns. "Mismatch" names one Check status, not the category.
_Avoid_: Discrepancy, issue, error (as the umbrella term)

**Line match**:
An invoice line's assigned Purchase Order line — guessed by description similarity, or set by hand in Match manually. A line below the similarity threshold has no line match and is not compared.
_Avoid_: Line pairing, line mapping

**Match manually**:
The named in-row mode on an invoice's line items that confirms, replaces or rejects its Purchase Order and reassigns line matches; the checks re-run when it is left. It changes the facts and needs no reason; it is not Override Mode, which accepts a variance with a reason.
_Avoid_: Manual Match Mode (Vic's name), re-match, Override (for a match change)

**Override Mode**:
The screen-scoped mode in which a soft check or gate can be overridden, each override attributed and recorded with a required reason. Hard gates are out of its reach.
_Avoid_: Bypass, force approve

**Fully invoiced**:
A Purchase Order whose every line has been invoiced to at least its ordered quantity. Derived, never set by hand.
_Avoid_: Closed PO, consumed

**Goods received**:
The quantity of a Purchase Order line recorded as delivered, compared only for suppliers marked Goods received required. It comes from a Delivery note a person has confirmed against the PO, or from a person's own entry, and it names which. It is kept in DocuBite only: neither ledger takes it.
_Avoid_: Receipt, item receipt (QuickBooks' name), GRN

**Delivery note**:
The supplier's document that evidences Goods received. It is captured like any document, and its quantities count only once a person confirms them against a Purchase Order.
_Avoid_: Delivery receipt, GRN, proof of delivery

**3-way match**:
Comparing an invoice line against its Line match and that PO line's Goods received. It applies only to suppliers marked Goods received required; every other invoice is compared with its PO alone.
_Avoid_: Three-way matching against a receipt (a Receipt is proof of spend, not delivery)

**Saved view**:
A named, reusable filter/sort/column configuration on a list screen. System views are seeded per screen and are not editable or deletable; a user can duplicate one into an editable, optionally shared, view.

**Work item**:
A single unit of pending work surfaced in a Next-action queue — a document awaiting review or a match awaiting confirmation. An approval awaiting a decision is an Approval, not a work item; it is worked by an Approver, not an assignee.

**Approval**:
A run started on an invoice or Credit note by a person — or an Expense claim once submitted — moving through its Route until it is approved, rejected, or sent back for review. An invoice nobody has started an approval on is under review, not awaiting approval. An Approval never approves itself: when no stage applies or nobody on a stage can decide, the company's Owners decide it.
_Avoid_: Review task (the storage record), sign-off (as the umbrella term)

**Approver**:
The person who can decide the current stage of an Approval — a stage's named approver still in the company whose Approval limit covers the amount, their Delegate, or any owner where the stage names nobody or nobody named can cover it. The person who started the run is never its Approver, except in a company with a single Owner, where the decision is Self-approved. Distinct from an assignee, who works a review.
_Avoid_: Reviewer (that is who prepares the row), assignee

**Condition** (on a stage):
What makes a stage of an approval flow apply to a given bill — its supplier, an Account on any of its lines, its amount (total including tax in the company currency, from and optionally up to), or its type (Invoice, Credit note, Expense claim). Values of one kind are alternatives; different kinds must all hold. A stage with no Condition applies to every bill. An unknown amount makes every amount Condition hold. Shown as "Applies when".
_Avoid_: approval rule, rule (that is the Supplier account rule), policy, trigger

**Route**:
The stages one Approval takes: those whose Conditions held when it started, with who decides each. Fixed when the run starts — a later change to the flow applies only to Approvals started after it, or to this one once it is sent back and restarted. Who may decide is read at the moment of deciding (Approval limits, Delegations, who has left).
_Avoid_: chain, path, workflow (that is the pipeline)

**Approval limit**:
The largest amount, in the company currency, a member may approve. Set by an Owner per person; blank means no limit, and Owners have none. It caps every decision the person makes, including as a Delegate. Its number is never converted.
_Avoid_: spend limit, authority limit, threshold (that is a stage's amount Condition)

**Delegation**:
A dated hand-over of one person's approvals to another member of the company — set by the person or by an Owner, always with an end no more than 30 days after its start, ended early by either. The **Delegate** decides the Delegator's stages within the Delegate's own Approval limit, while the Delegator keeps deciding too; Approval notices go to the Delegate, and each decision records who decided for whom. A Delegate's own Delegation does not pass on what they hold for someone else.
_Avoid_: proxy, substitute, out of office (as the term)

**Self-approved**:
The mark on a stage decided by the person who started the run, allowed only in a company with a single Owner.
_Avoid_: auto-approved (nothing is)

**Ready to Approve**:
The personal system view on the Approvals destination: every Approval whose current stage the signed-in person can decide — invoices, PO mismatches and submitted Expense claims alike — including rows that are not yet eligible, shown with the reason. The badge on the rail counts this view and nothing else.
_Avoid_: Pending approvals (that is the workspace-wide count), inbox

**Send back for review**:
The reversible middle path on an Approval: the stage is not decided, the invoice returns to review with a required reason, and the run can be restarted. Reject ends the run.
_Avoid_: Reopen, cancel (that withdraws a run before any stage is decided)

**Not eligible**:
An Approval that is visible to its Approver but cannot be decided yet because a hard check failed or an escalation is open on the invoice. Never hidden, never overridable from Approvals; the reason is shown on the row.

**Approval notice**:
The one email an Approver gets when Approvals reach a stage they can decide: every eligible Approval that reached them since their last notice, never more than one an hour, none when nothing is new, and nothing about their own actions. It names the supplier and amount and opens the row (or Ready to Approve, when there are several); it never decides anything. A still-undecided Approval is nudged at most twice more. The person who started a run gets the same kind of notice only when it is sent back for review. Each person can switch it off in one click.
_Avoid_: Reminder (as the user-facing name), digest, alert, push, notification (as a badge count)

**Post** (verb):
Sending an approved document's reviewed data to the ledger as a bill or expense, from the queue the document is on — the bulk bar's Post, or Post to ledger for the open row. Only Invoices and Receipts can be posted — a Bank Statement never is; a row is eligible once it is Approved, every line has an Account, its currency is resolved, and it is not cancelled or already posted. Posting is a Server-confirmed action with a Partial outcome per row. Nothing un-posts. A posted invoice's Accounts can be corrected from DocuBite where the ledger allows it; everything else about it is the ledger's.
_Avoid_: push, sync, send to the ledger, export (that is the CSV)

**Posted**:
The Ledger mark that a document's post reached the ledger, with the date it did. It is read from the post itself, never from the ledger's later payment sync, and it moves the row into Closed. A posted document that the ledger later confirms paid reads Paid instead.
_Avoid_: Synced, Pushed, Transferred

**Source file**:
The file a document came in as — the PDF or image taken in at intake — or, for a document split out of a larger file, only its own pages. It is what DocuBite **attaches** to the bill in the ledger after a post, so the ledger bill carries its evidence. A source file the ledger can't take (too large, or a type it refuses) stays in DocuBite and the bill says so.
_Avoid_: Attachment (that is an email's), PDF (photos are source files too), Document (the storage primitive, not something users name), supporting document

**Ledger mark**:
The one mark beside a row's processing state that says where the document stands with the ledger: Posting… (the post is queued and retrying), Posted, Post failed (the post was refused for a reason the row can fix — the row then also reads Needs attention with that reason as an open check), or Paid. A ledger problem that is not the row's — the ledger is disconnected or has no default account — never marks rows; it is said once, above the queue, while posts are waiting.
_Avoid_: ledger status, sync status, integration state

**Accounting**:
The connected accounting provider's own page: which ledger this company is on (QuickBooks, Xero or Sage Accounting), whether the Ledger connection is healthy, when it last synced, its Default account and each supplier's usual account, and the way into the ledger. It holds no rows and no work — posting happens on the queues, paying in Bill Pay. Reached directly from the rail's Accounting item, inside Admin › Integrations. DocuBite hosts no ledger of its own (the in-house ledger was retired, owner, 2026-09-22).
_Avoid_: Finance (retired name), the ledger (that is what Accounting opens), push list, in-house ledger

**Account** (on a line):
What a document line is coded to — once a ledger is connected, one of the ledger's own expense accounts; with no ledger, typed text that goes out in the CSV. Pre-filled from the supplier's usual account, otherwise the Default account, and the line says which. Every line carries one; a document's lines can go to different Accounts. A line coded to an Item shows its Item's account instead, which the person sees but does not choose.
_Avoid_: Category (as the user-facing word), coding (as a field name), GL code, mapping

**Item** (on a line):
One of the ledger's own products or services that a line is coded to instead of an Account; a line is coded to one or the other, never both. The line posts to the Item's account, and a posted Item line's account is changed only by changing its Item in the ledger. A line gets its Item from the supplier's product code or description being paired with that Item on an earlier approved bill, from the supplier's code equalling the Item's code, or from a person — never from a guessed resemblance. Offered only where the ledger and its plan take item lines.
_Avoid_: product, SKU, stock item, inventory (as the generic word), service line

**Default account**:
The ledger account a line gets when its supplier has no usual account yet. Guessed once at connect from the ledger's own standard catch-all account (by exact name, never scored) and shown as Guessed until an Owner saves it or it is named in the company's first post; left blank when no standard name matches. Owner-set, on Accounting.
_Avoid_: fallback account, catch-all (as a label)

**Supplier account rule**:
A supplier's usual account: learned when a document from that supplier is approved (the account of its largest line, together with that line's Tax code and Tracking and the bill's Location — the Tax code pre-fills only on a line kept on that account; Customer and Billable are never learned), said once in the Detail pane at the moment it is learned, and listed on Accounting where an Owner can change or forget it. Changing it, or the Default account, changes future posts only; when the account changes, the bills already posted to the old account are offered as a list to correct in the ledger, none ticked.
_Avoid_: supplier mapping, category mapping, auto-coding

**Tax code** (on a line):
The ledger's own purchase tax code a line is posted with. It is pre-filled from the supplier's usual Tax code when the line keeps the supplier's usual account, otherwise the ledger's default for the line's Account, and always sent when the bill is posted, so the ledger never picks one silently. Once a bill is posted, DocuBite never changes its tax codes; correcting an Account sends each line's existing tax code back unchanged.
_Avoid_: tax rate, VAT type, TaxType (as user-facing words)

**Tax basis**:
Whether a bill's line amounts include VAT, exclude VAT, or carry none. It is read from the document (which extracted total the lines add up to), can be changed by the person coding the bill, and is sent with the bill so the ledger works out the VAT itself.
_Avoid_: line amount type, inclusive/exclusive flag

**Tracking**:
Up to two values on a line that analyse spend, each taken from one of the ledger's tracking categories and labelled with the ledger's own name for it ("Class" in QuickBooks, whatever the company named it in Xero). A line with no tracking category available shows no Tracking at all, rather than a disabled field.
_Avoid_: class (as the generic term), dimension, cost centre, tag

**Location** (on a bill):
The QuickBooks location a whole bill belongs to. It is set once per bill, because QuickBooks accepts it only on the bill and never on a line. Xero has no Location.
_Avoid_: department, branch

**Customer** and **Billable** (on a line):
The QuickBooks customer or job a line's cost is for, and whether that cost is to be billed on to them. Billable needs a Customer. Xero bills carry neither.
_Avoid_: job, project, rebill, recharge

A bill already posted before one of these fields existed, or before the ledger offered it, keeps it blank ("not set when posted"). Nothing is back-filled into the ledger, and no correction is offered.

**Ledger connection**:
The one link between a Company and its accounting provider, made by an Owner from the Accounting page and never more than one per company. It is Connected, Needs reconnecting (the provider stopped honouring it — posts wait, nothing is marked on rows, Owners are told once), or absent (no ledger: posting is offered nowhere and the queue says why once). Switching providers is a disconnect then a connect; disconnecting never un-posts anything. How the connection is held (the OAuth vault behind it) is never named on a screen.
_Avoid_: Integration (as the user-facing noun), OAuth, token, Nango, sync (for the connection itself)

**Bill Pay**:
The queue of approved, unpaid invoices and approved, unpaid Expense claims from which payment batches are created. An invoice reaches it only once its processing state is Approved, a claim once it is approved; a row that cannot be paid yet (no bank details for its Payee, or a Bank details change waiting for a decision) stays visible with the reason. A claim row has no terms, no discount, no countdown and no partial payment: its amount is the frozen claim total. A row with an open Payment line reads *Scheduled* while its batch is pending or approved and *Sent* once the payment rail accepted it — still on the queue, not batchable again until the line is Withdrawn, Failed or Paid (a partial Paid leaves the rest batchable). Amount to pay defaults to the discounted total inside an open discount window, else what is still due; an operator may set a smaller amount (a partial payment) per row.
_Avoid_: Payables, payment run (the queue), pay list

**Payee**:
Who a Bill Pay row and a payment-file line pay: the invoice's Supplier or the Expense claim's Claimant. Bill Pay's first column. A claim's paid state is derived from its own payment records (never the ledger); the claim's status stays Approved and gains a paid date.
_Avoid_: Beneficiary (the file's column name, not the concept), vendor (for a person)

**Payment batch**:
A named set of approved invoices and approved Expense claims, one payer account and one currency, submitted by a member for an owner's decision. Pending approval, then Approved — which hands its lines to the payer account's payment rail (Chaperone, in Lesotho) to be sent one by one — or Rejected with a reason while still pending, which withdraws its lines and releases their rows to Bill Pay. After approval the batch reads as its lines: *Sending n of m*, *Paused — balance too low* (Send remaining once the balance is topped up), and *Settled* when none is left open. An Owner may Withdraw unsent lines at any time after approval; a line the rail already has can't be pulled back. A Payout details change on one of its Payees rejects a pending batch and withdraws that Payee's unsent lines from an approved one. An owner may approve a batch they submitted themselves; the approval is labelled as self-approved, never blocked. DocuBite writes no bank file: the rail moves the money from the workspace's own account.
_Avoid_: Payment run, remittance (that is the advice sent to the supplier), transfer

**Payment line**:
One invoice's or claim's row in a Payment batch (a Payee with three invoices in a batch has three lines), carrying a Line reference that never changes, so an invoice or claim has at most one open line and is never paid twice. Each time a row enters a batch it gets a new line; a withdrawn or failed line keeps its identity for good. Queued while its batch is pending or approved and not yet sent, Withdrawn if the batch is rejected or an Owner withdraws it, Sending while the rail has been asked and hasn't answered, Sent once the rail accepted it, then Paid (the rail reported it settled, or an Owner marked it paid by hand with a reason) or Failed (the rail refused or reversed it, or an Owner said so with a reason; its row returns to Bill Pay). A Paid line is a Payment record.
_Avoid_: Transaction, instruction, payment (unqualified)

**Line reference**:
The short code ("DB" and eight characters) that names one Payment line, unique in its workspace and never reused. It is the payment ID the payment rail is given — so the same line can never be paid twice however often it is submitted — and leads the reference the Payee sees.
_Avoid_: Payment reference (ambiguous with the invoice number), transaction id

**Paid twice**:
The red flag on two Payment lines for the same invoice or claim that both left the account: the rail reporting Paid on a line whose bill had already been paid another way (by hand, or on a later line). It stays until an Owner records the supplier's refund (Returned on one line) or keeps the money as a Supplier credit, with a reason.
_Avoid_: Duplicate payment (that is a Check on invoices), overpaid

**Sending**:
The Payment line state between Queued and Sent: the rail has been asked to pay it and its answer isn't known yet — in flight, or lost to a timeout. A Sending line is never asked again until a lookup by its Line reference shows the rail doesn't have it; it can't be marked by hand while a lookup can still settle it.
_Avoid_: Pending, processing, submitted

**Sent**:
The Payment line state that says the payment rail accepted it and returned its own reference, recorded automatically. It is not proof of payment — the line can still fail — and it cannot be undone.
_Avoid_: Paid, submitted, processed

**Bank details change**:
An edit to a Payee's bank, branch code or account number after they were first entered (a new account type or holder name, or the same number reformatted, is not a change). It holds that Payee — no new batch, and any pending or approved batch holding them is rejected — until an Owner acknowledges or rejects it. Acknowledging records who and when and asks for no proof: confirming the account with the supplier is the Owner's responsibility, not DocuBite's. Rejecting restores the last acknowledged details. Several edits before a decision are one change, from the last acknowledged details to the latest; editing back to the acknowledged details ends it. Anyone who edited the change cannot decide it unless no other Owner is left to (then it reads self-acknowledged). A held Payee reads *Bank details changed* wherever it can't be paid. A Payee's first bank details are not a change. Bank details are only ever saved by a person: details read off an invoice or a Bank confirmation are offered to pre-fill, never written, and an invoice whose details differ from those on file fails a Check.
_Avoid_: Verified account, bank verification, AVS (DocuBite does not verify accounts); "verified" names only supplier trust

**Bank confirmation**:
The supplier's (or Claimant's) own letter confirming their bank details, optionally attached to a version of those details. It pre-fills them and is shown to the Owner deciding a Bank details change; it never marks the details verified and is never required.
_Avoid_: Proof of account (as a requirement), verification letter

**Payer account**:
A named workspace account a payment batch is paid from: the workspace's own account with a payment rail (a Chaperone merchant account, in Lesotho), whose credentials DocuBite keeps sealed. Its country decides which rail pays; a payer account with no rail wired (South Africa, for now) can't pay batches. DocuBite never holds or pools the money.
_Avoid_: Pay From (Vic's column label is fine on screen; the concept is the payer account), funding source, bank connection

**Payment terms**:
A supplier's net days and, when offered, an early-payment discount: the percent and the days within which it applies, shown as "2/10 net 30". A supplier without a discount shows no discount claim and no discount countdown.
_Avoid_: Terms code, "2-10-30"

**Planned pay date**:
The day a person intends to pay an invoice, set by anyone who can build a Payment batch and cleared freely; shown as *Pay on*. It only moves the invoice to that week in Due by week, marked Planned. It sends nothing, creates no Payment line and changes no paid state, so a planned invoice is not Scheduled. A date after the due date is allowed and says so.
_Avoid_: Scheduled (an open Payment line), scheduled payment, pay date (unqualified)

**Due by week**:
What the company has to pay, week by week in the company currency: Overdue, this week, the next five weeks, Later and No due date. It counts each unpaid invoice's amount due in the week of its Planned pay date, else its due date, and keeps approved invoices, invoices not yet approved and Expected invoices as separate layers, never one number. Scheduled and Sent invoices are still counted, since the money has not left. An open discount shows as a marker in its deadline's week, and Supplier credit shows as a note, never subtracted. Foreign-currency invoices count at their invoice-date rate; one without a rate is listed, not summed. It shows no receipts, no bank balance and no forecast.
_Avoid_: Cash flow, cash forecast, cash position (it shows only what goes out)

**Payment record**:
A DocuBite-side fact that an amount was paid against an invoice on a date: written when a Payment line settles Paid, or by hand (Mark as paid) for a payment made outside DocuBite. An invoice's paid state is derived from the ledger when it confirms payment, otherwise from its payment records. A payment record can be removed with a reason.
_Avoid_: Mark as paid (the action, not the record), settlement, ledger payment (that is the ledger's own line)

**Supplier contact**:
A person at a supplier whom DocuBite may email: an email address, with a name if one is known. Only Owners add or edit contacts, on Admin › Suppliers, and every change is logged. An email from the ledger's vendor or contact record, or from an invoice, is offered to pre-fill and never written. A contact is never pushed to the ledger. Up to three contacts per supplier can be flagged *Gets remittance advice*. A contact the email provider reports as bouncing reads **Bounced** and is skipped until an Owner edits it.
_Avoid_: Vendor contact, AP email (as the concept), supplier user (suppliers have no login)

**Remittance advice**:
The email that tells a supplier which invoices a payment covers: paid date, reference, and each invoice's number, date and amount paid (plus what is still due after a partial payment), any credits applied, and the total, all in the payment's currency. It is sent only from a Payment record, never on Scheduled or Sent, and only when the Owner recording the payment chooses to send it. There is one advice per supplier, per currency, per recording action, and a record is never advised twice. Its state is Queued, Sent, Bounced or Failed. A removed record drops off an advice not yet sent. An advice already sent is corrected only if an Owner chooses to send a correction (ADR 0021).
_Avoid_: Remittance (unqualified), payment notification, payment confirmation

**Company**:
The user-facing name for a team workspace in Admin and the switcher: one legal or financial entity with its own currency, tax jurisdiction, suppliers, ledger and members. "Workspace" is the storage and address term and never appears on a screen as the thing a person belongs to: a screen says Company, Personal, or drops the noun ("here", "this company"). The auto-created personal workspace is shown as Personal, never as a company.
_Avoid_: Entity (Vic's word), tenant, client (that is who the company belongs to), workspace (on screen), team workspace

**Company currency**:
The one currency — LSL or ZAR — a company's amounts, approval and automation limits, totals and ledger postings are expressed in; a document in another currency is converted into it. Set from the company's country when the company is created, and taken from the connected ledger's home currency if the Owner accepts it; it can change only until the company's first posted bill or first payment batch, after which it is locked. A tax jurisdiction's currency is the currency its returns are filed in, not the company currency. Written as its ISO code (LSL 1,234.50), never a symbol.
_Avoid_: Base currency (the storage term), home currency (that is the ledger's), reporting currency, functional currency

**Organization**:
A named group of companies an accountant or finance team runs under one login. Belonging to an organization never by itself opens any of its companies; access to each company is granted separately, with its own role. A company can only be removed from its organization from another company: the pane caption "Switch to another company to remove this one." is the one place that rule is said, and no other surface offers the action.
_Avoid_: Firm (the derived workspace mode), account, tenant

**Role**:
A person's standing in one company — Owner, Reviewer or Member — and the only thing that decides what they can do in that company's books and Admin sections. Roles are per company; the same person may be Owner in one company and Member in another. The words Owner, Reviewer and Member belong to this ladder alone.
_Avoid_: permission level, access level, entity role (Vic's word)

**Organization admin**:
The one organization-level standing, shown as a fact ("Organization admin") or absent ("—"), never as a ladder and never called "member". It lets a person rename the organization and see it in Admin; it opens no company by itself. The person who names the organization is its first admin.
_Avoid_: Org admin (abbreviation), admin (bare — that is the area), organization member, organization owner

**Admin**:
The desktop-only area, reached from the bottom of the rail, that holds every setting: Organization (Dashboard, Companies, Users) and the current Company (Configuration, Approval Flows, PO Mismatch Flows, Suppliers, Integrations). Account-level settings (security, sign out) live in the account menu, not in Admin. Admin › Dashboard is the per-company triage rollup for an organization with more than one company; it is not the workspace home. Three admin-ish standings exist and no fourth is added: Organization admin (the organization), Owner (a company) and Admin (this area). The platform operator role (`User.role = "admin"`, the ops console) is never shown or named in this app.
_Avoid_: Settings (as the area's name), Controls (folded into Configuration), preferences, administrator (as a role name), superadmin

**Configuration**:
The Admin section that says what a company's queues and Detail pane show and what may happen without a person: the per-type field table (Editable, Required, Width), the autonomy level and what blocks a publish, tax, email intake and what is switched on. Every switch carries one sentence saying what it changes.
_Avoid_: Automation settings, workspace settings

**Immersive surface**:
A document-detail or worksheet page that temporarily takes over the viewport while preserving workspace identity, a clear return action, and relevant workspace status.

**Document type**:
Which kind of document a file is — Invoice, Purchase Order, Receipt, Bank Statement, or one of the secondary kinds (delivery note, contract, payslip, tax form, other). Asserted by the queue it was added to, or by classification for email intake, and never asked again on that queue. Changing it is a **Move** to another queue: the document leaves this queue and opens on the other with its extracted fields kept; secondary kinds are found in Search only. A document cannot be moved while an approval decision is pending on it, once it is Posted or Paid, or while it is a purchase order with matched invoices.
_Avoid_: Category, kind, classification (as a user-facing word), re-type, reclassify

**Direction**:
Retired (owner, 2026-09-17). DocuBite is accounts-payable only: every invoice and receipt is money the workspace owes, so there is no direction to choose and no Receivable side. The ledger push is always payable. Kept here so the word is not reintroduced.
_Avoid_: Payable/Receivable (as a field), Category, Expense/Sale (as labels), sales invoice, AR

**Queue screen**:
A typed destination's list view (Invoices, Purchase Orders, Receipts, Bank Statements, Exceptions). The queue fills the work area; selecting a row opens the Detail pane beside it, and the operator never leaves the screen to review, approve, or resolve a row. On a phone the same rows render as two-line cards (processing mark, name and amount, reference and due, state) in the same order, with Sort and the facets behind one Filters button and no selection; the queue never scrolls sideways at any width.
_Avoid_: mobile table, horizontal scroller

**Empty queue**:
A Queue screen with no rows, which is one of three different things and says so: **first use** — the workspace has never held a document, so the queue explains what will appear and offers the first way to add one; **done** — documents exist but none needs the operator in this view, so the queue states the day's outcome; **filtered empty** — the facets exclude every row, so the queue offers to clear them. Which one shows is read from the data, never from a flag or a dismissal. The first-use state is the only first-run help in the app; it disappears on its own with the first row, and its explanation can be reopened from the account menu. There is no guided tour and no overlay.
_Avoid_: welcome tour, onboarding checklist, getting started (the queue is the guide), tourSeen

**Detail pane**:
The single place a row opens: on desktop a full-width document view — the source document on the left, an editable form on the right — and on a phone the same view full-screen over the queue with the document stacked above the fields. There is one Detail pane per Queue screen and it is the same view whichever queue opened it (Invoices, Exceptions, Approvals, Bill Pay). It is built for the Operator's day: the Status line and the checks summary under it say where the document stands and what is holding it before anything else; every check sits inline at the field or row it concerns; every field is editable and every edit saves at once; coding is an Account on each line; the sticky bottom bar holds the one decision. It has no tabs: the approval trail is a block under the status track, and the audit trail and the team note sit behind one History disclosure at the bottom. The pane has one header — the row's name, the Status line, and the pane's controls; the document is introduced once. Secondary and destructive actions (Archive, Cancel, Delete, Send for review) live in the pane's overflow menu, never as header buttons. Leaving the pane is never needed to finish a document; the decision advances to the next row.
_Avoid_: Approval Context (Vic's separate phone screen — DocuBite has one pane), detail sheet, document header (the pane header is the only header)

**Operator's day**:
The one line every document-view decision is traced to: *queue → each document: check what was read against the page, code it, approve → next, until the queue says done; Bill Pay pays.* The operator is the Reviewer working the queue, Needs attention first; the Approver's day is the same view opened from Approvals with the decision bar armed. Posting is the end-of-day bulk act from the queue, not a step of each document. A section of the Detail pane that serves no step of the day is not built.
_Avoid_: workflow (that is the pipeline), journey (the design word, not the product's)

**Origin context**:
The workspace, list, filters, position, and workflow state from which a user opened a detail or action surface — in DocuBite, the origin surface's address as it stood, including the selected row. It exists only for a **hop**: an in-app link that opens a row on a *different* surface (an Invoices row to its Exception, a Search result to its typed queue, a failed ledger push to its document, the Detail pane to its full-width page). Opening a row's Detail pane on the same queue, and choosing a queue from the rail, are not hops and carry nothing. Origin context lives exactly as long as the navigation that carries it: using the Origin link, the browser's Back, or any rail link ends it; nothing is remembered for the session. Returning restores the origin whenever it still exists; when the row no longer matches the origin's filters, the queue says so and offers to show the row instead of silently dropping it. Carried in the URL as `from=` (the origin's path and query, verbatim); a document deleted underneath a hop sends the reader back with `gone=` and the queue says so.
_Avoid_: breadcrumb, recent, last-visited, remembered filters (a saved View is the durable way to keep filters)

**Origin link**:
The one visible way back from a hop: a single strip above the arrival surface's header that names the origin surface and the row or search it will restore (*← Back to Invoices · Acme Corp · INV-1042*). It renders only while an Origin context exists, agrees with the browser's Back, and is the only control that crosses surfaces — the Detail pane's × and Escape close the pane on the current queue and never leave it.
_Avoid_: Back button (ambiguous with the browser's), Return, Open document in a new tab as the only way to the row

**Keyboard shortcut**:
A key or two-key sequence that moves the operator around the app — to a queue, to the filters, to the shortcuts dialog — and never edits, decides or deletes anything. Shortcuts are on by default, listed in one Keyboard shortcuts dialog reached from `?` and the account menu, ignored while the operator is typing in a field or inside a dialog or menu, and can be turned off per person in one switch. Moving between rows with the arrow keys, opening a row with Enter and closing the Detail pane with Escape are not shortcuts: they work whenever the queue or pane has focus and stay on when shortcuts are off. Shortcuts exist on desktop widths only.
_Avoid_: Accelerator, hotkey, single-key approve (never; a decision is a click on the decision bar), power-user mode

**Workflow operation**:
An in-progress or recently completed unit of work such as extraction, sync, review assignment, worksheet placement, approval, or publish. An operation remains discoverable after navigation so the user can understand what happened and what to do next.

**Operation status**:
The user-facing progress and outcome for a workflow operation, shown inline where the operation began and in the workspace activity/status area. It includes the current step, progress when known, and a plain-language next action.

**Partial outcome**:
A batch result in which individual items may succeed, need review, be skipped, be canceled, or fail. Partial outcomes remain visible per item rather than being collapsed into one batch-level success or failure.

**Server-confirmed action**:
An action whose durable or external effect is not treated as complete until the server confirms it, including approvals, posts to the ledger, and other financial writes. Local optimistic feedback may precede confirmation only for reversible, low-risk changes.

**Touchless**:
A document whose extracted fields all met the workspace's confidence threshold and was posted to the ledger without a human review step. Shown on a record as a fact once it has happened, not as a prediction or a pending state.
_Avoid_: Auto-approved, zero-touch

**Processing state**:
Where a queue row stands in the intake → review → approval path, shown as one mark at the row's leading edge. Exactly one of, in precedence order: Cancelled, Needs attention (a check blocked it, an escalation is open, or an approval was rejected), In review, Touchless, Approved. Ledger facts such as Posted or Paid are not processing states and are shown separately, as the Ledger mark. Due-date urgency is not a processing state either. These five words are the only words the app uses for where a document stands — the row, the Detail pane's status line, the stepper and the Approval tab all say the same one, derived the same way. A document nobody has opened yet is In review.
_Avoid_: Status (the column of pills is broader), aging (that is the due-date signal), Unreviewed / Reviewed / Signed off / Awaiting approval (synonyms the surfaces used to invent), the stored status values (queued, needs review, ready for review, reviewed — persistence words, never shown)

**Status line**:
The one line at the top of the Detail pane that states the row's processing state and the fact behind it — who decided, when, or what is holding it: "Approved by Nadia K. · 12 Sep 2026", "In review · opened 3 days ago", "Needs attention · 2 open checks", "Touchless · sent automatically", "Cancelled · duplicate". Ledger facts follow as their own mark ("Posted 12 Sep · Open in ledger"). It replaces the pane's separate status pill; the Approval tab holds the full trail behind it.
_Avoid_: pane pill, status badge

**Confidence threshold**:
The single workspace-set score an extracted field must reach to count as confident. It is the same floor Touchless is judged against, so a field that clears it in a queue row would also clear it for Touchless. A field entered by a person, or never scored by extraction, has no confidence and shows no confidence claim at all — absence means "not an AI claim", not "low".
_Avoid_: High confidence, low confidence (as if they were fixed numbers), the internal stage cutoff or amount-band floors (those are gates, not the user-facing threshold)

## Public marketing and coverage

**Supported coverage**:
A jurisdiction with a registered, working jurisdiction pack that can support the relevant document-to-ledger workflow.
_Avoid_: Global support, available everywhere

**Roadmap coverage**:
A jurisdiction the product may support later but cannot currently accept for the relevant workflow. It must not be presented as available or used to qualify a current signup promise.
_Avoid_: Supported, coming soon (unless the rollout is an explicit product commitment)

**Trial**:
A time-bounded product-access period with an explicit start, expiry, and billing or cancellation path. DocuBite must not use this term publicly until those supporting paths exist.
_Avoid_: Free workspace, evaluation

**Account creation**:
The current public entry action: creating a DocuBite account before setting up or joining a workspace. It is not a trial start or a payment event.
_Avoid_: Start free trial, Subscribe

**Workspace storage cap**:
The hard limit of 200 MB of stored documents per workspace. It must be disclosed before an upload is accepted, even when it is omitted from the marketing CTA.
_Avoid_: Unlimited storage

**Connected accounting system**:
An external accounting platform a workspace can connect to today, currently QuickBooks Online or Xero.
_Avoid_: Available integration when the connector is not live

**Planned integration**:
A named future accounting destination shown as roadmap intent, not as a capability available today. Planned integrations must not be presented with vendor marks without approved permission.
_Avoid_: Supported, connected, coming soon

**Product capability**:
A public-facing product area organized around one coherent mechanism and the visitor outcome it enables. The current capability vocabulary is Document extraction, Controls & fraud, Close the books, Data health, and Integrations & API.
_Avoid_: Feature list, module

**Product overview**:
The public entry point that orients visitors to the product capability set before directing them to detailed capability pages.
_Avoid_: Feature dump, single-scroll feature wall

**Trust & security**:
The procurement-facing explanation of DocuBite's safeguards, data handling, access controls, auditability, and compliance posture. It is a trust destination, not a Product capability.
_Avoid_: Security feature, compliance promise

**Solution**:
A role-oriented explanation of how DocuBite fits a team's workflow. Document types describe capabilities and belong with Product, not with the role-oriented Solutions structure.
_Avoid_: Document type, industry page

**Document extraction**:
The Product capability that turns supported PDFs and images into reviewable structured rows with visible confidence and source provenance. It describes the extraction and review mechanism, not a guarantee that every input is readable.
_Avoid_: Perfect OCR, quality rescue

**Controls & fraud**:
The Product capability that applies explainable checks, gates, approval rules, and human review before risky workflow steps.
_Avoid_: Fraud prevention guarantee, autonomous approval

**Close the books**:
The Product capability that coordinates close checklists, gated period transitions, accrual drafts, aging, matching, and related month-end work.
_Avoid_: Automatic close, payment execution

**Data health**:
The Product capability that surfaces scored pipeline, ledger, and tax hygiene so teams can find drift before it becomes a reconciliation problem.
_Avoid_: Data correctness guarantee, audit certification

**Integrations & API**:
The Product capability for sending reviewed data to a connected accounting system (Xero or QuickBooks) and workspace-scoped external systems through documented API and webhook surfaces.
_Avoid_: Universal integration, available connector when it is only planned

**Capability page**:
A detailed public Product page organized around one outcome, one mechanism, evidence-backed proof points, explicit limits, and one account-creation action.
_Avoid_: Feature dump, unsupported promise
