import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { requireWorkspaceRole } from "@/models/workspaces"
import { listPaymentBatches } from "@/models/payment-batches"
import { earlyPaymentSavings } from "@/models/bill-pay"
import type { BatchView } from "@/lib/payments/batch-status"
import { PaymentBatchQueue } from "@/components/payments/batch-queue"
import { QueueStat } from "@/components/queue/queue-stat"
import { formatPaymentMoney } from "@/components/payments/format"

export const dynamic = "force-dynamic"

export type BatchSearchParams = { view?: string; sort?: string }

/** #229 Q11 (#251): Payment Batches on the Queue screen. *Early Payment Savings* is the one
 * inline figure and only exists once a supplier offers a discount (#229 Q8: no empty KPI). */
export async function PaymentBatchesQueuePage({ params, searchParams, selectedBatchId = null }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<BatchSearchParams>
  selectedBatchId?: string | null
}) {
  const { workspaceId } = await params
  const { view } = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const viewFilter: BatchView | undefined = view === "pending_approval" || view === "approved" || view === "paid" || view === "rejected" ? view : undefined
  const [rows, workspace, savings] = await Promise.all([
    listPaymentBatches({ workspaceId, view: viewFilter }),
    prisma.workspace.findFirst({ where: { id: workspaceId }, select: { baseCurrency: true } }),
    earlyPaymentSavings(workspaceId),
  ])
  const currency = workspace?.baseCurrency ?? "ZAR"
  // #229 Q8: never an empty KPI. Captured savings lead; before any is captured the open discount
  // on Bill Pay is the figure; with neither, the stat says so rather than showing a zero.
  const detail = `${savings.capturedCount} discount${savings.capturedCount === 1 ? "" : "s"} taken in approved or paid batches · ${formatPaymentMoney(savings.available, currency, currency)} still open on ${savings.availableCount} Bill Pay row${savings.availableCount === 1 ? "" : "s"}`
  const stat = !savings.anySupplierHasDiscount ? undefined
    : savings.captured > 0 ? <QueueStat label="Early payment savings" value={formatPaymentMoney(savings.captured, currency, currency)} detail={detail} />
    : savings.available > 0 ? <QueueStat label="Discount open on Bill Pay" value={formatPaymentMoney(savings.available, currency, currency)} detail={detail} />
    : <QueueStat label="Early payment savings" value="" detail={detail} unavailable="No discount taken yet, and none open on Bill Pay today." />

  return <PaymentBatchQueue
    workspaceId={workspaceId}
    basePath={`/workspaces/${workspaceId}/payments/batches`}
    rows={rows}
    fallbackCurrency={currency}
    isOwner={membership.role === "owner"}
    currentUserId={user.id}
    stat={stat}
    initialSelectedId={selectedBatchId} />
}

export default function PaymentBatchesPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<BatchSearchParams> }) {
  return PaymentBatchesQueuePage({ params, searchParams })
}
