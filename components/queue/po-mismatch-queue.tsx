"use client"

import type { QueueArrival } from "@/lib/navigation/origin-server"
import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
import { usePhoneLane } from "@/lib/client/use-phone-lane"
import { countWaitingOnOthers, filterPoMismatchRows } from "@/lib/approvals/filters"
import { DecisionResultStrip, NETWORK_ERROR, OFFLINE_REASON, type Decided } from "@/components/queue/decision-result"
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
  { key: "waiting", label: "Waiting longest first", compare: (a, b) => a.waitingSince.getTime() - b.waitingSince.getTime() },
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
export function PoMismatchQueue({ workspaceId, basePath, rows, invoiceCount, initialSelectedId, workspaceDocumentCount, arrival }: {
  workspaceId: string
  basePath: string
  /** Every row the actor may see — facets apply client-side (`filterPoMismatchRows`). */
  rows: PoMismatchRow[]
  /** Invoice approvals through the same facets, for the segment count. */
  invoiceCount: number
  initialSelectedId?: string | null
  /** #264 spec §2: passed through to `QueueScreen` (the state function needs it for every queue). */
  workspaceDocumentCount: number
  /** #268: the Origin strip's model + the missing-row notice, from `queueArrival` on the server. */
  arrival?: QueueArrival
}) {
  const router = useRouter()
  const online = useOnlineStatus()
  const phone = usePhoneLane()
  const [pending, setPending] = useState<{ gateId: string; action: "approve" | "reject" } | null>(null)
  // #257 spec 3.5 "After a decision": the decided row stays open with a result strip.
  const [decided, setDecided] = useState<Decided<PoMismatchRow> | null>(null)
  const [overriding, setOverriding] = useState<PoMismatchRow | null>(null)
  const [rejecting, setRejecting] = useState<PoMismatchRow | null>(null)
  const [error, setError] = useState<{ gateId: string; message: string } | null>(null)

  // One exit map for both sheets (spec 3.6): success/refused → result strip and re-read; a
  // network throw keeps the sheet open with the typed reason and puts the error in the bar.
  const settle = (row: PoMismatchRow, action: "approve" | "reject", run: () => Promise<{ success: boolean; error?: string }>) => async () => {
    setError(null)
    setPending({ gateId: row.gateId, action })
    try {
      const result = await run()
      if (result.success) {
        setDecided({ row, outcome: action === "approve" ? "approved" : "rejected" })
        if (!phone) toast.success(action === "approve" ? "Approved — the match-variance gate was overridden" : "Rejected")
      } else {
        setDecided({ row, outcome: "refused", message: result.error || "This stage is no longer yours to decide." })
      }
      router.refresh()
      return { success: true }
    } catch {
      setError({ gateId: row.gateId, message: NETWORK_ERROR })
      return { success: false, error: NETWORK_ERROR }
    } finally {
      setPending(null)
    }
  }
  const waitingOnOthers = countWaitingOnOthers(rows)
  const searchParams = useSearchParams()
  const ownCount = filterPoMismatchRows(rows, searchParams).length

  const columns: QueueColumn<PoMismatchRow>[] = [
    // #261: the columns feed the shared card's slots with the text #257's bespoke card carried.
    { key: "supplier", label: "Supplier", narrow: true, className: "min-w-[12rem]", phone: "title", phoneRender: (row) => row.supplier ?? "Unknown supplier",
      render: (row) => <TitleCell title={row.supplier} missingLabel="Unknown supplier" subtitle={row.eligibility.status !== "ready" ? eligibilityText(row) : null} /> },
    { key: "number", label: "Invoice #", className: "whitespace-nowrap text-slate-700", render: (row) => <>{row.invoiceNumber ?? "—"}</> },
    { key: "po", label: "PO #", className: "whitespace-nowrap text-slate-700", phone: "subtitle",
      phoneRender: (row) => <>{row.poNumber ?? "No PO #"} · Variance {formatMoney(row.variance, row.currencyCode)} ({variancePercent(row).toFixed(1)}%)</>,
      render: (row) => <>{row.poNumber ?? "—"}</> },
    {
      key: "variance", label: "Variance", className: "whitespace-nowrap text-right tabular-nums text-slate-900", phone: "trailing",
      phoneRender: (row) => formatMoney(row.variance, row.currencyCode),
      render: (row) => <span title={`Tolerance: ${formatMoney(row.threshold, row.currencyCode)} (${Math.round(row.percent * 100)}% or ${formatMoney(row.floorAmount, row.currencyCode)}, whichever is greater)`}>
        {formatMoney(row.variance, row.currencyCode)} ({variancePercent(row).toFixed(1)}%)
      </span>,
    },
    { key: "stage", label: "Stage", className: "whitespace-nowrap text-slate-700", phone: "pill",
      phoneRender: (row) => row.eligibility.status !== "ready" ? <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] font-medium leading-4 text-amber-900">{eligibilityText(row)}</span> : <span className="text-[13px] text-slate-700">{stageLabel(row.stage)}</span>,
      render: (row) => <>{stageLabel(row.stage)}</> },
  ]

  return <>
    <QueueScreen<PoMismatchRow>
    origin={arrival?.origin ?? null}
    initialMissing={arrival?.initialMissing}
      title="PO Mismatches"
      basePath={basePath}
      rows={rows}
      filterRows={filterPoMismatchRows}
      pinned={decided?.row ?? null}
      onOpenChange={(id) => { if (id !== decided?.row.documentId) setDecided(null) }}
            rowId={(row) => row.documentId}
      rowName={(row) => ({ title: row.supplier ?? "Unknown supplier", suffix: [row.invoiceNumber, `${formatMoney(row.variance, row.currencyCode)} variance`].filter(Boolean).join(" · ") || null })}
      leading={(row) => <ProcessingStateGlyph state={processingState({ approvalStatus: "in_progress", blockedByCheck: row.eligibility.status !== "ready", escalated: false, touchless: false, status: "needs_review" })} />}
      columns={columns}
      sortOptions={SORTS}
      facets={PO_MISMATCH_FACETS}
      band={<div className="px-4 pt-3"><QueueSegments segments={[
        { key: "invoices", label: "Invoice approvals", count: invoiceCount, href: basePath.replace(/\/po-mismatches$/, "/invoices") },
        { key: "po-mismatches", label: "PO mismatches", count: ownCount, href: basePath },
      ]} active="po-mismatches" /></div>}
      // #261: the shared `QueueCard` fed by the columns' phone slots; #257's comma-separated name.
      cards={{ below: "lg", title: "Ready to Approve", label: (row) => [
        row.supplier ?? "Unknown supplier",
        row.poNumber ?? "No PO #",
        `Variance ${formatMoney(row.variance, row.currencyCode)} (${variancePercent(row).toFixed(1)}%)`,
        row.eligibility.status !== "ready" ? eligibilityText(row) : stageLabel(row.stage),
      ].join(", ") }}
      initialSelectedId={initialSelectedId}
      empty={{
        // #264 spec §3.3: Approvals never shows first-use copy — its rows are decisions, not
        // documents — so its sentence and links sit under `done`.
        done: { body: "Anything you can decide will show here. A PO mismatch appears on its own once a match check fails on an invoice with an Approval in flight.",
        action: <span className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {waitingOnOthers > 0 && <Link href={`${basePath}?approver=anyone`} className="font-medium text-emerald-800 underline-offset-2 hover:underline">{waitingOnOthers} waiting on other approvers</Link>}
          <Link href={`/workspaces/${workspaceId}/invoices`} className="font-medium text-emerald-800 underline-offset-2 hover:underline">Go to Invoices</Link>
        </span> },
        filteredTitle: "No rows match these filters",
      }}
      workspaceDocumentCount={workspaceDocumentCount}
      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId, { initialTab: "checks" })}
      paneActions={(row, helpers) => {
        if (decided && decided.row.documentId === row.documentId) {
          return <DecisionResultStrip decided={decided} next={helpers.next} onBack={() => { setDecided(null); helpers.close() }} />
        }
        const rowError = error?.gateId === row.gateId ? error.message : null
        const isPending = pending?.gateId === row.gateId
        const rejectDisabled = !online || !row.canDecide || pending !== null
        const approveDisabled = rejectDisabled || row.eligibility.status !== "ready"
        const disabledReason = !online ? OFFLINE_REASON : !row.canDecide ? "Only this stage's approver can decide it." : row.eligibility.status !== "ready" ? eligibilityText(row) : null
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
      disabledReason={!online ? OFFLINE_REASON : null} pendingLabel="Approving…"
      action={async (formData) => {
        if (!overriding) return { success: false, error: "No mismatch selected" }
        const row = overriding
        return settle(row, "approve", () => overrideGateAction(workspaceId, row.gateId, formData))()
      }}
      title="Approve over the PO mismatch"
      description={overriding ? `This invoice is ${formatMoney(overriding.variance, overriding.currencyCode)} (${variancePercent(overriding).toFixed(1)}%) over the PO, past the ${Math.round(overriding.percent * 100)}% allowance. Approving overrides the match check and is recorded with your reason. The invoice then continues through its approval flow.` : ""}
      submitLabel="Approve"
      placeholder="Why is this variance acceptable?" />

    <ReasonDialog open={rejecting !== null} placement="sheet" onClose={() => setRejecting(null)}
      disabledReason={!online ? OFFLINE_REASON : null} pendingLabel="Rejecting…"
      action={async (formData) => {
        if (!rejecting) return { success: false, error: "No mismatch selected" }
        const row = rejecting
        const reason = String(formData.get("reason") || "").trim()
        return settle(row, "reject", () => decideReviewTaskStageAction(workspaceId, row.taskId, "reject", reason))()
      }}
      title="Reject this Approval"
      description="This ends the approval run for this invoice, not just this mismatch. The reason goes on the audit trail and to whoever started it."
      submitLabel="Reject"
      placeholder="Why is this being rejected?" />
  </>
}
