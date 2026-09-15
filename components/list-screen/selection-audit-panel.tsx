"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"
import { ReasonDialogButton } from "@/components/list-screen/reason-dialog-button"

export type SelectionAuditPanelData = {
  auditEvents: Array<{ id: string; label: string; createdAt: string; actorName: string | null }>
  stageDecisions: Array<{ id: string; stageIndex: number; stageName: string; decision: "approve" | "reject"; note: string | null; actorName: string; decidedAt: string }>
  /** #218: stages of the document's active workflow task that haven't been decided yet — empty
   * once the task settles (approved/rejected) or when the document has no workflow at all. Ordered
   * by stageIndex, same as stageDecisions, so the two lists concatenate into one chronological
   * chain. */
  pendingStages: Array<{ stageIndex: number; stageName: string }>
  /** #203: every still-open (blocked) Gate row against this document. `overridable`/`refusalReason`
   * come from the server's own `lib/gates/list.ts::overrideEligibility` call, not re-derived here —
   * the client never decides on its own that a gate is a hard gate. */
  gates: Array<{ id: string; gateType: string; severity: "hard" | "soft"; firedAt: string; overridable: boolean; refusalReason: string | null }>
}

type Tab = "audit" | "approval" | "gates"

const TAB_ORDER: Tab[] = ["approval", "audit", "gates"]

/** #198: the selection-triggered left-side panel on the Invoices/Receipts list screens. Opens
 * when exactly one row's checkbox is selected (see InvoiceTable/ReceiptTable) — a second,
 * independent trigger from the row-click InlineDocumentPanel expansion (#215), which stays
 * anchored below its row so the two never occupy the same space. "Audit" reuses the same flat
 * event-log shape as the standalone detail view's Activity tab (split-pane.tsx); "Approval" is
 * new — it groups `review_task_stage_decided` audit events into a step chain. #203 adds "Gates":
 * this row's open exceptions, with the Override control that only does anything while the
 * screen's Override Mode is on (see OverrideModeBar). */
