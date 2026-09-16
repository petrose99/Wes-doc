"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { formatMoney, TitleCell } from "@/components/queue/row-cells"
import { ReasonDialog } from "@/components/list-screen/reason-dialog-button"
import type { Facet } from "@/components/queue/facet-filters"
import { ApprovalsQueuePicker } from "@/components/typed-destinations/approvals-queue-picker"
import { ProcessingStateGlyph } from "@/components/typed-destinations/row-signals"
import { processingState } from "@/lib/documents/processing-state"
import { useOnlineStatus } from "@/lib/client/use-online-status"
import { overrideGateAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { decideReviewTaskStageAction } from "@/app/(app)/workspaces/[workspaceId]/review-actions"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import type { PoMismatchRow } from "@/models/approvals"

export const PO_MISMATCH_FACETS: Facet[] = [
  { param: "status", label: "Status", options: [{ value: "not_eligible", label: "Not eligible" }], allLabel: "Ready to approve" },
  { param: "approver", label: "Approver", options: [{ value: "anyone", label: "Anyone" }], allLabel: "Me" },
]

const SORTS: SortOption<PoMismatchRow>[] = [
  { key: "variance", label: "Variance, high to low", compare: (a, b) => b.variance - a.variance },
  { key: "waiting", label: "Waiting longest", compare: (a, b) => a.waitingSince.getTime() - b.waitingSince.getTime() },
]

function stageLabel(stage: PoMismatchRow["stage"]): string {
  return `${stage.index + 1} of ${stage.total} · ${stage.name}`
}

function eligibilityText(row: PoMismatchRow): string {
  if (row.eligibility.status === "no_approver") return "Needs attention · no approver"
  if (row.eligibility.status === "not_eligible") return `Not eligible — ${row.eligibility.reason}`
  return ""
}

function variancePercent(row: PoMismatchRow): number {
  return row.poTotal !== 0 ? Math.abs(row.variance / row.poTotal) * 100 : 0
}

/** #236 decisions #3/#4: Approvals › PO Mismatches — one row per invoice with an open
 * `match-variance` Gate, appearing automatically once the gate fires on an invoice with a
 * decidable stage. Approve overrides the gate (`overrideGateAction`, the same override primitive
 * Override Mode already uses from the Checks tab — decision #3 asks for the primitive, not a
 * second mechanism); Reject ends the invoice's Approval, same action as the Invoices queue's own
 * Reject. */
export function PoMismatchQueue({ workspaceId, basePath, rows, invoiceCount, initialSelectedId }: {
  workspaceId: string
  basePath: string
  rows: PoMismatchRow[]
  invoiceCount: number
  initialSelectedId?: string | null
}) {
  const router = useRouter()
  const online = useOnlineStatus()
  const [pending, setPending] = useState<{ gateId: string; action: "approve" | "reject" } | null>(null)
  const [overriding, setOverriding] = useState<PoMismatchRow | null>(null)
  const [rejecting, setRejecting] = useState<PoMismatchRow | null>(null)
  const [error, setError] = useState<{ gateId: string; message: string } | null>(null)

  const columns: QueueColumn<PoMismatchRow>[] = [
    { key: "supplier", label: "Supplier", narrow: true, className: "min-w-[12rem]", render: (row) => <TitleCell title={row.supplier} missingLabel="Unknown supplier" subtitle={row.eligibility.status !== "ready" ? eligibilityText(row) : null} /> },
    { key: "number", label: "Invoice #", className: "whitespace-nowrap text-slate-700", render: (row) => <>{row.invoiceNumber ?? "—"}</> },
    { key: "po", label: "PO #", className: "whitespace-nowrap text-slate-700", render: (row) => <>{row.poNumber ?? "—"}</> },
    {
      key: "variance", label: "Variance", className: "whitespace-nowrap text-right tabular-nums text-slate-900",
      render: (row) => <span title={`Tolerance: ${formatMoney(row.threshold, row.currencyCode)} (${Math.round(row.percent * 100)}% or ${formatMoney(row.floorAmount, row.currencyCode)}, whichever is greater)`}>
        {formatMoney(row.variance, row.currencyCode)} ({variancePercent(row).toFixed(1)}%)
      </span>,
    },
    { key: "stage", label: "Stage", className: "whitespace-nowrap text-slate-700", render: (row) => <>{stageLabel(row.stage)}</> },
  ]

  return <>
    <QueueScreen<PoMismatchRow>
      title="PO Mismatches"
      basePath={basePath}
      rows={rows}
      rowId={(row) => row.documentId}
      rowName={(row) => ({ title: row.supplier ?? "Unknown supplier", suffix: [row.invoiceNumber, `${formatMoney(row.variance, row.currencyCode)} variance`].filter(Boolean).join(" · ") || null })}
      leading={(row) => <ProcessingStateGlyph state={processingState({ approvalStatus: "in_progress", blockedByCheck: row.eligibility.status !== "ready", escalated: false, touchless: false, status: "needs_review" })} />}
      columns={columns}
      sortOptions={SORTS}
      facets={PO_MISMATCH_FACETS}
      views={<ApprovalsQueuePicker workspaceId={workspaceId} active="po-mismatches" invoiceCount={invoiceCount} poMismatchCount={rows.length} />}
      initialSelectedId={initialSelectedId}
      empty={{
        title: "No PO mismatches right now.",
        body: "A row appears here automatically once a 2/3-way match variance gate fires on an invoice that already has an Approval in flight — there's no separate Start action.",
        filteredTitle: "Nothing matches these filters.",
        filteredBody: "Try Approver · Anyone to see mismatches pending on other approvers.",
      }}
      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId, { initialTab: "checks" })}
      paneActions={(row) => {
        const rowError = error?.gateId === row.gateId ? error.message : null
        const isPending = pending?.gateId === row.gateId
        const rejectDisabled = !online || !row.canDecide || pending !== null
        const approveDisabled = rejectDisabled || row.eligibility.status !== "ready"
        const disabledReason = !online ? "You're offline — reconnect to decide this Approval." : !row.canDecide ? "Only this stage's approver can decide it." : row.eligibility.status !== "ready" ? eligibilityText(row) : null
        return <>
          {rowError && <p role="alert" className="w-full text-xs text-red-700 sm:mr-auto sm:w-auto">{rowError}</p>}
          {!rowError && disabledReason && <span className="w-full text-xs text-slate-600 sm:mr-auto sm:w-auto">{disabledReason}</span>}
          {isPending && <span className="w-full text-xs text-slate-600 sm:mr-auto sm:w-auto" aria-live="polite">{pending?.action === "approve" ? "Approving…" : "Rejecting…"}</span>}
          <Button type="button" size="sm" variant="outline" disabled={rejectDisabled} onClick={() => setRejecting(row)}>Reject</Button>
          <Button type="button" size="sm" disabled={approveDisabled} onClick={() => setOverriding(row)}>Approve</Button>
        </>
      }} />

    {/* Decision #3/#11: Approving a PO Mismatch is an override — it always needs a reason. */}
    <ReasonDialog open={overriding !== null} onClose={() => setOverriding(null)}
      action={async (formData) => {
        if (!overriding) return { success: false, error: "No mismatch selected" }
        setError(null)
        setPending({ gateId: overriding.gateId, action: "approve" })
        try {
          const result = await overrideGateAction(workspaceId, overriding.gateId, formData)
          if (result.success) { toast.success("Approved — the match-variance gate was overridden"); router.refresh() }
          else { setError({ gateId: overriding.gateId, message: result.error || "Could not override this gate" }); router.refresh() }
          return result
        } finally {
          setPending(null)
        }
      }}
      title="Approve this PO mismatch"
      description="Overrides the 2/3-way match-variance check with a reason. It's recorded on the audit trail and clears the gate — the invoice's Approval itself is unaffected."
      submitLabel="Approve"
      placeholder="Why is this variance acceptable?" />

    <ReasonDialog open={rejecting !== null} onClose={() => setRejecting(null)}
      action={async (formData) => {
        if (!rejecting) return { success: false, error: "No mismatch selected" }
        const reason = String(formData.get("reason") || "").trim()
        setError(null)
        setPending({ gateId: rejecting.gateId, action: "reject" })
        try {
          const result = await decideReviewTaskStageAction(workspaceId, rejecting.taskId, "reject", reason)
          if (result.success) { toast.success("Rejected"); router.refresh() }
          else { setError({ gateId: rejecting.gateId, message: result.error || "Could not reject this Approval" }); router.refresh() }
          return result
        } finally {
          setPending(null)
        }
      }}
      title="Reject this Approval"
      description="Ends the invoice's Approval run entirely, not just this mismatch. The reason is recorded on the audit trail."
      submitLabel="Reject"
      placeholder="Why is this being rejected?" />
  </>
}
