## Plan gate (owner) — before any code

Backend-only ticket (`kind: backend` throughout); no Intent/Impeccable pass owed. Full spec at
`docs/wayfinder-reports/445/463-spec.md`. Six build steps, matching the ticket's own numbering:

1. **Type and classification** — `credit_note` added to `DOC_TYPES`/`DOC_TYPE_SPECS`
   (`lib/doc-types.ts`); classification prompt updated (`lib/classification.ts` needs no schema
   change, just a prompt line); sign normalized to positive at merge time and on Move both ways
   (`lib/document-processing.ts`, `app/(app)/workspaces/[workspaceId]/actions.ts`); `models/bills.ts`'s
   Invoices query widened from `template.code === "invoice"` to `in: ["invoice", "credit_note"]`.
2. **Credit allocation model** — new `CreditAllocation` Prisma model (additive migration,
   `lib/workspace-scope.ts` registration), new `lib/credits/allocation.ts` (pure: cap, propose,
   open-line guard) + `models/credits.ts` (create/void/change, Owner+reason+audit after approval,
   supplier-credit-available reader).
3. **Paid state and amount due** — `derivePaidState` (`lib/payments/paid-state.ts`) gains
   `allocations` input and a new `"credited"` state/label, distinct from Paid (money moved) vs
   Credited (credit alone); `models/bills.ts`, `models/bill-pay.ts`, `lib/payments/eligibility.ts`
   read it through unchanged `remainingDue`/`isOnBillPay`/`batchEligibility` plumbing.
4. **Checks** — `isCreditNote` switched from sign-based inference to `docType === "credit_note"`
   (`models/document-checks.ts`); new `lib/checks/negative-total.ts` (negative-total fail offering
   Move, credit-exceeds-invoice warn, no-matching-invoice warn); new health check
   `negative_total_invoices` reporting (never converting) existing negative invoices.
5. **Approval** — audit that nothing upstream of `lib/approvals/engine.ts` hard-codes
   `docType === "invoice"`; widen if found. `isPaymentConfirmationRequired` already excludes
   credit notes (step 1), so the paid/unpaid gate never blocks their approval. Approving a credit
   note triggers the Step 2 propose-then-allocate.
6. **Build gate** — `npm test`, `tsc --noEmit`, `/code-review` (P0=P1=0) at close.

No ADR beyond 0017 (the module boundary decision is already made there); `codebase-design`
thinking applied directly to the `lib/credits/` / `models/credits.ts` split in the spec doc.

Schema change: one additive migration (`credit_allocations` table). No destructive migrations.

Taking the recommended plan as approved per autopilot's standing delegation; proceeding to build
sessions.
