"use client"

import { pushDocumentToAccountingAction } from "@/app/(app)/workspaces/[workspaceId]/integration-push-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

const PROVIDER_LABELS: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero", bigcapital: "Accounting" }

export type PushableConnection = {
  id: string
  provider: string
  tenantName: string | null
  status: string
  defaultExpenseAccountId: string | null
}

export type DocumentPush = {
  id: string
  connectionId: string
  status: string
  attempts: number
  externalBillId: string | null
  externalRecordKind: string | null
  errorCode: string | null
}

export type PaymentStatusInfo = {
  paymentStatus: string | null
  dueAmount: number | null
  paidAmount: number | null
  syncedAt: string
}

const ERROR_CODE_LABELS: Record<string, string> = {
  ledger_duplicate: "already in your ledger",
}

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  unpaid: "border-red-200 bg-red-50 text-red-700",
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  partial: "Partially paid",
  unpaid: "Unpaid",
}

function StatusLabel({ push }: { push: DocumentPush | undefined }) {
  if (!push) return null
  if (push.status === "succeeded") {
    const label = push.externalRecordKind === "cashflow_batch" ? "Transactions pushed" : push.externalBillId ? `Pushed — ${push.externalBillId}` : "Pushed"
    return <span className="text-xs text-emerald-700">{label}</span>
  }
  if (push.status === "failed") return <span className="text-xs text-red-600">Failed{push.errorCode ? ` (${ERROR_CODE_LABELS[push.errorCode] ?? push.errorCode.replaceAll("_", " ")})` : ""}</span>
  return <span className="text-xs text-indigo-700">Pending</span>
}

function PaymentChip({ status }: { status: string }) {
  const style = PAYMENT_STATUS_STYLES[status] ?? "border-slate-200 bg-slate-50 text-slate-600"
  const label = PAYMENT_STATUS_LABELS[status] ?? status
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}>{label}</span>
}

export function PushToAccountingCard({ workspaceId, documentId, connections, pushes, paymentStatus }: {
  workspaceId: string
  documentId: string
  connections: PushableConnection[]
  pushes: DocumentPush[]
  paymentStatus?: PaymentStatusInfo | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const pushable = connections.filter((c) => c.status === "active" && c.defaultExpenseAccountId)
  if (!pushable.length) return null

  const pushByConnection = new Map(pushes.map((p) => [p.connectionId, p]))

  const push = (connectionId: string) => startTransition(async () => {
    const res = await pushDocumentToAccountingAction(workspaceId, documentId, connectionId)
    if (res.success) {
      toast.success(res.data?.status === "succeeded" ? "Pushed to accounting" : "Push queued")
      router.refresh()
    } else {
      toast.error(res.error || "Could not push this document")
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Push to accounting</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {pushable.map((connection) => {
            const existing = pushByConnection.get(connection.id)
            const label = PROVIDER_LABELS[connection.provider] ?? connection.provider
            const showDeepLink = existing?.status === "succeeded" && existing.externalBillId && connection.provider === "bigcapital"
            const deepLinkPath = existing?.externalRecordKind === "sale_invoice"
              ? `/sale-invoices/${existing.externalBillId}`
              : `/bills/${existing?.externalBillId}`
            return (
              <span key={connection.id} className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => push(connection.id)}>
                  {existing?.status === "failed" ? `Retry ${label}` : `Push to ${label}`}
                </Button>
                <StatusLabel push={existing} />
                {paymentStatus?.paymentStatus && <PaymentChip status={paymentStatus.paymentStatus} />}
                {showDeepLink && (
                  <a
                    href={`/api/accounting/session?workspaceId=${workspaceId}&redirectPath=${deepLinkPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    View in accounting <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </span>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
