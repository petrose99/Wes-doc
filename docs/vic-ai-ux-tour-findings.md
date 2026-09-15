# Vic.ai Self-Guided Tour — UX/UI Findings for DocuBite

Source: https://content.vic.ai/self-guided-tour-live (walked interactively, screenshots captured at each state, 2026-09-14).

Vic.ai markets itself as an "Autonomous Finance Platform — Accountable AI for Accounts Payable." The demo covers: Admin View, Autonomous Invoice Processing, Approvals, Autonomous PO Matching, and Payments. This document captures what was actually observed, not marketing copy, and translates it into gap-closing suggestions for DocuBite (document inbox + AI extraction + accounting sheets).

---

## 1. Product structure / IA

- **Top nav** is a fixed dark-purple gradient bar: `Admin | Invoices | Purchase Orders | Approval ▾ | Attachments | Payment ▾`, with an entity/company switcher dropdown on the far left (multi-tenant: "Vic.ai Product Demo", "Jessica Inc", etc.) and a user avatar menu on the far right.
- **Admin is a distinct top-level area**, not buried in settings. Its own left sidebar splits into two groups:
  - **ORGANIZATION**: Dashboard, Companies, Users
  - **COMPANY**: Configuration, Approval Flows, PO Mismatch Flows
- **Operational views** (Invoices, Purchase Orders) use a secondary left rail with **saved Views** (e.g. "View • Default / Review", "View • Default / Open") rather than a single fixed list — this is essentially a saved-filter/segment switcher pinned to the page.
- Every list screen has the same three-part header: **View switcher → Sort → Filters** (filter chips shown inline, e.g. "Status: Open Invoices", "Invoice Approval: 4 Approved or Not Started..."), so the mental model of "which subset am I looking at" is always visible, not hidden in a slide-over.
- Clicking a row opens a **right-hand split panel** (not a full navigation), keeping the list visible on the left. This is consistent across Users, Invoices, and PO Matching — one interaction pattern reused everywhere.

**Takeaway for DocuBite**: a single consistent "list + saved view + inline filter chips + right-side detail panel" pattern used everywhere reduces relearning cost per screen. If DocuBite's screens each invent their own layout, this is the highest-leverage structural change.

---

## 2. Key workflows observed

### Dashboard (Admin)
Two-column "per entity" rollups: **Open Invoices Per Entity**, **Pending Approvals Per Entity**, **Pending PO Mismatch Approvals Per Entity** — plain tables of entity name → count, each entity name a link. No charts, no color. It's a triage list, not a BI dashboard, and it's honest about that (one panel says "There are currently no PO mismatches for you to review" as a plain empty state, not a graphic).

