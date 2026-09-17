"use client"

import type { QueueArrival } from "@/lib/navigation/origin-server"
import { useCallback, useState, type KeyboardEvent, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { formatDate, TitleCell } from "@/components/queue/row-cells"
import { ReasonDialog } from "@/components/list-screen/reason-dialog-button"
import type { Facet } from "@/components/queue/facet-filters"
import { QueueSegments } from "@/components/queue/queue-segments"
import { ProcessingStateGlyph } from "@/components/typed-destinations/row-signals"
import { processingState } from "@/lib/documents/processing-state"
import { formatMoney } from "@/lib/money"
import { useOnlineStatus } from "@/lib/client/use-online-status"
import { usePhoneLane } from "@/lib/client/use-phone-lane"
import { countClaimsWaitingOnOthers, filterExpenseClaimRows } from "@/lib/approvals/filters"
import { DecisionResultStrip, NETWORK_ERROR, OFFLINE_REASON, type Decided } from "@/components/queue/decision-result"
import { ClaimSection } from "@/components/queue/claim-card"
import { decideExpenseClaimAction, getExpenseClaimDetailAction } from "@/app/(app)/workspaces/[workspaceId]/expense-claim-actions"
import type { ExpenseClaimRow } from "@/models/expense-claims"
import type { DocumentClaimFacts } from "@/lib/claims/facts"
import { CLAIM_STATUS_LABELS } from "@/lib/claims/labels"

/** Claims have no hard checks (no gate, no exception, no payment precondition), so unlike
 * `APPROVAL_INVOICE_FACETS` there is no "Not eligible" facet — only the approver scope (spec §6.2). */
export const EXPENSE_CLAIM_FACETS: Facet[] = [
  { param: "approver", label: "Approver", options: [{ value: "anyone", label: "Anyone" }], allLabel: "Me" },
]

const SORTS: SortOption<ExpenseClaimRow>[] = [
  { key: "submitted", label: "Submitted, oldest first", compare: (a, b) => (a.submittedAt?.getTime() ?? Infinity) - (b.submittedAt?.getTime() ?? Infinity) },
  { key: "amount", label: "Amount, high to low", compare: (a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity) },
]

/** Same stage sentence as the Invoices view — one derivation per row family (spec §2: never
 * `CLAIM_STATUS_LABELS` here; the Stage column is the workflow stage, not the claim status). */
function stageLabel(stage: ExpenseClaimRow["stage"]): string {
  return `${stage.index + 1} of ${stage.total} · ${stage.name}`
}

function claimantName(row: ExpenseClaimRow): string {
  return row.claimant?.name ?? "Unknown claimant"
}

function receiptsLabel(n: number): string {
  return `${n} receipt${n === 1 ? "" : "s"}`
}

export const STAGE_NOT_YOURS = "Only this stage's approver can decide it."

/** #273 S4: Approvals › Expense claims — every submitted claim, on the shared Queue screen beside
 * Invoice approvals and PO mismatches. A row's Approve/Reject decide the claim's current stage
 * (`decideExpenseClaimAction`: the workflow engine with a flow, the implicit Owner stage without
 * one). The decision bar is the pane's only action set; the claim card renders `readOnly`. */
export function ExpenseClaimQueue({ workspaceId, basePath, rows, invoiceCount, poMismatchCount, currentUserId, initialSelectedId, workspaceDocumentCount, arrival }: {
  workspaceId: string
  basePath: string
  /** Every submitted claim the actor may see — the Approver facet applies client-side
   * (`filterExpenseClaimRows`), so the Filter sheet and the empty state can count. */
  rows: ExpenseClaimRow[]
  /** The other two views through the same facets, for the segment counts. */
  invoiceCount: number
  poMismatchCount: number
  currentUserId: string
  initialSelectedId?: string | null
  workspaceDocumentCount: number
  arrival?: QueueArrival
}) {
  const router = useRouter()
  const online = useOnlineStatus()
  const phone = usePhoneLane()
  const [pending, setPending] = useState<{ claimId: string; decision: "approve" | "reject" } | null>(null)
  const [decided, setDecided] = useState<Decided<ExpenseClaimRow> | null>(null)
  const [approving, setApproving] = useState<ExpenseClaimRow | null>(null)
  const [rejecting, setRejecting] = useState<ExpenseClaimRow | null>(null)
  const [error, setError] = useState<{ claimId: string; message: string } | null>(null)

  const columns: QueueColumn<ExpenseClaimRow>[] = [
    { key: "claimant", label: "Claimant", narrow: true, className: "min-w-[12rem]", phone: "title", phoneRender: (row) => claimantName(row),
      render: (row) => <TitleCell title={row.claimant?.name ?? null} missingLabel="Unknown claimant" subtitle={row.name} /> },
    { key: "claim", label: "Claim", priority: "low", className: "whitespace-nowrap text-slate-700", render: (row) => <>{row.name}</> },
    { key: "receipts", label: "Receipts", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-700", render: (row) => <>{row.receiptCount}</> },
    { key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", phone: "trailing",
      phoneRender: (row) => row.total !== null ? formatMoney(row.total, row.currencyCode) : <span className="font-normal text-slate-600">No amount</span>,
      render: (row) => <>{row.total !== null ? formatMoney(row.total, row.currencyCode) : "—"}</> },
    { key: "stage", label: "Stage", className: "whitespace-nowrap text-slate-700", phone: "pill",
      phoneRender: (row) => <span className="text-[13px] text-slate-700">{stageLabel(row.stage)}</span>,
      render: (row) => <>{stageLabel(row.stage)}</> },
    { key: "submitted", label: "Submitted", className: "whitespace-nowrap tabular-nums text-slate-700", phone: "subtitle",
      phoneRender: (row) => <>{row.name} · {receiptsLabel(row.receiptCount)} · Submitted {formatDate(row.submittedAt)}</>,
      render: (row) => <>{formatDate(row.submittedAt)}</> },
  ]

  // Three exits, as on Invoices (spec §6.4): success → result strip; server refused (already
  // decided, not your stage) → the strip carries the server's sentence and the rows re-read;
  // network throw → the sheet stays open with the typed reason and the bar shows the error.
  const decide = async (row: ExpenseClaimRow, decision: "approve" | "reject", reason: string | undefined): Promise<{ success: boolean; error?: string }> => {
    setError(null)
    setPending({ claimId: row.claimId, decision })
    try {
      const result = await decideExpenseClaimAction(workspaceId, row.claimId, row.hasWorkflow, decision, reason)
      if (!result.success) {
        setDecided({ row, outcome: "refused", message: result.error || "This claim was already decided." })
        router.refresh()
        return { success: true }
      }
      setDecided({ row, outcome: decision === "approve" ? "approved" : "rejected" })
      if (!phone) toast.success(decision === "approve" ? CLAIM_STATUS_LABELS.approved : CLAIM_STATUS_LABELS.rejected)
      router.refresh()
      return { success: true }
    } catch {
      setError({ claimId: row.claimId, message: NETWORK_ERROR })
      return { success: false, error: NETWORK_ERROR }
    } finally {
      setPending(null)
    }
  }

  const waitingOnOthers = countClaimsWaitingOnOthers(rows)
  const searchParams = useSearchParams()
  const ownCount = filterExpenseClaimRows(rows, searchParams).length

  const loadDetail = useCallback(async (claimId: string): Promise<ReactNode | null> => {
    const result = await getExpenseClaimDetailAction(workspaceId, claimId)
    if (!result.success || !result.data) return null
    return <ExpenseClaimDetail workspaceId={workspaceId} facts={result.data} />
  }, [workspaceId])

  const approveDescription = (row: ExpenseClaimRow): string => {
    const amount = row.total !== null ? formatMoney(row.total, row.currencyCode) : "the amount claimed"
    const who = claimantName(row)
    const own = row.claimant?.id === currentUserId ? "You are approving your own claim. " : ""
    if (!row.hasWorkflow) return `${own}Records that ${who} is owed ${amount}. Receipts stay as they are.`
    if (row.nextStageName) return `${own}Approving moves it to ${row.nextStageName}.`
    return `${own}Completes the Approval: ${who} is owed ${amount}.`
  }

  return <>
    <QueueScreen<ExpenseClaimRow>
      origin={arrival?.origin ?? null}
      initialMissing={arrival?.initialMissing}
      title="Expense claims"
      basePath={basePath}
      rows={rows}
      filterRows={filterExpenseClaimRows}
      pinned={decided?.row ?? null}
      onOpenChange={(id) => { if (id !== decided?.row.claimId) setDecided(null) }}
      rowId={(row) => row.claimId}
      rowName={(row) => ({ title: claimantName(row), suffix: [row.name, row.total !== null ? formatMoney(row.total, row.currencyCode) : null].filter(Boolean).join(" · ") || null })}
      paneStatus={(row) => <span className={row.canDecide ? "font-semibold text-emerald-800" : "text-slate-700"}>{row.canDecide ? "Waiting on you" : "Waiting on others"}<span className="font-normal text-slate-500"> · {stageLabel(row.stage)}</span></span>}
      leading={() => <ProcessingStateGlyph state={processingState({ approvalStatus: "in_progress", blockedByCheck: false, escalated: false, touchless: false, status: "needs_review" })} />}
      columns={columns}
      sortOptions={SORTS}
      facets={EXPENSE_CLAIM_FACETS}
      band={<div className="px-4 pt-3"><QueueSegments segments={[
        { key: "invoices", label: "Invoice approvals", shortLabel: "Invoices", count: invoiceCount, href: basePath.replace(/\/expense-claims$/, "/invoices") },
        { key: "po-mismatches", label: "PO mismatches", count: poMismatchCount, href: basePath.replace(/\/expense-claims$/, "/po-mismatches") },
        { key: "expense-claims", label: "Expense claims", shortLabel: "Claims", count: ownCount, href: basePath },
      ]} active="expense-claims" /></div>}
      cards={{ below: "lg", title: "Ready to Approve", label: (row) => [
        claimantName(row),
        row.total !== null ? formatMoney(row.total, row.currencyCode) : "No amount",
        row.name,
        receiptsLabel(row.receiptCount),
        stageLabel(row.stage),
      ].join(", ") }}
      initialSelectedId={initialSelectedId}
      empty={{
        done: { body: "Anything you can decide will show here.",
          action: <span className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {waitingOnOthers > 0 && <Link href={`${basePath}?approver=anyone`} className="font-medium text-emerald-800 underline-offset-2 hover:underline">{waitingOnOthers} waiting on other approvers</Link>}
            <Link href={`/workspaces/${workspaceId}/receipts`} className="font-medium text-emerald-800 underline-offset-2 hover:underline">Go to Receipts</Link>
          </span> },
        filteredTitle: "No rows match these filters",
      }}
      workspaceDocumentCount={workspaceDocumentCount}
      loadDetail={loadDetail}
      paneActions={(row, helpers) => {
        if (decided && decided.row.claimId === row.claimId) {
          return <DecisionResultStrip decided={decided} next={helpers.next} onBack={() => { setDecided(null); helpers.close() }} />
        }
        const rowError = error?.claimId === row.claimId ? error.message : null
        const isPending = pending?.claimId === row.claimId
        const disabled = !online || !row.canDecide || pending !== null
        const disabledReason = !online ? OFFLINE_REASON : !row.canDecide ? STAGE_NOT_YOURS : null
        return <>
          {rowError && <p role="alert" className="w-full text-xs text-red-700 sm:mr-auto sm:w-auto">{rowError}</p>}
          {!rowError && disabledReason && <span className="w-full text-xs text-slate-600 sm:mr-auto sm:w-auto">{disabledReason}</span>}
          {isPending && <span className="w-full text-xs text-slate-600 sm:mr-auto sm:w-auto" aria-live="polite">{pending?.decision === "approve" ? "Approving…" : "Rejecting…"}</span>}
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setRejecting(row)}>Reject</Button>
          <Button type="button" size="sm" disabled={disabled} onClick={() => setApproving(row)}>Approve</Button>
        </>
      }} />

    {/* Approve confirms with its consequence (B1); the network case keeps the dialog open with the error. */}
    {approving && <ConfirmDialog open title={`Approve ${approving.name}?`} description={approveDescription(approving)}
      confirmLabel={pending ? "Approving…" : "Approve"} busy={pending !== null}
      onConfirm={() => { const row = approving; void decide(row, "approve", undefined).then((r) => { if (r.success) setApproving(null) }) }}
      onCancel={() => { if (!pending) { setApproving(null); setError(null) } }}>
      {error?.claimId === approving.claimId && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error.message}</p>}
    </ConfirmDialog>}

    <ReasonDialog open={rejecting !== null} placement="sheet" onClose={() => setRejecting(null)}
      disabledReason={!online ? OFFLINE_REASON : null} pendingLabel="Rejecting…"
      action={async (formData) => {
        if (!rejecting) return { success: false, error: "No claim selected" }
        return decide(rejecting, "reject", String(formData.get("reason") || "").trim())
      }}
      title={rejecting ? `Reject ${rejecting.name}?` : "Reject this claim?"}
      description={rejecting ? `${claimantName(rejecting)} gets your reason. The claim's ${receiptsLabel(rejecting.receiptCount)} are released to be claimed again.` : ""}
      submitLabel="Reject"
      placeholder="Why is this being rejected?" />
  </>
}

