# Spec — #463 Build: credit notes (type, classification, Credit allocations, Credited paid state, Checks)

`kind: backend` throughout — design pass (Intent/Impeccable/craft-floor/detector) **not owed**
(no surface steps). Governed by CODING_STANDARDS.md and ADR 0017. Vocabulary: `CONTEXT.md`
*Credit note*, *Credit allocation*, *Supplier credit*.

## Module boundary (`codebase-design`, no skill file in this repo — applied directly)

New module `lib/credits/` (pure) + `models/credits.ts` (Prisma), the same split as
`lib/approvals/engine.ts` / `models/review-tasks.ts` and `lib/payments/eligibility.ts` /
`models/bill-pay.ts`. Its boundary with `lib/payments/paid-state.ts` (named by #451's Action
Summary item 1):

- **Invariant:** a Credit allocation is never a Payment record and never touches a Payment line
  (ADRs 0007/0010). `derivePaidState` reads allocations as a second, separate covering source —
  never merged into `records`.
- **Invariant:** the same supplier is required credit note ↔ invoice; amount is capped at the
  lesser of the invoice's due and the credit's remaining (unallocated) amount.
- **Error mode:** allocating (or voiding an allocated credit note) while the invoice has an open
  Payment line is refused — a typed result (`{ ok: false; reason }`), never a thrown error the
  caller has to string-match.
- **Idempotency:** N/A for the DocuBite-side row itself (a plain authenticated create/void under
  workspace scope); Xero's allocation push (a queue row) is #464's concern, not this module's.
- **Ownership after approval:** editing or removing an allocation, and voiding a credit note that
  has allocations, are Owner-only, reason-required, audited — same shape as removing an
  `InvoicePayment` record (`models/bill-pay.ts` neighbourhood) and a Payee bank-details change.

## Step 1 — Type and classification — `kind: backend`

Files: `lib/doc-types.ts`, `lib/classification.ts` (no code change — its schema already spreads
`DOC_TYPES`), `lib/reclassify.ts`, `models/documents.ts`, `app/(app)/workspaces/[workspaceId]/actions.ts`
(`reclassifyDocumentAction`), `models/bills.ts`, `lib/document-processing.ts`.

- `lib/doc-types.ts`: add `"credit_note"` to `DOC_TYPES`. New `DOC_TYPE_SPECS.credit_note`:
  `label: "Credit note"`, `defaultCategory: "expense"` (AP-side, same bucket as invoice),
  `counterpartyField: "vendor"`, `taxField: "tax_total"`, `amountKeys`/`checkFields` mirroring
  invoice's (`subtotal, tax_total, shipping_total, other_charges, total, line_items, currency_code`),
  plus a canonical key **`credited_invoice_number`** (hint: "Invoice number this credit note
  refers to") — distinct from the credit note's own `invoice_number`/reference, and the field
  Step 2's proposed-allocation match reads. `matchCandidateFields`/`matchRole`: none (credit
  notes are not PO/receipt match candidates). `canonicalKeys`: same fields as invoice's, minus
  `due_date`/`po_number`, plus `credited_invoice_number`.
  - `DOC_TYPE_TO_LEGACY_CODE.credit_note = "credit_note"` (its own template code, not folded into
    `"generic"` — needed so `models/bills.ts`'s per-template query and `models/document-checks.ts`'s
    same-template duplicate scoping separate credit notes from invoices automatically).
  - `PUSHABLE_DOC_TYPES`: add `"credit_note"` (Q4/Q12: posted like an invoice).
  - `isPaymentConfirmationRequired`: credit notes never get the paid/unpaid manual-confirm gate
    (they're never "paid" themselves — they're allocated). Special-case it ahead of the
    `isExpenseDocType` fallback: `if (resolveDocType(doc) === "credit_note") return false`.
  - Do **not** add `credit_note` to `DIRECTION_FIELD_TYPES` — out of this ticket's scope (no Q14–18
    surface work here); it stays without a Direction row, same as bank_statement.
