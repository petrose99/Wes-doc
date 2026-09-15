# TaxHacker Product Context

This glossary defines the product language used for the authenticated workspace experience and its document-to-ledger workflow.

## Authenticated workspace experience

**Workspace home**:
The Invoices queue. Opening a workspace lands the user on their work, not on a summary of it; "what needs me" is read from the rail badges and the queue's own counts. There is no separate overview surface.
_Avoid_: Dashboard, landing page, overview, next best action

**Unplugged surface**:
A feature the product no longer shows or routes to, kept only so it can be brought back deliberately. Worksheets, Expenses and Dictation are unplugged. An unplugged surface has no navigation entry, no row or bulk action, no badge, and its addresses do not open.
_Avoid_: Hidden, deprecated, legacy

**Core workflow destinations**:
Invoices, Purchase Orders, Receipts, Bank Statements, Exceptions, Finance, and Archive: the permission-filtered peer surfaces representing typed intake, escalated work, booked outcome, and the permanent source record. The four typed intake destinations replace the former single "Documents" surface.

**Document**:
The storage-and-extraction primitive underlying every typed destination. Every Invoice, Purchase Order, Receipt, and Bank Statement is a Document, but "Document" is no longer itself a user-facing destination — the user asserts which typed destination a Document belongs to at upload time, and that assertion is authoritative.
_Avoid_: Using "Document" as a destination name; unclassified/pending-classification states

**Invoice**:
The typed destination for a bill received from a supplier. Absorbs the former Documents/Bills surface; aging is a filter chip and a saved view here, and paying an approved invoice happens on Bill Pay, not on this queue.

**Purchase Order**:
The typed destination for a purchase order, paired with Invoices for matching and cumulative line-item comparison against what has already been invoiced against it.

**Receipt**:
The typed destination for a receipt. Absorbs expense-claim creation and approval as an action on selected rows rather than as its own destination.

**Bank Statement**:
The typed destination for a bank statement. The reviewer asserts the issuing institution; the first statement for that institution becomes its saved layout, and later uploads are checked against it for drift.

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

**Saved view**:
A named, reusable filter/sort/column configuration on a list screen. System views are seeded per screen and are not editable or deletable; a user can duplicate one into an editable, optionally shared, view.

**Work item**:
A single unit of pending work surfaced in a Next-action queue — a document awaiting review or a match awaiting confirmation. An approval awaiting a decision is an Approval, not a work item; it is worked by an Approver, not an assignee.

**Approval**:
A run started on an invoice by a person, moving through the stages of an approval flow until it is approved, rejected, or sent back for review. An invoice nobody has started an approval on is under review, not awaiting approval.
_Avoid_: Review task (the storage record), sign-off (as the umbrella term)

**Approver**:
The person who can decide the current stage of an Approval — a stage's named approver, or any owner where the stage names nobody. Distinct from an assignee, who works a review.
_Avoid_: Reviewer (that is who prepares the row), assignee

**Ready to Approve**:
The personal system view on the Approvals destination: every Approval whose current stage the signed-in person can decide, including rows that are not yet eligible, shown with the reason. The badge on the rail counts this view and nothing else.
_Avoid_: Pending approvals (that is the workspace-wide count), inbox

**Send back for review**:
The reversible middle path on an Approval: the stage is not decided, the invoice returns to review with a required reason, and the run can be restarted. Reject ends the run.
_Avoid_: Reopen, cancel (that withdraws a run before any stage is decided)

**Not eligible**:
An Approval that is visible to its Approver but cannot be decided yet because a hard check failed or an escalation is open on the invoice. Never hidden, never overridable from Approvals; the reason is shown on the row.

**Bill Pay**:
The queue of approved, unpaid invoices from which payment batches are created. An invoice reaches it only once its processing state is Approved; one that cannot be paid yet (no supplier bank details) stays visible with the reason.
_Avoid_: Payables, payment run (the queue), pay list

**Payment batch**:
A named set of approved invoices, one payer account and one currency, submitted by a member for an owner's decision. Pending approval, then Approved (its payment file can be downloaded), then Paid; or Rejected with a reason. Whether the file has been downloaded is a fact shown on the batch, not a state. A batch never moves money.
_Avoid_: Payment run, remittance (that is the advice sent to the supplier), transfer