type DetailTab = "approval" | "details" | "audit"

/** The S4 pane body: the claim card (read-only — the decision bar is the only action set), the
 * receipts, and the claim's recorded events. A roving tablist like the document pane's. */
export function ExpenseClaimDetail({ workspaceId, facts }: { workspaceId: string; facts: DocumentClaimFacts }) {
  const [tab, setTab] = useState<DetailTab>("approval")
  const tabId = (value: DetailTab) => `${facts.id}-tab-${value}`
  const panelId = (value: DetailTab) => `${facts.id}-panel-${value}`
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    let next: number | null = null
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = tabs.length - 1
    if (next === null) return
    event.preventDefault()
    tabs[next].focus()
    tabs[next].click()
  }
  const tabButton = (value: DetailTab, label: string) => <button type="button" key={value} role="tab" id={tabId(value)} aria-controls={panelId(value)}
    aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
    className={`flex min-h-11 items-center whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 lg:min-h-0 ${tab === value ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}
    onClick={() => setTab(value)}>{label}</button>
  const panelProps = (value: DetailTab) => ({ id: panelId(value), role: "tabpanel", "aria-labelledby": tabId(value), tabIndex: -1 as const })

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex items-center shadow-[inset_0_-1px_0_0_theme(colors.slate.100)]">
      <div className="flex gap-0.5 overflow-x-auto px-3 pt-1" role="tablist" aria-label="Claim detail" onKeyDown={onTabKeyDown}>
        {tabButton("approval", "Approval")}
        {tabButton("details", "Details")}
        {tabButton("audit", "Audit")}
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {tab === "approval" && <div {...panelProps("approval")} className="space-y-4">
        {facts.status === "draft" && <p role="status" className="text-sm text-slate-700">Withdrawn — not waiting for approval.</p>}
        <ClaimSection workspaceId={workspaceId} facts={facts} readOnly />
      </div>}
      {tab === "details" && <div {...panelProps("details")}>
        <h3 className="text-sm font-semibold text-slate-900">Receipts</h3>
        {facts.receipts.length === 0
          ? <p className="mt-2 text-sm text-slate-600">{facts.deletedReceiptCount > 0 ? "Every receipt was deleted after submission. The amount is as submitted." : "No receipts on this claim."}</p>
          : <ul className="mt-2 divide-y divide-slate-100">
            {facts.receipts.map((receipt) => <li key={receipt.itemId} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-slate-800">{receipt.merchant}</span>
                <span className="block text-xs text-slate-500">{receipt.date ? formatDate(new Date(receipt.date)) : "No date"}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span className="tabular-nums text-slate-900">{receipt.amount !== null ? formatMoney(receipt.amount, receipt.currencyCode) : "No amount"}</span>
                <Link href={`/workspaces/${workspaceId}/receipts/${receipt.documentId}`} className="text-xs font-medium text-emerald-800 underline-offset-2 hover:underline">Open on Receipts</Link>
              </span>
            </li>)}
          </ul>}
      </div>}
      {tab === "audit" && <div {...panelProps("audit")}>
        <ClaimEvents facts={facts} />
      </div>}
    </div>
  </div>
}

/** The claim's recorded events, from the facts the pane already has: submitted, each stage
 * decision, and the outcome. Same row grammar as the document `AuditLog`. */
function ClaimEvents({ facts }: { facts: DocumentClaimFacts }) {
  const events: Array<{ key: string; label: string; who: string; at: string }> = []
  if (facts.submittedAt) events.push({ key: "submitted", label: "Submitted for approval", who: facts.claimant.name, at: facts.submittedAt })
  for (const d of facts.decisions) events.push({ key: d.id, label: `${d.decision === "approve" ? CLAIM_STATUS_LABELS.approved : CLAIM_STATUS_LABELS.rejected} · ${d.stageName}${d.note ? `: ${d.note}` : ""}`, who: d.actorName, at: d.decidedAt })
  if (facts.status === "approved" && facts.approval && !facts.decisions.some((d) => d.decision === "approve" && d.decidedAt === facts.approval!.at)) events.push({ key: "approved", label: CLAIM_STATUS_LABELS.approved, who: facts.approval.by, at: facts.approval.at })
  if (facts.status === "rejected" && facts.rejection && !facts.decisions.some((d) => d.decision === "reject" && d.decidedAt === facts.rejection!.at)) events.push({ key: "rejected", label: `Rejected${facts.rejection.reason ? `: ${facts.rejection.reason}` : ""}`, who: facts.rejection.by, at: facts.rejection.at })
  if (events.length === 0) return <p className="text-sm text-slate-500">No activity recorded yet.</p>
  return <ol className="divide-y divide-slate-100">
    {events.map((event) => <li key={event.key} className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-sm text-slate-700">{event.label}</span>
      <span className="shrink-0 text-xs tabular-nums text-slate-500">{event.who} · {new Date(event.at).toLocaleString()}</span>
    </li>)}
  </ol>
}