### Admin → Configuration (field-level customization)
- An **"Invoice Fields" table**: every field (Status, Vendor, Amount, Approval, Invoice Number, etc.) has per-field **Editable / Required / Width** checkboxes/number, plus a delete (✕) to remove custom fields. This is metadata-driven forms — the customer defines what the extraction schema looks like and how it renders, without engineering involvement.
- Adjacent toggle groups: **"Ways Invoice Can Leave Vic.ai"** (Enable posting / exporting / transferring — each maps to a specific action button's visibility) and **"Changes to Masterdata"** (Disable vendor creation) and **"Expense Invoice - Approval Process"** (Block approval if missing required fields, Enable editing while undergoing approval, Enable editing of approved invoices). Every toggle has a one-sentence plain-English consequence written directly under it.

**Takeaway**: the pattern of "toggle + one sentence explaining exactly what UI element it turns on/off" is good self-service admin UX — no separate docs needed to understand a setting.

### Admin → Users
- User list has inline delete (red ✕), search, and an export icon.
- Clicking a user opens a right panel with **Information / Companies** tabs; under Companies, permissions are scoped **per entity** (User Type: Accountant/Approver radio, User Level checkboxes) rather than one global role. Each entity the user has access to gets its own expandable section with its own role settings and its own remove (✕) button.

**Takeaway**: DocuBite likely only needs this if multi-entity/multi-company access is a real use case — otherwise this is over-engineering to copy wholesale. Worth adopting only the *idea* (permissions are entity-scoped, not just role-scoped) if DocuBite ever supports multiple companies per account.

### Invoices (Autonomous Invoice Processing)
- Default **"Review" view**: a dense table (Status icon, Inserted At, Vendor, Amount, Approval icon, Invoice Number, Type, Bill Description, Invoice Date...). Every extracted text field (Vendor, Invoice Number, Invoice Date) has a **thin colored underline bar** beneath it — green underline = AI is highly confident in that specific field's prediction. This is a per-field, always-visible confidence signal that costs zero clicks to see.
- The leftmost column has small icons per row indicating processing state: a blue circular "autopilot" icon (invoice is confident enough to skip human review and go straight to approval/payment), a red icon (needs review), a dotted/blue icon (in progress / duplicate flag), etc. Hovering/reading these is how a user triages a queue of hundreds of invoices without opening each one.
- Clicking a row opens the **split view**: left = editable extracted fields grouped into Expenses/Items tabs with a GL Account line-item table; right = the actual source PDF/image with zoom, search, page navigation, and download/open-in-new-tab icons. This pairing (editable structured data next to the literal source document, always visible together) is the single most important pattern in the whole product — it's how a human builds trust in what the AI extracted, and it's how corrections get made in-context instead of alt-tabbing between systems.
- **Audit tab** (in the same right panel, next to a per-invoice "Approval" tab): a chronological activity log — "Gavin — demogavin@vic.ai — Uploaded invoice — 2/16/2023 | 12:47 PM" — with a manual "Refresh audit log" action.
- **Approval tab**: shows the approval chain as **named steps** ("STEP 1 — Rejected", "One user must approve this step"), each step listing the specific approver(s) by name/email, a rejection reason typed by the rejecting user ("duplicate"), and a full initiated-by/timestamp trail at the bottom. This is a real audit trail with human accountability baked in, not just a status enum.
- Filter panel (opened from the "Filters" chip row) is a **faceted, pill-based multi-select**: Status (Open Invoices → Unreviewed/Reviewed sub-toggles; Closed Invoices → Posted/Exported/Transferred), Invoice Approval (Not Started/In Progress/Approved/Rejected/Cancelled as separate toggle pills you can multi-select). This is more granular than a single dropdown and lets power users build compound filters visually.

### Purchase Orders / Autonomous PO Matching
- PO-backed invoices get a small PDF-shaped icon; a **red badge with a number** (e.g. a red "1" superscript) on the icon signals "N mismatches to resolve" without opening the row.
- The "Purchase Orders" column shows the matched PO number as an inline **editable/removable chip** (with an "×" or count badge for multiple candidate POs on one invoice).
- **AI match confidence is explained in plain language, not just a score.** Hovering/clicking a matched-but-missing-PO-number case shows: *"There is no PO number on this invoice, but our AI has identified a likely associated PO from a matched line item."* followed by a literal confidence value (`No Value 0.98`). This is a genuinely good explainability pattern: it tells the user *why* the AI made the call, not just *how confident* it is.
- Line-item mismatch table (inside the invoice detail, "Items" tab): every matched field (Qty, Unit Price, UOM) gets its own **↔ equality glyph** (green `=` for match, red `≠` for mismatch) rendered *per cell*, so a 10-column line-item table instantly reads as a heat-map of what agrees vs disagrees.
- Clicking a mismatched cell shows the **exact tolerance math**: *"The invoiced quantity differs by more than 20% from the matched quantity. 538.00 > 525.60 (Acceptable Quantity)"*, followed by a breakdown: PO Qty / Received / This Invoice Matched Qty / Remaining To Match. This is the strongest AI-trust pattern observed in the whole tour — it doesn't just flag an exception, it shows the arithmetic that produced the flag.
- Each PO line has a row-level status label: **"Rule Violated" / "Success" / "Get Approval"** — plain English, color-coded, not a numeric code.
- An escape hatch always present: **"Enter Manual Match Mode"** — when the automation can't confidently resolve something, there's a named, discoverable manual override, not a dead end.
- The right pane in PO matching shows the **actual source invoice PDF** with the matched PO number, dates, and line items highlighted/boxed directly on the document image — reinforcing the same "structured data next to literal source" pairing as invoice review.

### Payments / Approval module (lighter tour coverage)
- Reached via top nav dropdowns (`Approval ▾`, `Payment ▾`); the demo menu also exposes "Approvals" and "Payments" as top-level guided walkthroughs, implying they're first-class flows equal in importance to invoice/PO processing, not afterthoughts.

---

## 2b. Approval, Payment & Attachments workflows (deep dive)

This section completes the walkthrough of the "Approvals" and "Payments" guided tours (previously only summarized), including their mobile counterparts, plus what was found for Attachments.

### Approval workflows — desktop
- The `Approval ▾` nav item splits into two independent queues via a dropdown: **Invoices** and **PO Mismatches** — approvers pick which type of exception/document they're clearing, rather than one merged inbox.
- Starting approval is a **bulk action from the Invoices list itself**: select row checkbox(es) → `Approval ▾` menu → **Start Approval** / **Cancel Approval**. This confirms with a **"Start Approval Summary" modal**: a checklist-style confirmation ("✓ Started (1 of 1)") listing exactly which invoices were submitted, by Type/Vendor/Invoice Number/Amount, before letting the user close it. Bulk actions always show a scoped success receipt, not a generic toast.
- Once submitted, the approver's own view becomes a **personal "Ready to Approve" inbox** (View • Default = "Ready to Approve"), scoped to invoices assigned to them — this is a distinct saved view, not a filter the user has to build.
- Approving/rejecting from this inbox opens an **"Approve Invoices" modal**: an optional free-text **Comment** field, an **"Eligible for Approval (N of M)" status strip** (green dot) showing how many of the selected items actually qualify, a recap table (Type/Vendor/Invoice Number/Amount), and a single confiral button labelled with the exact count — **"Approve Invoices (1)"**. Bulk approval never hides the count behind a generic "Confirm."

### Approval workflows — mobile app
The tour includes a full **mobile app mockup** (phone frame, not just "responsive web"), presented as an equally first-class surface:
- **Home screen ("Welcome Back!")**: two large tappable summary cards — "Awaiting Your Approvals: 1 Invoice → Go to Approvals" and "No PO Mismatches → Go to PO Mismatch Approvals." Even with zero items in one queue, the empty queue still gets its own card and CTA (consistent presence, not a hidden empty state).
- **List screen ("Ready to Approve")**: each row is a card, not a table row — due date, a status pill ("In Progress"), amount in green, vendor name. Card-based density on mobile vs. table density on desktop — the same data, re-composed per surface rather than a squeezed-down table.
- **Detail screen**: a vertical field list (Doc Type, Invoice Number, Invoice Date, Bill Description, GL Account, Location, Department), a **"More From This Vendor"** section (surfaces vendor history/duplicate risk inline), and an **"Approval History"** section styled like a **package-tracking timeline** — a vertical line connecting circular step markers ("● INITIATED — Jessica Sadow, 5/1/2024 10:58 AM" → "○ PENDING") with avatar photos per actor. This timeline metaphor (borrowed from shipment tracking, not from typical enterprise software) makes a multi-step approval chain immediately scannable even to a non-technical mobile user.
- **Approval Context screen**: reachable by tapping "View" next to the amount — shows the actual invoice image thumbnail at the top, then the same field list, confirming the source-document-next-to-data pairing holds even on the small mobile surface, just stacked vertically instead of side-by-side.
- Fixed **bottom action bar** with large **Reject** (red) / **Approve** (green) buttons always visible while scrolling the detail — a thumb-reachable, unambiguous binary decision point.

### Payment workflows
- The `Payment ▾` nav splits into **Bill Pay** (the open-bills queue to select and pay) and **Payment Batches** (the manager/approver queue reviewing already-submitted batches) — mirroring the same "doer queue vs. approver queue" split seen in Approvals.
- **Bill Pay list** columns: Vendor, Invoice Number, Invoice Date, **Terms** (e.g. "2-10-30" shown in purple/blue), Due Date, a **due/discount countdown badge**, Bill Total, Currency, Est. Arrival Date (payment method icon + date), **Amount To Pay** (editable, defaults to the discounted amount when eligible), **Pay From** (bank account, editable per row).
- **Two distinct countdown badge colors carry two different meanings**: a **purple lightning-bolt badge "⚡ Expires in N Days"** means an early-payment cash discount is about to lapse (urgency = money left on the table); a plain **blue "N Days Away"** badge is just the standard due-date countdown with no discount at stake. Same visual pattern (colored pill, "N Days" copy), different color = different consequence — an efficient reuse of one component for two semantically different signals.
- **Discount math is shown inline, not just as a total**: the "Amount To Pay" cell shows the discounted figure in blue, with the original **`DUE` amount struck through directly beneath it** in the same cell — so the savings amount is visually obvious per line without opening the row or checking a report.
- Selecting rows surfaces a **bulk action bar**: **"Create Batch Payment"**, **"Mark as Paid"**, **"Set Bank Account to Pay From"** (a dropdown listing named bank accounts — Texas Bank, Denver Bank, New York Bank, Florida Bank — letting a bulk selection be repointed to a different funding account in one action).
- **"Create Batch Payment" modal**: an **auto-generated Batch Name** pre-filled as a date+sequence code (e.g. `2024-05-02-001`, editable), an optional Comments field, then the selected bills **grouped by vendor** (vendor name as a section header, not a flat list) with a per-line red "×" to drop a bill from the batch before submitting, and a summary footer strip: **Bills count / Total Amount / [Bank Name] total** — three at-a-glance numbers before the final "Confirm & Create Batch" button.
- **Payment Batches (approver) view — "Early Payment Savings" dashboard**: this is the one place in the whole product with a genuine KPI visualization — a horizontal **gradient progress bar (purple → blue)** with a draggable-looking marker showing **"50%"**, and the caption **"$X saved of $Y"** (the percentage of available early-payment discounts actually captured, filterable by date range via a "Last 30 Days" selector top-right). This directly contradicts the earlier claim that Vic.ai's dashboards are uniformly chart-less — the payments team specifically gets a trend/performance metric, just not the global Admin dashboard.
- Below the KPI, a **Pending Approval / Paid tab pair** lists submitted batches: Date Created, Submitted By (avatar + name), **Due** (with the same purple/blue/red countdown badge pattern — including a **red "⚠ N Days Overdue"** state not seen elsewhere in the tour, for batches that have blown past their due date while still awaiting approval), Batch Name, Total Bills, Total Amount, Currency, Pay From.
- Clicking a batch opens a **review slide-over**: submitter identity + exact timestamp ("Jessica, 4/25/2024 | 05:24 PM"), the same Bills/Total Amount/Bank summary cards seen in the creation modal, the vendor-grouped line items again, and a fixed footer with **Reject** (red) / **Approve & Pay** (green) — the same reject/approve-and-commit pattern used for invoice approval, reused here for money movement. There is no separate "schedule for later" vs. "pay now" split visible in the tour — approving a batch pays it.

### Attachments
- **Attachments has no dedicated guided-tour module** — it does not appear in the Demo Menu's module list (Admin View, Autonomous Invoice Processing, Approvals, Autonomous PO Matching, Payments are the only five first-class walkthroughs). It exists only as a plain top-nav link with no scripted walkthrough content, and in the demo's checkpoint state ("Continue with the product tour, or schedule a call") the nav bar is visibly dimmed/inert, so its actual screen could not be reached in this session.
- **Implication, not confirmed behavior**: treating Attachments as a second-class, undifferentiated file-list screen (versus the heavily-designed Invoices/PO/Approval/Payment flows) may be an intentional prioritization by Vic.ai — or a gap in their own product. Either way, it means DocuBite should not assume Attachments-equivalent screens (raw document library, non-invoice files) need the same investment as the core AI-review workflows; the effort should go where Vic.ai visibly put its own effort (extraction, matching, approval, payment).

---

## 3. AI/automation UX patterns (most important section)

This is the core of what DocuBite should study, since both products are "AI decides, human reviews the exceptions."

1. **Confidence is shown ambiently, not just on demand.** The green/amber underline bars beneath extracted field values are visible in the list view before you ever open a row. A user scanning 50 rows can eyeball which invoices are "safe" without clicking into any of them.
2. **A named concept ("Autopilot") separates "fully autonomous" from "needs a human."** It's not a binary confident/not-confident score — it's an explicit product concept with its own icon, explained in its own tour step: *"the AI's confidence level is high enough that the invoice can be sent straight to approval or payment without human review."* Naming the automation tier makes the trust boundary legible to the user.
3. **Every exception explains itself in one sentence of plain English before showing any number.** "There is no PO number on this invoice, but our AI has identified a likely associated PO from a matched line item." / "Red indicates a problem with the PO. For example, there could be no PO, the PO is closed, or there is a quantity violation." / "The invoiced quantity differs by more than 20% from the matched quantity." Numbers (0.98, 538.00 > 525.60) come *after* the plain-English reason, functioning as supporting evidence rather than the headline.
4. **Mismatches are localized to the exact cell/line, not just the invoice.** The `≠` glyph sits directly on the Qty/Price/UOM cell that disagrees; you never have to guess which of 10 line items caused the flag.
5. **Human accountability is preserved even in an "autonomous" system.** The Approval tab records who rejected what and why (free-text reason), and the Audit tab records who uploaded/touched the invoice and when. Automation handles the default path; a human decision is still named and timestamped when it happens.
6. **There is always a manual override with a discoverable name** ("Enter Manual Match Mode") rather than the AI silently blocking progress or the user having to find a support workaround.
7. **The source document is always one pane away, never a separate download.** Every AI claim (a field value, a match, a mismatch) is checkable in the same screen against the literal PDF, with the relevant region visibly boxed/highlighted on the document itself in the PO-matching view.

---

## 4. Notable UI craft details

- **Color is used sparingly and functionally, not decoratively**: green = confident/match/success, red = needs attention/mismatch/rejected, amber/orange = in-progress or "autopilot pending," blue = informational/in-review. No gradients or illustration are used to communicate status — only these four semantic colors plus icon shape.
- **Icons are small, dense, and consistent**: a family of ~6 small square/circle glyphs in the leftmost table column carries most of the "what state is this row in" information, letting the rest of the row stay text-dense (this is a high-density enterprise table, not a card-based consumer layout).
- **Underline-as-confidence-indicator** is a nice reuse of an element (a thin colored bar under text) that doesn't consume extra horizontal space in an already-packed table — worth studying as a technique specifically because it's cheap to implement and doesn't fight the existing column layout.
- **Empty states are one plain sentence** ("There are currently no PO mismatches for you to review"), no illustration, no CTA button — functional, not precious.
- **Modals for tolerance/mismatch explanations appear on hover or click near the cell**, positioned adjacent to the flagged value rather than as a full-screen dialog — keeps the user's place in the table.
- **The right-hand document viewer** has its own dedicated toolbar (zoom in/out, search within document, page count "1/1", download, open-in-new-tab) — treated as a first-class sub-application, not an embedded iframe afterthought.

## 4b. What felt clunky or dated (do not copy)

- The **demo/tour tooltip layer itself was fragile** — clicking outside its exact target sometimes left an invisible full-page overlay that blocked all further clicks until the page was reloaded or scrolled. That's a property of the third-party demo tool (Navattic-style), not the real product, but it's a reminder that spotlight/onboarding-tour overlays need very tight target hit-boxes or they actively break the product underneath them.
- The **dashboard is just two plain HTML tables** with no visual hierarchy, sparkline, or trend — for a company whose pitch is "autonomous," the one screen an exec would actually look at (the Dashboard) is the least informative screen in the product. It answers "how many are open" but not "is this getting better or worse," "what's stuck," or "what needs me right now" beyond a raw count.
- **Density is uniformly high everywhere** — there is no visual distinction between "this table is for a bookkeeper doing 200 rows a day" and "this table is a CFO glancing at exceptions once a week." Every screen defaults to maximum information density, which is efficient for power users but likely intimidating on first login (no evidence of a lighter/guided first-run state was seen anywhere in the tour).
- Confidence numbers like `0.98` are exposed but with no context for a non-technical user on what a "good" score is — the plain-English sentence saves this, but the raw score by itself would be meaningless to most AP clerks.

---

## 5. Concrete, actionable gap list for DocuBite (ranked by impact)

Each item ties to a specific screen/behavior above. None of these require adopting Vic.ai's colors/branding — they're interaction and information-architecture patterns.

1. **(Highest impact) Pair every AI-extracted field with its literal source, always, side by side.** If DocuBite's extraction review screen currently shows a form without the source document adjacent (or requires a click/tab to see the source), this is the single highest-leverage change — it's the mechanism that lets a user *trust* an AI extraction fast, because they can verify without leaving the screen.
2. **Add an ambient, per-field confidence indicator visible in the list view**, not just inside the detail view. A thin colored underline (or dot) under a field value in the table is cheap to add and lets users triage a queue without opening every row.
3. **Explain every AI decision in one plain-English sentence before any score/number.** Wherever DocuBite currently shows a confidence percentage or a "needs review" flag with no explanation, add the human-readable reason first (why did the AI flag this? what rule/threshold was crossed, with the actual numbers?).
4. **Name the "fully autonomous, no review needed" tier explicitly** (whatever DocuBite calls it) and give it its own icon/badge, distinct from "needs review" — don't just leave it as an implicit absence of a flag. Users trust automation more when the trust boundary itself is a labeled, visible concept.
5. **Localize mismatches/errors to the exact field or line item**, not just "this document has an issue." A `≠`/`=` glyph per cell in a line-item table (or DocuBite's equivalent line-level data) turns a wall of numbers into a scannable heat-map.
6. **Always provide a named manual-override path** when automation can't resolve something confidently (Vic.ai's "Enter Manual Match Mode"), rather than silently blocking or forcing a support ticket.
7. **Keep a real audit trail with human attribution and free-text reasons**, not just status enums — who touched this record, when, and why (especially for rejections/overrides). This matters a lot for an accounting product where "why was this changed" is a compliance question, not just a UX nicety.
8. **Standardize one list-page layout pattern (saved views + inline filter chips + row-click side panel)** and reuse it everywhere in DocuBite rather than each screen inventing its own filter/detail interaction — this is what makes Vic.ai feel coherent across very different modules (invoices vs. PO matching vs. users).
9. **(Lower priority, but cheap) Make toggle/setting explanations one sentence, inline, right under the control** — avoids sending users to separate docs to understand what a checkbox does.
10. **Don't copy the flat, chart-less dashboard** — this was Vic.ai's weakest screen at the global/Admin level. Note the correction from section 2b: Vic.ai does put a real KPI (an "Early Payment Savings" progress bar, % of available discounts captured) on the Payments-approver screen specifically — the lesson isn't "never show a chart," it's "put the one KPI that matters directly on the workflow screen where the relevant actor lives," not just on a generic top-level dashboard nobody customizes.
11. **Give bulk actions a scoped confirmation, not a generic toast.** Vic.ai's "Start Approval Summary" and "Approve Invoices" modals always show exactly which records were affected (by name/number/amount) and how many succeeded, before dismissing. If DocuBite's bulk actions (e.g. "reprocess 5 documents") just show "Done" or a plain toast, add a receipt listing what happened to what.
12. **Reuse one countdown-badge component for multiple urgency types, distinguished only by color** — Vic.ai's payment due-date badges (blue = normal countdown, purple = "discount expiring," red = "overdue") are the same shape and copy pattern ("N Days Away" / "Expires in N Days" / "N Days Overdue") with only the color and word changing. This is a cheap, high-leverage pattern for DocuBite anywhere multiple deadline types exist (e.g., document review SLA vs. a client-imposed due date) — one component, semantic color, no new UI to design per case.
13. **Design mobile as a first-class re-composition of the same data, not a shrunk desktop table.** Vic.ai's mobile approval flow turns table rows into cards and turns the approval chain into a vertical timeline (package-tracking style) — same underlying data as desktop, different, denser-for-thumb layout. If DocuBite has or plans a mobile view, this is the pattern to follow rather than a horizontally-scrolling table.
14. **Show discount/savings math inline in the cell, not just as a summed total.** The struck-through original amount directly beneath the discounted "Amount to Pay" is a good general pattern for "here's what changed and why" wherever DocuBite applies any automatic adjustment (rounding, currency conversion, tax correction) to an extracted value.
15. **Don't over-invest in screens Vic.ai itself treats as secondary.** Attachments has no guided tour and isn't in Vic.ai's own list of flagship modules — a signal that a generic document-library view is lower priority than the AI-review, matching, approval, and payment workflows. DocuBite should calibrate effort the same way rather than polishing every screen equally.

do other changes as the skill suggest, i want more of this style of vic ai
---

## 6. Verified walkthrough, 2026-09-15 (all five modules, headless Chromium, 1440×900)

Walked every module of the tour end to end — Admin View (6 steps), Autonomous Invoice Processing (8), Approvals (13), Autonomous PO Matching (11), Payments (16). Screenshots in `docs/vic-ai-tour-2026-09-15/`, alongside DocuBite's Invoices screen the same day for comparison. Sections 1–5 above hold; these are the measurements and corrections that matter for map #177.

**Queue composition (Invoices, Bill Pay, Purchase Orders, Payment Batches — identical shape)**
- Table is full-bleed across the app frame (~1370px of 1440). No reading column, no card. Rows are 62px.
- Header is one band (~115px): `View • Default / <view name>` column on the left · `Sort` · `Filters` as **summary chips** (`Status | Open Invoices`, `Invoice Approval | 4 Approved or …`). Clicking a chip opens a **facet dropdown** with hierarchical sub-toggles (Open Bills → Unpaid / Partially Paid / Rejected / Voided; Closed Bills → Pending / Scheduled / Paid), vendor and date inputs, and Cancel / Apply. The taxonomy is never laid out inline.
- Bulk action bar is its own row above the table head, shown once anything is checked: count badge · context actions (Post / Export / Delete / Approval ▾ / More ▾ on Invoices; Create Batch Payment / Mark as Paid / Set Bank Account on Bill Pay; Approve / Reject on Ready to Approve).
- Payment Batches is the one queue with a metric above it: a **single** progress bar (Early Payment Savings, saved-of-possible, period selector) over Pending Approval / Paid tabs. One bar, not a strip of cards.

**Row interactions**
- **Row click does two things at once:** the row **expands in place** (Expenses / Items tabs, GL line table, `View PO` toggle, per-line Status labels, `Enter Manual Match Mode`) **and** a **right-hand source pane** (~490px ≈ 36%) opens with the PDF, zoom, page nav, Edit ▾, download, open-in-new-tab. The list stays on the left, columns narrowed.
- **Checkbox select opens Audit / Approval on the left** (~312px), replacing the View column. Audit is a flat log with "Refresh audit log"; Approval is STEP n → Rejected/Approved with named users, reason, and an INITIATED footer.
- **Batch detail (Payments) opens as a wide right sheet** (~1100px ≈ 78%) with a summary strip (submitted by, bills, total, bank) and a **sticky bottom action bar** (Reject / Approve & Pay). Same sticky bottom bar as the mobile approval screen.
- Per-cell confidence underline has **three** states in the PO view: green (confident), yellow (partial), grey (no prediction). Section 2 above only mentioned green.
- PO-backed invoices live on the **Invoices** queue with a `PO` badge on the Type chip (red numbered badge = mismatches). The Purchase Orders screen is only the imported PO list (Status, Type, Vendor, Buyer, PO Number, Amount, Currency, Created). Matching is resolved on the invoice row, not on the PO screen.
- Bill Pay rows: Terms (`2-10-30`), countdown badge (`Expires in N Days` / `N Days Away` / `N Days Overdue`), Est. Arrival Date with method, and **Amount To Pay with the discounted amount over the struck-through due amount** — the inline-adjustment pattern #188 generalised.

**What this corrects in DocuBite's reading of Vic**
- #198's left-side History panel and #215's below-row expansion were both Vic-faithful. They failed in DocuBite because the work area was 800px, not because the placement was wrong.
- #211's eleven inline filter pills across two rows are not Vic's shape; Vic shows summary chips and a facet panel.
- Map #177's standing note that DocuBite keeps a *combined* fields+source pane (from #179) is the one deliberate departure; Vic splits fields (in-row) from source (right pane). #224 records the consequence: with a combined ~60% pane, History moves into that pane as tabs instead of a left panel.
