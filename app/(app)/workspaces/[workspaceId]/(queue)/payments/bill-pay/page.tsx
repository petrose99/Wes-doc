import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { requireWorkspaceRole } from "@/models/workspaces"
import { listBillPay, type BillPayFacet } from "@/models/bill-pay"
import { suggestBatchName } from "@/lib/payments/batch-split"
import type { AgingBucket } from "@/lib/bills/due-date"
import { BillPayQueue } from "@/components/payments/bill-pay-queue"

export const dynamic = "force-dynamic"

export type BillPaySearchParams = { status?: string; discount?: string; aging?: string; sort?: string }

/** #229 / #251: Bill Pay on the Queue screen — Approved, unpaid invoices ready to batch. Filters
 * are plain URL params; the aging band's buckets write the same `aging` param the chip reads. */
export async function BillPayQueuePage({ params, searchParams, selectedDocumentId = null }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<BillPaySearchParams>
  selectedDocumentId?: string | null
}) {
  const { workspaceId } = await params
  const { status, discount, aging } = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const facet: BillPayFacet | undefined = status === "ready" || status === "scheduled" || status === "needs_bank_details" ? status : discount === "1" ? "discount" : undefined
  const agingFilter = new Set((aging ?? "").split(",").filter((value): value is AgingBucket | "none" => ["current", "1-30", "31-60", "61-90", "90+", "none"].includes(value)))
  const now = new Date()
  const [result, workspace, recentBatches] = await Promise.all([
    listBillPay({ workspaceId, asOf: now, facet }),
    prisma.workspace.findFirst({ where: { id: workspaceId }, select: { baseCurrency: true } }),
    prisma.paymentRun.findMany({ where: { workspaceId, createdAt: { gte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) } }, select: { name: true } }),
  ])
  let rows = result.rows
  if (discount === "1" && facet !== "discount") rows = rows.filter((row) => row.discount !== null)
  if (agingFilter.size > 0) rows = rows.filter((row) => agingFilter.has(row.bill.agingBucket ?? "none"))

  return <BillPayQueue
    workspaceId={workspaceId}
    basePath={`/workspaces/${workspaceId}/payments/bill-pay`}
    rows={rows}
    summary={result.summary}
    payerAccounts={result.payerAccounts}
    fallbackCurrency={workspace?.baseCurrency ?? "ZAR"}
    suggestedBatchName={suggestBatchName(now, recentBatches.map((b) => b.name).filter((n): n is string => !!n))}
    isOwner={membership.role === "owner"}
    initialSelectedId={selectedDocumentId} />
}

export default function BillPayPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<BillPaySearchParams> }) {
  return BillPayQueuePage({ params, searchParams })
}
