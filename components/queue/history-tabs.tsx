"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ReasonDialogButton } from "@/components/list-screen/reason-dialog-button"
import { useOverrideMode } from "@/components/queue/override-mode-context"
import { overrideGateAction } from "@/app/(app)/workspaces/[workspaceId]/actions"

/** The Detail pane's history data (#225): the approval step chain (#218), the flat audit log,
 * and this document's open checks (#203). Loaded server-side by `getQueueDetailAction` alongside
 * the split pane so the tabs render from props with no second round trip. Shapes are unchanged
 * from #198's left-side panel, which this replaces. */
export type DocumentHistory = {
  auditEvents: Array<{ id: string; label: string; createdAt: string; actorName: string | null }>
  stageDecisions: Array<{ id: string; stageIndex: number; stageName: string; decision: "approve" | "reject"; note: string | null; actorName: string; decidedAt: string }>
  pendingStages: Array<{ stageIndex: number; stageName: string }>
  /** `overridable`/`refusalReason` come from the server's own `overrideEligibility` — the client
   * never decides on its own that a check is a hard gate. */
  gates: Array<{ id: string; gateType: string; severity: "hard" | "soft"; firedAt: string; overridable: boolean; refusalReason: string | null }>
}

/** #218: decided stages first (oldest first), then the not-yet-decided stages of the same active
 * task as "Pending" rows, so the chain reads as one sequence with a visible end. */
export function ApprovalStepChain({ decisions, pendingStages }: { decisions: DocumentHistory["stageDecisions"]; pendingStages: DocumentHistory["pendingStages"] }) {
  if (decisions.length === 0 && pendingStages.length === 0) return <p className="text-sm text-slate-500">No approval steps yet. Approving this document records the first one.</p>
  return <ol className="space-y-3">
    {decisions.map((decision) => {
      const rejected = decision.decision === "reject"
      return <li key={decision.id} className="flex gap-2.5">
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${rejected ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>
          {decision.stageIndex + 1}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-slate-800">
            <span className="font-medium">{decision.stageName}</span>
            {" · "}
            <span className={rejected ? "text-red-700" : "text-emerald-800"}>{rejected ? "Rejected" : "Approved"}</span>
            {" by "}{decision.actorName}
            {rejected && decision.note ? `: ${decision.note}` : ""}
          </p>
          <p className="text-xs text-slate-500">{new Date(decision.decidedAt).toLocaleString()}</p>
        </div>
      </li>
    })}
    {pendingStages.map((stage) => <li key={`pending-${stage.stageIndex}`} className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-[11px] font-semibold tabular-nums text-slate-500">
        {stage.stageIndex + 1}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-slate-600"><span className="font-medium">{stage.stageName}</span> · Pending</p>
      </div>
    </li>)}
  </ol>
}

export function AuditLog({ events }: { events: DocumentHistory["auditEvents"] }) {
  if (events.length === 0) return <p className="text-sm text-slate-500">No activity recorded yet.</p>
  return <ol className="divide-y divide-slate-100">
    {events.map((event) => <li key={event.id} className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-sm text-slate-700">{event.label}</span>
      <span className="shrink-0 text-xs tabular-nums text-slate-500">{event.actorName ?? "System"} · {new Date(event.createdAt).toLocaleString()}</span>
    </li>)}
  </ol>
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

/** #203's open checks, now the Detail pane's "Checks" tab. Every check gets the same Override
 * control regardless of severity — a hard gate's is always disabled with the server's own refusal
 * copy rather than omitted; a soft gate's is disabled only until Override Mode is on. The mode
 * itself is toggled from the queue header's overflow menu (#225 removed the permanent strip). */
export function ChecksTab({ workspaceId, gates }: { workspaceId: string; gates: DocumentHistory["gates"] }) {
  const router = useRouter()
  const overrideMode = useOverrideMode()
  const [overridden, setOverridden] = useState<Set<string>>(new Set())
  const open = gates.filter((gate) => !overridden.has(gate.id))
  if (open.length === 0) return <p className="text-sm text-slate-500">No open checks on this document.</p>
  return <ul className="space-y-2">
    {open.map((gate) => {
      const label = gateTypeLabel(gate.gateType)
      const disabled = !gate.overridable || !overrideMode.active
      const disabledHint = !gate.overridable
        ? gate.refusalReason ?? undefined
        : !overrideMode.active
          ? "Turn on Override Mode from the queue's menu (⋯) to override this check."
          : undefined
      return <li key={gate.id} className="rounded-md border border-slate-200 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-800">{label}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${gate.severity === "hard" ? "bg-red-50 text-red-700" : "bg-amber-100 text-amber-800"}`}>
            {gate.severity === "hard" ? "Hard" : "Soft"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">Blocked {new Date(gate.firedAt).toLocaleString()}</p>
        <div className="mt-1.5">
          <ReasonDialogButton
            action={async (formData) => {
              const result = await overrideGateAction(workspaceId, gate.id, formData)
              if (result.success) {
                setOverridden((prev) => new Set(prev).add(gate.id))
                router.refresh()
              }
              return result
            }}
            triggerLabel="Override…"
            title={`Override: ${label}`}
            description="Acknowledge this check without resolving it. The reason is recorded on the audit trail."
            submitLabel="Record override"
            placeholder="Why is this being overridden?"
            tone="amber"
            disabled={disabled}
            disabledHint={disabledHint}
          />
        </div>
      </li>
    })}
  </ul>
}
