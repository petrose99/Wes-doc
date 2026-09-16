"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { formatMoney, TitleCell } from "@/components/queue/row-cells"
import { ReasonDialog } from "@/components/list-screen/reason-dialog-button"
import type { Facet } from "@/components/queue/facet-filters"
import { QueueSegments } from "@/components/queue/queue-segments"
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
      band={<div className="px-4 pt-3"><QueueSegments segments={[
        { key: "invoices", label: "Invoice approvals", count: invoiceCount, href: basePath.replace(/\/po-mismatches$/, "/invoices") },
        { key: "po-mismatches", label: "PO mismatches", count: rows.length, href: basePath },
      ]} active="po-mismatches" /></div>}
      cards={{ below: "lg", render: (row, { open }) => <MismatchCard row={row} onOpen={open} /> }}
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
    <ReasonDialog open={overriding !== null} placement="sheet" onClose={() => setOverriding(null)}
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
      title="Approve over the PO mismatch"
      description={overriding ? `This invoice is ${formatMoney(overriding.variance, overriding.currencyCode)} (${variancePercent(overriding).toFixed(1)}%) over the PO, past the ${Math.round(overriding.percent * 100)}% allowance. Approving overrides the match check and is recorded with your reason. The invoice then continues through its approval flow.` : ""}
      submitLabel="Approve"
      placeholder="Why is this variance acceptable?" />

    <ReasonDialog open={rejecting !== null} placement="sheet" onClose={() => setRejecting(null)}
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

/** #257 spec 3.3: the phone/tablet card row for PO mismatches. */
function MismatchCard({ row, onOpen }: { row: PoMismatchRow; onOpen: () => void }) {
  const notEligible = row.eligibility.status !== "ready"
  return <a href={`#${row.documentId}`} onClick={(event) => { event.preventDefault(); onOpen() }}
    className="flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-inset">
    <ProcessingStateGlyph state={processingState({ approvalStatus: "in_progress", blockedByCheck: notEligible, escalated: false, touchless: false, status: "needs_review" })} />
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[15px] font-semibold text-slate-900">{row.supplier ?? "Unknown supplier"}</span>
        <span className="shrink-0 tabular-nums text-[15px] font-semibold text-slate-900">{formatMoney(row.variance, row.currencyCode)}</span>
      </span>
      <span className="mt-0.5 block text-[13px] text-slate-600">{row.poNumber ?? "No PO #"} · Variance {formatMoney(row.variance, row.currencyCode)} ({variancePercent(row).toFixed(1)}%)</span>
      <span className="mt-0.5 block text-[13px]">
        {notEligible
          ? <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-900">{eligibilityText(row)}</span>
          : <span className="text-slate-700">{stageLabel(row.stage)}</span>}
      </span>
    </span>
  </a>
}