export function SelectionAuditPanel({ documentId, loadData, onClose, overrideModeActive, onOverrideGate, cancelInfo, onCancel }: {
  documentId: string
  loadData: (documentId: string) => Promise<SelectionAuditPanelData | null>
  onClose: () => void
  /** Whether the surface's Override Mode is currently on — gates a soft gate's Override control. */
  overrideModeActive: boolean
  /** Bound to the specific gate by the caller; returns the server action's result so a refusal
   * (reason missing, or the server itself refusing a hard gate as defense in depth) surfaces
   * inline in the dialog. On success the panel re-fetches so the overridden gate drops off the
   * open-exceptions list immediately. */
  onOverrideGate: (gateId: string, formData: FormData) => Promise<{ success: boolean; error?: string }>
  /** #220: the "Cancel invoice" control, next to Approve/Reject. Optional — only Invoices wire
   * this; Receipts/POs/Bank Statements have no cancellation concept yet. Null hides the control
   * entirely rather than rendering it always-disabled, since a receipt has nothing to explain. */
  cancelInfo?: { canCancel: boolean; disabledReason: string | null } | null
  onCancel?: (formData: FormData) => Promise<{ success: boolean; error?: string }>
}) {
  const [tab, setTab] = useState<Tab>("approval")
  const [data, setData] = useState<SelectionAuditPanelData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refetch = () => {
    loadData(documentId)
      .then((result) => setData(result))
      .catch(() => setError("Couldn't load this document's history."))
  }

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

  const tabButton = (value: Tab, label: string, count?: number) => <button type="button" key={value}
    id={`selection-audit-tab-${value}`} aria-selected={tab === value} aria-controls="selection-audit-tabpanel"
    role="tab" tabIndex={tab === value ? 0 : -1}
    className={`flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === value ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
    onClick={() => setTab(value)}>
    {label}
    {!!count && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{count}</span>}
  </button>

  return (
    <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" role="region" aria-label="Document audit and approval history">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-sm font-medium text-slate-600">History</span>
        <button type="button" onClick={onClose} aria-label="Close history panel"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      {cancelInfo && onCancel && (
        <div className="border-b border-slate-100 px-3 py-2">
          <ReasonDialogButton
            action={onCancel}
            triggerLabel="Cancel invoice…"
            title="Cancel this invoice"
            description="Terminal — there is no way to un-cancel once confirmed. The reason is recorded on the audit trail."
            submitLabel="Cancel invoice"
            placeholder="Why is this invoice being cancelled?"
            tone="amber"
            disabled={!cancelInfo.canCancel}
            disabledHint={cancelInfo.disabledReason ?? undefined}
          />
        </div>
      )}

      <div className="flex gap-0.5 border-b border-slate-100 px-2 pt-1" role="tablist" aria-label="History view"
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
          e.preventDefault()
          const currentIndex = TAB_ORDER.indexOf(tab)
          const nextIndex = (currentIndex + (e.key === "ArrowRight" ? 1 : TAB_ORDER.length - 1)) % TAB_ORDER.length
          const next = TAB_ORDER[nextIndex]
          setTab(next)
          document.getElementById(`selection-audit-tab-${next}`)?.focus()
        }}>
        {tabButton("approval", "Approval")}
        {tabButton("audit", "Audit")}
        {tabButton("gates", "Gates", data?.gates.length)}
      </div>

      <div id="selection-audit-tabpanel" aria-labelledby={`selection-audit-tab-${tab}`}
        className="max-h-[70vh] min-h-[12rem] overflow-y-auto p-3" role="tabpanel">
        {error ? <p className="text-sm text-red-600">{error}</p>
          : !data ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          : tab === "approval" ? <ApprovalStepChain decisions={data.stageDecisions} pendingStages={data.pendingStages} />
          : tab === "audit" ? <AuditLog events={data.auditEvents} />
          : <GatesTab gates={data.gates} overrideModeActive={overrideModeActive}
              onOverride={async (gateId, formData) => {
                const result = await onOverrideGate(gateId, formData)
                if (result.success) refetch()
                return result
              }} />}
      </div>
    </div>
  )
}

/** #203: this row's open exceptions. Every gate gets the same Override control regardless of
 * severity — a hard gate's is always disabled with the server's own refusal copy rather than
 * omitted, per the ticket's "a disabled control must say why in its own copy" rule; a soft gate's
 * is disabled only until Override Mode is turned on. */
function GatesTab({ gates, overrideModeActive, onOverride }: {
  gates: SelectionAuditPanelData["gates"]
  overrideModeActive: boolean
  onOverride: (gateId: string, formData: FormData) => Promise<{ success: boolean; error?: string }>
}) {
  if (gates.length === 0) return <p className="text-sm text-slate-400">No open exceptions on this document.</p>
  return <div className="space-y-2">
    {gates.map((gate) => <GateRow key={gate.id} gate={gate} overrideModeActive={overrideModeActive} onOverride={onOverride} />)}
  </div>
}

const GATE_TYPE_LABEL: Record<string, string> = {
  duplicate: "Duplicate",
  "jurisdiction-validity": "Jurisdiction validity",
  "smb-ceiling": "SMB ceiling",
  "match-variance": "2/3-way match",
  "supplier-trust": "Supplier trust",
  "confidence-band": "Low-confidence extraction",
  "warn-checks": "Workspace check",
}

function gateTypeLabel(gateType: string): string {
  return GATE_TYPE_LABEL[gateType] ?? gateType.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase())
}

function GateRow({ gate, overrideModeActive, onOverride }: {
  gate: SelectionAuditPanelData["gates"][number]
  overrideModeActive: boolean
  onOverride: (gateId: string, formData: FormData) => Promise<{ success: boolean; error?: string }>
}) {
  const label = gateTypeLabel(gate.gateType)
  const disabled = !gate.overridable || !overrideModeActive
  const disabledHint = !gate.overridable
    ? gate.refusalReason ?? undefined
    : !overrideModeActive
      ? "Turn on Override Mode (above the table) to override this finding."
      : undefined
  return (
    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${gate.severity === "hard" ? "bg-red-50 text-red-700" : "bg-amber-100 text-amber-800"}`}>
          {gate.severity === "hard" ? "Hard" : "Soft"}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-400">Blocked {new Date(gate.firedAt).toLocaleString()}</p>
      <div className="mt-1.5">
        <ReasonDialogButton
          action={(formData) => onOverride(gate.id, formData)}
          triggerLabel="Override…"
          title={`Override: ${label}`}
          description="Acknowledge this finding without resolving it. The reason is recorded on the audit trail — this is the accrue-or-acknowledge path for soft gates."
          submitLabel="Record override"
          placeholder="Why is this being overridden?"
          tone="amber"
          disabled={disabled}
          disabledHint={disabledHint}
        />
      </div>
    </div>
  )
}

/** #218: decided stages render first (oldest first, matching listDocumentStageDecisions'
 * ordering), then any not-yet-decided stages of the same active workflow task as "Pending" rows —
 * so the chain reads as one continuous sequence rather than stopping short with no sense of what's
 * left. A rejected task's remaining stages never reach here: pendingStages comes back empty once
 * the task is resolved (see getActiveWorkflowStageState). */
function ApprovalStepChain({ decisions, pendingStages }: { decisions: SelectionAuditPanelData["stageDecisions"]; pendingStages: SelectionAuditPanelData["pendingStages"] }) {
  if (decisions.length === 0 && pendingStages.length === 0) return <p className="text-sm text-slate-400">No approval decisions yet.</p>
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
    {pendingStages.map((stage) => <li key={`pending-${stage.stageIndex}`} className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-400">
        {stage.stageIndex + 1}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">
          <span className="font-medium">Step {stage.stageIndex + 1}</span>
          {" — "}
          <span>Pending</span>
        </p>
        <p className="text-xs text-slate-400">{stage.stageName}</p>
      </div>
    </li>)}
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
