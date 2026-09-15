"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"

export type SelectionAuditPanelData = {
  auditEvents: Array<{ id: string; label: string; createdAt: string; actorName: string | null }>
  stageDecisions: Array<{ id: string; stageIndex: number; stageName: string; decision: "approve" | "reject"; note: string | null; actorName: string; decidedAt: string }>
}

type Tab = "audit" | "approval"

/** #198: the selection-triggered left-side panel on the Invoices/Receipts list screens. Opens
 * when exactly one row's checkbox is selected (see InvoiceTable/ReceiptTable) — a second,
 * independent trigger from the row-click InlineDocumentPanel expansion (#215), which stays
 * anchored below its row so the two never occupy the same space. "Audit" reuses the same flat
 * event-log shape as the standalone detail view's Activity tab (split-pane.tsx); "Approval" is
 * new — it groups `review_task_stage_decided` audit events into a step chain. */
export function SelectionAuditPanel({ documentId, loadData, onClose }: {
  documentId: string
  loadData: (documentId: string) => Promise<SelectionAuditPanelData | null>
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>("approval")
  const [data, setData] = useState<SelectionAuditPanelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadData(documentId)
      .then((result) => { if (!cancelled) setData(result) })
      .catch(() => { if (!cancelled) setError("Couldn't load this document's history.") })
    return () => { cancelled = true }
    // The caller remounts this panel with a fresh key per documentId (see InlineDocumentPanel's
    // same pattern), so there's no in-place documentId change to reset state for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabButton = (value: Tab, label: string) => <button type="button" key={value}
    aria-selected={tab === value} role="tab"
    className={`rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === value ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
    onClick={() => setTab(value)}>{label}</button>

  return (
    <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" role="region" aria-label="Document audit and approval history">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-sm font-medium text-slate-600">History</span>
        <button type="button" onClick={onClose} aria-label="Close history panel"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-0.5 border-b border-slate-100 px-2 pt-1" role="tablist" aria-label="History view">
        {tabButton("approval", "Approval")}
        {tabButton("audit", "Audit")}
      </div>

      <div className="max-h-[70vh] min-h-[12rem] overflow-y-auto p-3" role="tabpanel">
        {error ? <p className="text-sm text-red-600">{error}</p>
          : !data ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          : tab === "approval" ? <ApprovalStepChain decisions={data.stageDecisions} />
          : <AuditLog events={data.auditEvents} />}
      </div>
    </div>
  )
}

function ApprovalStepChain({ decisions }: { decisions: SelectionAuditPanelData["stageDecisions"] }) {
  if (decisions.length === 0) return <p className="text-sm text-slate-400">No approval decisions yet.</p>
  return <ol className="space-y-3">
    {decisions.map((decision) => {
      const rejected = decision.decision === "reject"
      return <li key={decision.id} className="flex gap-2.5">
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${rejected ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
          {decision.stageIndex + 1}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-slate-800">
            <span className="font-medium">Step {decision.stageIndex + 1}</span>
            {" — "}
            <span className={rejected ? "text-red-700" : "text-emerald-700"}>{rejected ? "Rejected" : "Approved"}</span>
            {" — "}
            {decision.actorName}
            {rejected && decision.note ? `: ${decision.note}` : ""}
          </p>
          <p className="text-xs text-slate-400">{decision.stageName} · {new Date(decision.decidedAt).toLocaleString()}</p>
        </div>
      </li>
    })}
  </ol>
}

function AuditLog({ events }: { events: SelectionAuditPanelData["auditEvents"] }) {
  if (events.length === 0) return <p className="text-sm text-slate-400">No activity recorded yet.</p>
  return <div className="space-y-1">
    {events.map((event) => <div key={event.id} className="rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50">
      <p className="text-sm text-slate-700">{event.label}</p>
      <p className="text-xs text-slate-400">{event.actorName ?? "System"} · {new Date(event.createdAt).toLocaleString()}</p>
    </div>)}
  </div>
}