- `lib/classification.ts`: no change needed — `CLASSIFICATION_SCHEMA`'s `doc_type` enum already
  spreads `DOC_TYPES`, so `credit_note` becomes pickable the moment Step 1 lands. Add one line to
  `buildClassificationPrompt`'s instructions: "A credit note reduces what's owed to a supplier —
  pick credit_note when the document is titled/marked as a credit memo, credit note, or refund
  from the supplier, regardless of whether its printed total is shown negative." (Q2/Q8: the
  extracted number can be negative; the type is what carries direction, not the sign.)
- **Sign normalization** (Q2): wherever extraction/classification results are merged into
  `reviewedData`/`rawExtraction` in `lib/document-processing.ts` (the post-extraction merge step),
  when `classificationData.docType === "credit_note"`, take `Math.abs()` of `total`, `subtotal`,
  `tax_total`, `shipping_total`, and each `line_items[].amount`/`unit_price` before persisting.
  Seam: a pure helper `normalizeCreditNoteSign(extraction: Record<string, unknown>): Record<string, unknown>`
  in `lib/doc-types.ts` or a new `lib/credits/sign.ts`, called once at the merge point.
- **Move both directions** (`reclassifyDocumentAction`, `app/(app)/workspaces/[workspaceId]/actions.ts:210`):
  today it only flips `docType` + `codingData.documentType`. Add: when the move crosses
  invoice ↔ credit_note, negate `total`/`subtotal`/`tax_total`/`shipping_total`/each line's
  `amount`/`unit_price` in `reviewedData` (reuse the Step 1 sign helper, called with the *opposite*
  target so invoice→credit_note takes `abs()` and credit_note→invoice takes `-abs()` — actually
  both directions want a positive stored total under either type per Q2, since "the type carries
  the direction" for credit_note but invoice totals are already conventionally positive too; the
  real transform is just "store the printed magnitude, drop any existing sign" — i.e. always
  `Math.abs()`, both ways). Reuse the same helper both directions. Audit event unchanged
  (`document_reclassified`).
- `models/bills.ts` (`listWorkspaceBills`): its `where` clause is `template: { code: "invoice" }`
  only (not docType-based) — change to `template: { code: { in: ["invoice", "credit_note"] } }`.
  Add `docType: DocType` (via `resolveDocType(doc)`, needs `doc.template.code` — already selected)
  to `BillRow`, populated for every row. A credit-note row naturally gets `extractedDueDate: null`,
  `dueDate: null`, `agingBucket: null`, `po: <empty link>` — none of those fields exist in its
  extraction, nothing new to guard. **Seam:** `listWorkspaceBills` → `models/bills.test.ts` (new;
  none exists today — add one asserting a credit_note row appears with `docType: "credit_note"`
  and null due/aging/po).

## Step 2 — Credit allocation model — `kind: backend`

Files: `prisma/schema.prisma` (+ migration `prisma/migrations/20261001090000_add_credit_allocations/`),
`lib/workspace-scope.ts`, `lib/credits/allocation.ts` (new, pure), `models/credits.ts` (new, I/O).