**Payer account**:
A named workspace bank account a payment batch is to be paid from — a label that tells the uploader which bank portal the file belongs to. DocuBite never holds the account's credentials and the file never carries its number.
_Avoid_: Pay From (Vic's column label is fine on screen; the concept is the payer account), funding source, bank connection

**Payment terms**:
A supplier's net days and, when offered, an early-payment discount: the percent and the days within which it applies, shown as "2/10 net 30". A supplier without a discount shows no discount claim and no discount countdown.
_Avoid_: Terms code, "2-10-30"

**Payment record**:
A DocuBite-side fact that an amount was paid against an invoice on a date, by a batch or by hand (Mark as paid). An invoice's paid state is derived from the ledger when it confirms payment, otherwise from its payment records. A payment record can be removed with a reason.
_Avoid_: Mark as paid (the action, not the record), settlement, ledger payment (that is the ledger's own line)

**Company**:
The user-facing name for a team workspace in Admin and the switcher: one legal or financial entity with its own currency, tax jurisdiction, suppliers, ledger and members. "Workspace" remains the storage and address term. The auto-created personal workspace is shown as Personal, never as a company.
_Avoid_: Entity (Vic's word), tenant, client (that is who the company belongs to)

**Organization**:
A named group of companies an accountant or finance team runs under one login. Belonging to an organization never by itself opens any of its companies; access to each company is granted separately, with its own role.
_Avoid_: Firm (the derived workspace mode), account, tenant

**Admin**:
The desktop-only area, reached from the bottom of the rail, that holds every setting: Organization (Dashboard, Companies, Users) and the current Company (Configuration, Approval Flows, PO Mismatch Flows, Suppliers, Integrations). Account-level settings (security, sign out) live in the account menu, not in Admin. Admin › Dashboard is the per-company triage rollup for an organization with more than one company; it is not the workspace home.
_Avoid_: Settings (as the area's name), Controls (folded into Configuration), preferences

**Configuration**:
The Admin section that says what a company's queues and Detail pane show and what may happen without a person: the per-type field table (Editable, Required, Width), the autonomy level and what blocks a publish, tax, email intake and what is switched on. Every switch carries one sentence saying what it changes.
_Avoid_: Automation settings, workspace settings

**Immersive surface**:
A document-detail or worksheet page that temporarily takes over the viewport while preserving workspace identity, a clear return action, and relevant workspace status.

**Queue screen**:
A typed destination's list view (Invoices, Purchase Orders, Receipts, Bank Statements, Exceptions). The queue fills the work area; selecting a row opens the Detail pane beside it, and the operator never leaves the screen to review, approve, or resolve a row.

**Detail pane**:
The single right-hand pane on a Queue screen that shows the selected row's extracted fields beside its source document, with its approval chain, audit trail, and open checks as tabs. There is one Detail pane per Queue screen; it is the only place a row's detail opens in place. On a phone the same pane opens full-screen over the queue, with the source document stacked above the fields and the decision bar at the bottom; it is still the Detail pane, not a second screen.
_Avoid_: Approval Context (Vic's separate phone screen — DocuBite has one pane), detail sheet

**Origin context**:
The workspace, list, filters, position, and workflow state from which a user opened a detail or action surface. Returning from that surface restores the origin context whenever it still exists.

**Workflow operation**:
An in-progress or recently completed unit of work such as extraction, sync, review assignment, worksheet placement, approval, or publish. An operation remains discoverable after navigation so the user can understand what happened and what to do next.

**Operation status**:
The user-facing progress and outcome for a workflow operation, shown inline where the operation began and in the workspace activity/status area. It includes the current step, progress when known, and a plain-language next action.

**Partial outcome**:
A batch result in which individual items may succeed, need review, be skipped, be canceled, or fail. Partial outcomes remain visible per item rather than being collapsed into one batch-level success or failure.

**Server-confirmed action**:
An action whose durable or external effect is not treated as complete until the server confirms it, including approvals, ledger pushes, and other financial writes. Local optimistic feedback may precede confirmation only for reversible, low-risk changes.

**Touchless**:
A document whose extracted fields all met the workspace's confidence threshold and was pushed to the ledger without a human review step. Shown on a record as a fact once it has happened, not as a prediction or a pending state.
_Avoid_: Auto-approved, zero-touch

**Processing state**:
Where a queue row stands in the intake → review → approval path, shown as one mark at the row's leading edge. Exactly one of, in precedence order: Cancelled, Needs attention (a check blocked it, an escalation is open, or an approval was rejected), In review, Touchless, Approved. Ledger facts such as Synced or Paid are not processing states and are shown separately. Due-date urgency is not a processing state either.
_Avoid_: Status (the column of pills is broader), aging (that is the due-date signal)

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

**Built-in ledger**:
DocuBite's own double-entry ledger destination. It is a product capability, not an external integration.
_Avoid_: Third-party integration

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
The Product capability for sending reviewed data to the built-in ledger, connected accounting systems, and workspace-scoped external systems through documented API and webhook surfaces.
_Avoid_: Universal integration, available connector when it is only planned

**Capability page**:
A detailed public Product page organized around one outcome, one mechanism, evidence-backed proof points, explicit limits, and one account-creation action.
_Avoid_: Feature dump, unsupported promise
