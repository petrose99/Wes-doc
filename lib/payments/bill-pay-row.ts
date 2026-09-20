import type { BillPayRow } from "@/models/bill-pay"
import type { PayerAccountRow } from "@/models/payer-accounts"

/** #347: one place per fact so every column/sort/facet/dialog reads a claim row the same way a
 * bill row is read — never a per-file re-derivation of "what is this row's payee/amount/etc."
 * Client-safe (type-only imports of `BillPayRow`/`PayerAccountRow`, no `prisma`) — `models/bill-pay.ts`
 * pulls in `@/lib/db` and `next/headers` (via `@/lib/audit`) transitively, so a *value* import of
 * these from there breaks the client bundle for `bill-pay-queue.tsx`/`create-batch-dialog.tsx`. */
export function rowId(row: BillPayRow): string { return row.kind === "bill" ? row.bill.documentId : row.claim.id }
export function rowPayeeName(row: BillPayRow): string | null { return row.kind === "bill" ? row.bill.supplier : (row.submitter?.name || row.submitter?.email || null) }
export function rowDue(row: BillPayRow): Date | null { return row.kind === "bill" ? row.bill.dueDate : row.claim.resolvedAt }
export function rowAmount(row: BillPayRow): number | null { return row.kind === "bill" ? row.amountToPay : row.claim.total }
export function rowScheduled(row: BillPayRow): boolean { return row.kind === "bill" ? row.bill.paidState.state === "scheduled" : row.paidState === "scheduled" }
export function rowCurrency(row: BillPayRow): string | null { return row.kind === "bill" ? row.bill.currencyCode : row.claim.currencyCode }
/** A claim has no per-row Pay From override (no `BillPayPreference` for an `ExpenseClaim`, #331)
 * — every claim batches from the workspace's default payer account. */
export function rowPayFrom(row: BillPayRow, defaultPayerAccount: PayerAccountRow | null): PayerAccountRow | null { return row.kind === "bill" ? row.payFrom : defaultPayerAccount }