- **Schema** — new model, shaped like `InvoicePayment` (soft-removable, reasoned):
  ```
  model CreditAllocation {
    id              String    @id @default(uuid()) @db.Uuid
    workspaceId     String    @map("workspace_id") @db.Uuid
    creditNoteId    String    @map("credit_note_id") @db.Uuid   // Document (docType credit_note)
    invoiceId       String    @map("invoice_id") @db.Uuid       // Document (docType invoice)
    amount          Decimal   @db.Decimal(18, 2)
    createdById     String?   @map("created_by_id") @db.Uuid
    removedAt       DateTime? @map("removed_at")
    removedById     String?   @map("removed_by_id") @db.Uuid
    removedReason   String?   @map("removed_reason")
    createdAt       DateTime  @default(now()) @map("created_at")
    workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
    creditNote      Document  @relation("CreditAllocationCreditNote", fields: [creditNoteId], references: [id], onDelete: Cascade)
    invoice         Document  @relation("CreditAllocationInvoice", fields: [invoiceId], references: [id], onDelete: Cascade)
    createdBy       User?     @relation("CreditAllocationCreator", fields: [createdById], references: [id], onDelete: SetNull)
    removedBy       User?     @relation("CreditAllocationRemover", fields: [removedById], references: [id], onDelete: SetNull)

    @@index([workspaceId, invoiceId])
    @@index([workspaceId, creditNoteId])
    @@map("credit_allocations")
  }
  ```
  Additive migration only. Add `CreditAllocation` to `WORKSPACE_SCOPED_MODELS`
  (`lib/workspace-scope.ts`) in the same commit (Standards #1).
- **`lib/credits/allocation.ts`** (pure, `.test.ts` red-first):
  - `capAllocationAmount(input: { requestedAmount: number; invoiceDue: number; creditRemaining: number }): number`
    — `Math.min(requestedAmount, invoiceDue, creditRemaining)`, floored at 0.
  - `proposeAllocation(input: { creditNote: { citedInvoiceNumber: string | null; supplier: string | null; remaining: number }; candidates: Array<{ documentId: string; invoiceNumber: string | null; supplier: string | null; due: number }> }): { documentId: string; amount: number } | null`
    — exact normalized-invoice-number match (reuse `normalizeInvoiceNumber` from
    `lib/checks/duplicates.ts`) + same normalized supplier (reuse `normalizeSupplierName`), same
    supplier required; amount = `Math.min(remaining, due)`. Null when nothing matches exactly —
    never fuzzy (mirrors ADR 0015's item-pairing rule).
  - `refuseIfOpenLine(input: { hasOpenPaymentLine: boolean }): { ok: true } | { ok: false; reason: "open_payment_line" }`
    — the one guard both allocate and void share.
- **`models/credits.ts`** (I/O, thin over the pure functions):
  - `createCreditAllocation(input: { workspaceId; creditNoteId; invoiceId; amount; actorId }): Promise<{ ok: true; id: string } | { ok: false; reason }>` —
    loads both documents (same-supplier check via `Supplier.normalizedKey` or extracted vendor
    name), the invoice's open-line status (same `paymentRunItem` query shape as
    `lib/reclassify.ts:36`), the credit note's remaining (`total` − sum of its own live
    allocations), the invoice's due (`total` − records − existing allocations, via
    `derivePaidState`/`remainingDue`); caps via `capAllocationAmount`; refuses via
    `refuseIfOpenLine`; on success, `prisma.creditAllocation.create` + `recordDocumentAudit` (type
    `credit_allocation_created`) on **both** documents.
  - `voidCreditAllocation(input: { workspaceId; allocationId; actorId; reason: string }): Promise<{ ok: true } | { ok: false; reason }>` —
    Owner-only (`requireWorkspaceRole(workspaceId, actorId, ["owner"])` at the call site in the
    action layer, per Standards #5 — this model function trusts the role check already ran, same
    convention as `models/bills.ts`); refuses on the invoice's open line; sets `removedAt` +
    `removedReason`; audits.
  - `changeCreditAllocation` (post-approval amount edit): same Owner+reason+audit shape; only
    reachable once the credit note is approved (checked at the action layer against the
    document's `reviewedAt`/approval status, the same gate `describeMoveIneligibility` already
    reads).
  - `voidCreditNote(input: { workspaceId; documentId; actorId; reason }): Promise<{ ok: true } | { ok: false; reason }>` —
    Owner-only; loads live allocations on this credit note; refuses if **any** allocated invoice
    has an open Payment line; else voids (`removedAt`) every live allocation first (audited each),
    then marks the credit note itself cancelled (reuses the existing `cancelledAt`/`cancelledReason`
    columns on `Document`, same as #220's invoice cancel — no new column).
  - `getSupplierCreditAvailable(workspaceId, supplierKeys: string[]): Promise<Map<string, number>>` —
    per normalized supplier key, sum of `(credit note total) − (its live allocations)` across every
    live (not cancelled) credit note for that supplier. Feeds Step 3's Bill Pay Payee subtitle.
  - **Proposed allocation on approval** (Q9): `models/review-tasks.ts`'s approval-resolution path
    (where a task moves to `"approved"`) gets one more step when the resolved document's docType is
    `credit_note`: call `proposeAllocation` against the workspace's open invoices for the same
    supplier and, if it returns a match, `createCreditAllocation` automatically (actor = the
    approver). **Seam:** `models/review-tasks.ts` → `models/review-tasks.test.ts` (extend existing
    suite with the credit-note-approval branch).

## Step 3 — Paid state and amount due — `kind: backend`

Files: `lib/payments/paid-state.ts`, `models/bills.ts`, `models/bill-pay.ts`, `lib/payments/eligibility.ts`.

- `derivePaidState` gains `allocations: Array<{ amount: number }>` on `PaidStateInput` (default
  `[]` at call sites that predate credit notes — but every call site is internal, so just add the
  field and update both callers in the same commit: `models/bills.ts`, `lib/reclassify.ts`'s
  `describeMoveIneligibility`). New state `"credited"` on `PaidState`. Logic: sum `recordedCents`
  and `allocatedCents` separately; `coveredCents = recordedCents + allocatedCents` feeds the
  due/partial thresholds (so `remainingDue(total, paidAmount)` needs no change — `paidAmount`
  becomes `coveredCents/100`); the **label** branches on whether `recordedCents > 0`:
  - `coveredCents >= dueCents && recordedCents > 0` → `state: "paid", label: "Paid (recorded)"` (as
    today; a payment was part of the cover).
  - `coveredCents >= dueCents && recordedCents === 0 && allocatedCents > 0` → `state: "credited",
    label: "Credited"` (new — credit alone, never Paid, per Q7/ADR 0017).
  - `coveredCents > 0 && coveredCents < dueCents` → `state: "partially_paid"` (unchanged branch,
    now fed by the combined figure — a payment-plus-credit partial reads the same as a
    payment-only partial, matching Q7 "partly covered reads Partially paid").
  - Ledger-confirmed branches (`LEDGER_PAID`/`LEDGER_PARTIAL`) are untouched — the ledger's answer
    still wins outright, allocations are a DocuBite-side fact same tier as `records`.
  - Add `recordedAmount: number` and `allocatedAmount: number` to `DerivedPaidState` (both in
    whole units) so a later surface ticket (#465) can render the Q15 Amount due breakdown without
    re-deriving from raw records/allocations. Non-breaking additive fields.
  - **Seam:** `lib/payments/paid-state.ts` → `lib/payments/paid-state.test.ts` (extend existing —
    check file exists? verify at build time; if not, this is the first test for the module and
    must be written red-first per Standards #12).
- `models/bills.ts`: fetch live `CreditAllocation` rows for the batch of `documentIds` (both as
  invoice and, separately, sum per credit-note id for its own "remaining" if the row itself is a
  credit note — but a credit note's own BillRow doesn't need a paid state at all; skip
  `derivePaidState` for `docType === "credit_note"` rows, matching Q14 "no Dates, Aging or Payment
  details" — those rows just carry `total`/`docType`/status for the queue to facet on). For
  invoice rows, pass `allocations: allocationsByInvoice.get(doc.id) ?? []` into `derivePaidState`.
- `models/bill-pay.ts` / `lib/payments/eligibility.ts`: `isOnBillPay`/`batchEligibility` already
  key off `PaidState` — adding `"credited"` to the type means both must treat it as "not batchable,
  not on Bill Pay" the same as `"paid"` (a fully-credited invoice is done, same as a fully-paid
  one). One-line change: `isOnBillPay`'s `input.paidState !== "paid"` → `!== "paid" && !== "credited"`,
  and `TypeScript`'s exhaustiveness will catch any other switch over `PaidState` that needs the
  same update (grep for `"paid" | "partially_paid"` literal unions elsewhere — `models/bills.ts`'s
  `summarizePaidBills` filters `bill.paidState.state !== "paid"`, which stays correct as-is: a
  credited bill has no `paidAmount` that belongs in the "money that moved" summary, so it should
  **not** join Paid Summary — leave that filter alone deliberately, noted so a build session
  doesn't "fix" it).
  - **Supplier credit available per Payee**: `listBillPay`'s row assembly (`models/bill-pay.ts`)
    calls `getSupplierCreditAvailable` (Step 2) keyed by each row's supplier, adds
    `supplierCreditAvailable: number` to `BillPayBillRow` (0 when none) — data-only; the subtitle
    render is #465's job.
  - **Seam:** `models/bill-pay.ts` → extend `models/bill-pay.test.ts` if one exists, else a new
    focused test on `isOnBillPay`/`batchEligibility`'s `"credited"` branch (those are pure and
    already tested in `lib/payments/eligibility.test.ts`? verify at build time — check the file
    list above: `eligibility.ts` has no co-located `.test.ts` in the earlier `ls`; this ticket adds
    one, since Standards #11/#12 require pure logic to carry a test and this step touches it).

## Step 4 — Checks — `kind: backend`

Files: `lib/checks/duplicates.ts`, `models/document-checks.ts`, `lib/checks/negative-total.ts`
(new), `lib/health/checks/negative-total-invoices.ts` (new), `lib/health/registry.ts`,
`lib/health/types.ts`, `models/health.ts`.

- **`isCreditNote` from type, not sign** (`models/document-checks.ts` ~line 187): replace
  `const isCreditNote = totalValue !== null && totalValue < 0` with
  `const isCreditNote = docType === "credit_note"` (`docType` is already resolved at the top of
  `runDeterministicChecks`). This is the one-line fix the ticket names explicitly.
- **`lib/checks/duplicates.ts`**: `checkDuplicates`'s sibling query is already scoped to the same
  `templateId`, and Step 1 gives `credit_note` its own template code — so a credit note's
  "siblings" are only ever other credit notes, and an invoice's siblings only ever other invoices.
  This means **Duplicate credit note** (Q13) falls out of the existing `findNearDuplicate` call
  with no new function: same supplier + same credited-document number + same total, now scoped to
  the credit-note pool, produces the same `"duplicate"` warn. Two things still need a look:
  1. The `oppositeSign`/`creditPair` branch (lines 74–76) was written for the *old* world where a
     credit could share an invoice's template as a negative-signed row. Once new credit notes are
     typed and positive, that branch only still matters for **legacy** negative-total invoices
     (Q19 — never converted, so they remain in the invoice pool indefinitely). Leave the branch in
     place but re-comment it as the legacy-only safety net it now is (comment update, not logic
     change) — removing it would risk a false "duplicate" warn on an old negative invoice against
     its positive parent, which nothing in this ticket is asking to fix.
  2. No code change needed beyond the `isCreditNote` source fix above; `DocumentIdentity.isCreditNote`
     is still read the same way inside `duplicates.ts`.
- **Credit larger than invoice** (Q13 "warn"): this is naturally enforced by `capAllocationAmount`
  (Step 2) refusing to let the *allocation* exceed the invoice's due — but the ticket also wants a
  standing **warn** the reviewer sees before allocating, when the credit note's own total exceeds
  the invoice it cites. Add to `runDeterministicChecks`: when `docType === "credit_note"` and the
  extracted `credited_invoice_number` resolves to an open invoice (same supplier), compare the
  credit's `total` to that invoice's due; if greater, push
  `{ checkCode: "credit_exceeds_invoice", status: "warn", message: "This credit (‹total›) is larger than ‹Invoice #› (‹due› due)." }`.
  New pure comparator in `lib/checks/negative-total.ts` (co-located with the sibling check below,
  since both are credit-note-shape checks) — `checkCreditExceedsInvoice(input): CheckResult | null`.
- **No invoice from this supplier** (Q13 "warn"): when `credited_invoice_number` is present but no
  open invoice of the same supplier matches it — `checkCreditNoInvoiceMatch(input): CheckResult | null`
  → `{ checkCode: "credit_no_matching_invoice", status: "warn", message: "No open invoice ‹number› from ‹supplier› — this credit stays as supplier credit." }`.
- **Invoice with a negative total** (Q13 "fail", offering Move): `checkNegativeTotal(input: { docType: DocType; total: number | null }): CheckResult | null`
  in `lib/checks/negative-total.ts` — fires only when `docType === "invoice" && total !== null && total < 0`,
  `status: "fail"`, `message: "This invoice has a negative total — move it to a credit note."`,
  `detail: { suggestedAction: "move_to_credit_note" }` (the Detail pane's Move action, already
  built in Step 1, reads this the same way other fail-checks surface a suggested fix — that
  wiring is a later surface ticket's job; this ticket only needs the check to fire and carry the
  hint). Add `"invoice_negative_total"` to `FAIL_BY_DEFAULT` in `models/document-checks.ts`.
- **Existing negative-total invoices reported, not converted** (Q19): new health check
  `lib/health/checks/negative-total-invoices.ts`, `code: "negative_total_invoices"`, modelled on
  `missing-tax.ts` — filters `ctx.documents` for `docType/templateCode === "invoice" &&
  extractedTotal !== null && extractedTotal < 0`, one finding per document, severity `"warning"`,
  never auto-fixed. Needs `CheckDocumentSlice` (`lib/health/types.ts`) to carry
  `extractedTotal?: number | null` (mirrors the existing `extractedTaxTotal?` field exactly) —
  sourced in `models/health.ts`'s document-loading query the same way `extractedTaxTotal` is.
  Register in `lib/health/registry.ts`'s `REGISTRY` array. **Seam:** each new pure comparator
  (`checkNegativeTotal`, `checkCreditExceedsInvoice`, `checkCreditNoInvoiceMatch`) gets a
  co-located `.test.ts`; the health check gets a test the way `missing-tax.test.ts` (if one
  exists) or the registry's own suite does — verify the existing pattern at build time.

## Step 5 — Approval — `kind: backend`

Files: `lib/approvals/engine.ts`, `models/review-tasks.ts`, `models/approval-workflows.ts`.

- `lib/approvals/engine.ts` itself needs **no shape change** — it is already generic over
  "a thing with stages, decided by role/approver" and carries no doc-type awareness; #452's future
  Conditions (not yet built — #467) are what will actually match on Type. This ticket's job is
  narrower: make sure nothing upstream of the engine *excludes* `credit_note` from getting an
  Approval at all. Audit: `models/review-tasks.ts`'s `createReviewTask`/`resolveAutoStartWorkflowId`
  path and `models/approval-workflows.ts`'s "Start Approval" gating
  (`models/approval-workflows.ts:112`'s comment references "an invoice") — confirm at build time
  that both key off `isDocumentInApprovableState`-style generic document facts, not a hard-coded
  `docType === "invoice"` string (grep for literal `"invoice"` comparisons in both files); if either
  does hard-code it, widen to `docType === "invoice" || docType === "credit_note"`.
  `isPaymentConfirmationRequired` already excludes credit notes (Step 1), so
  `assertPaymentConfirmed` (`models/review-tasks.ts:31`) never blocks a credit note's approval on
  the paid/unpaid click.
  - **Touchless** (Q10 "Credit notes can go touchless under the same rules"): confirm the touchless
    threshold path (`models/automation-config.ts` / wherever confidence gating lives) is also
    generic over docType — no credit-note-specific exclusion to add unless one is found hard-coded.
  - **Confirmed by approval** (Q9): wired in Step 2's `models/review-tasks.ts` extension (the
    propose-then-create-on-approve step) — this step just needs the review-task resolution path
    confirmed as the right hook (it is: `decideStage`'s `{ outcome: "approved" }` branch is where
    a task's status flips to `"approved"`).

## Step 6 — Build gate

- `npm test` (full suite) green.
- `tsc --noEmit` clean.
- `/code-review` (Standards + Spec) at close, report line `review: P0=0 P1=0`.

## Coverage / seam summary (Standards #12)

| Step | New/changed pure logic | Test file |
|---|---|---|
| 1 | sign-normalization helper | `lib/credits/sign.test.ts` (or co-located with doc-types) |
| 1 | `listWorkspaceBills` credit-note row | `models/bills.test.ts` |
| 2 | `capAllocationAmount`, `proposeAllocation`, `refuseIfOpenLine` | `lib/credits/allocation.test.ts` |
| 2 | `createCreditAllocation`/`voidCreditAllocation`/`voidCreditNote` | `models/credits.test.ts` |
| 3 | `derivePaidState` "credited" branch | `lib/payments/paid-state.test.ts` |
| 3 | `isOnBillPay`/`batchEligibility` "credited" | `lib/payments/eligibility.test.ts` |
| 4 | `checkNegativeTotal`, `checkCreditExceedsInvoice`, `checkCreditNoInvoiceMatch` | `lib/checks/negative-total.test.ts` |
| 4 | negative-total-invoices health check | `lib/health/checks/negative-total-invoices.test.ts` |
| 5 | approval gating audit (no new pure fn expected) | extends `models/review-tasks.test.ts` if a literal hard-code is found |

## Plan gate

Posted as an issue comment on #463 before any code (map Notes' "Plan gate"); autopilot's standing
delegation takes it as approved and proceeds — this is the plan that comment links to.
