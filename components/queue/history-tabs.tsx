"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ReasonDialogButton } from "@/components/list-screen/reason-dialog-button"
import { useOverrideMode } from "@/components/queue/override-mode-context"
import { overrideGateAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { formatMoney } from "@/lib/money"
import type { ApprovalDetailFacts } from "@/models/approvals"

/** The Detail pane's history data (#225): the approval step chain (#218), the flat audit log,
 * and this document's open checks (#203). Loaded server-side by `getQueueDetailAction` alongside
 * the split pane so the tabs render from props with no second round trip. Shapes are unchanged
 * from #198's left-side panel, which this replaces. */
export type DocumentHistory = {
  auditEvents: Array<{ id: string; label: string; createdAt: string; actorName: string | null }>
  stageDecisions: Array<{ id: string; stageIndex: number; stageName: string; decision: "approve" | "reject"; note: string | null; actorName: string; actorAvatar?: string | null; decidedAt: string }>
  pendingStages: Array<{ stageIndex: number; stageName: string }>
  /** #257 S6/S7: who started the approval and who it waits on, the supplier's record, a near
   * duplicate, and the PO variance figures — null where the queue's loader does not supply them. */
  facts?: ApprovalDetailFacts | null
  /** `overridable`/`refusalReason` come from the server's own `overrideEligibility` — the client
   * never decides on its own that a check is a hard gate. */
  gates: Array<{ id: string; gateType: string; severity: "hard" | "soft"; firedAt: string; overridable: boolean; refusalReason: string | null }>
  /** #249: escalated `DocumentCheckResult` rows still open on this document — #210's Exceptions
   * mechanism, which is deliberately not a `Gate` (a document can carry more than one simultaneous
   * escalation; `Gate` is unique per gateType). Resolved from the Exceptions queue, not here. */
  escalations: Array<{ id: string; checkCode: string; message: string; escalationStatus: "open" | "in_review" | "resolved"; escalatedAt: string }>
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?"
}

/** A person on the timeline: their avatar, or initials on slate. 28px — the timeline's node. */
function PersonMark({ name, avatar, tone }: { name: string; avatar?: string | null; tone: "done" | "current" | "rejected" | "waiting" }) {
  const ring = tone === "current" ? "ring-2 ring-emerald-600 ring-offset-2" : tone === "rejected" ? "ring-2 ring-red-500 ring-offset-2" : ""
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt="" className={`h-7 w-7 shrink-0 rounded-full object-cover ${ring}`} />
  }
  const fill = tone === "waiting" ? "border border-dashed border-slate-300 text-slate-500" : tone === "rejected" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"
  return <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${fill} ${ring}`}>{initials(name)}</span>
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days} d ago`
  return new Date(iso).toLocaleDateString()
}

/** #257 S6 (spec 3.5 point 2): the approval as one line of people — who started it, each stage
 * decided, the stage it waits on (ringed, "Waiting on you" / "Waiting on ‹name›"), and the
 * stages not reached yet. Falls back to the decisions + pending stages alone (#218's data) when
 * the loader supplied no `facts.approval` — the standalone route, or a document with no run. */
export function ApprovalTimeline({ decisions, pendingStages, approval }: {
  decisions: DocumentHistory["stageDecisions"]
  pendingStages: DocumentHistory["pendingStages"]
  approval?: ApprovalDetailFacts["approval"]
}) {
  if (!approval && decisions.length === 0 && pendingStages.length === 0) {
    return <p className="text-sm text-slate-500">No approval steps yet. Approving this document records the first one.</p>
  }
  const decidedByStage = new Map(decisions.map((decision) => [decision.stageIndex, decision]))
  const stages = approval
    ? approval.stages
    : [...decisions.map((d) => ({ stageIndex: d.stageIndex, name: d.stageName })), ...pendingStages.map((p) => ({ stageIndex: p.stageIndex, name: p.stageName }))]
  const currentIndex = approval?.currentStageIndex ?? pendingStages[0]?.stageIndex ?? -1
  const line = "absolute left-[13px] top-7 h-[calc(100%-0.25rem)] w-px"
  return <ol aria-label="Approval timeline">
    {approval && <li className="relative flex gap-3 pb-4">
      <span className={`${line} bg-slate-200`} aria-hidden />
      <PersonMark name={approval.startedBy?.name ?? "DocuBite"} avatar={approval.startedBy?.avatar} tone="done" />
      <div className="min-w-0 pt-1">
        <p className="text-sm text-slate-800"><span className="font-medium">{approval.startedBy?.name ?? "DocuBite"}</span> started the approval</p>
        <p className="text-xs text-slate-500"><time dateTime={approval.startedAt}>{relativeTime(approval.startedAt)}</time></p>
      </div>
    </li>}
    {stages.map((stage, position) => {
      const decision = decidedByStage.get(stage.stageIndex)
      const last = position === stages.length - 1
      if (decision) {
        const rejected = decision.decision === "reject"
        return <li key={`stage-${stage.stageIndex}`} className="relative flex gap-3 pb-4">
          {!last && <span className={`${line} ${rejected ? "bg-red-200" : "bg-emerald-200"}`} aria-hidden />}
          <PersonMark name={decision.actorName} avatar={decision.actorAvatar} tone={rejected ? "rejected" : "done"} />
          <div className="min-w-0 pt-1">
            <p className="text-sm text-slate-800">
              <span className="font-medium">{decision.actorName}</span> {rejected ? "rejected" : "approved"} · {stage.name}
            </p>
            {rejected && decision.note && <p className="mt-0.5 text-sm text-slate-700">“{decision.note}”</p>}
            <p className="text-xs text-slate-500"><time dateTime={decision.decidedAt}>{relativeTime(decision.decidedAt)}</time></p>
          </div>
        </li>
      }
      const current = stage.stageIndex === currentIndex
      const who = current ? (approval ? (approval.waitingOnYou ? "you" : approval.waitingOn) : "an approver") : null
      return <li key={`stage-${stage.stageIndex}`} className="relative flex gap-3 pb-4" aria-current={current ? "step" : undefined}>
        {!last && <span className={`${line} bg-slate-200`} aria-hidden />}
        <PersonMark name={current && approval && !approval.waitingOnYou ? approval.waitingOn : String(stage.stageIndex + 1)} tone={current ? "current" : "waiting"} />
        <div className="min-w-0 pt-1">
          <p className={`text-sm ${current ? "font-medium text-slate-900" : "text-slate-500"}`}>
            {current ? `Waiting on ${who}` : "Not reached"} · {stage.name}
          </p>
        </div>
      </li>
    })}
  </ol>
}

/** #257 spec 3.5: the Approval tab — the status line, the timeline, what is known of the
 * supplier, and (PO Mismatches) the variance figures the decision is about. Everything here is
 * read-only; the decision itself is the pane's footer. */
export function ApprovalTab({ workspaceId, history }: { workspaceId: string; history: DocumentHistory }) {
  const facts = history.facts ?? null
  const approval = facts?.approval ?? null
  const supplier = facts?.supplier ?? null
  const mismatch = facts?.mismatch ?? null
  const duplicate = facts?.nearDuplicate ?? null
  // The way back from the duplicate is this pane, wherever it was opened — read on the client.
  const [from, setFrom] = useState("")
  useEffect(() => { setFrom(window.location.pathname + window.location.search) }, [])
  const stageLabel = approval ? `${approval.currentStageIndex + 1} of ${approval.stages.length} · ${approval.stages.find((s) => s.stageIndex === approval.currentStageIndex)?.name ?? ""}` : null
  return <div className="space-y-6">
    {approval && <p className="text-sm text-slate-800" role="status">
      <span className={`font-semibold ${approval.waitingOnYou ? "text-emerald-800" : "text-slate-700"}`}>{approval.waitingOnYou ? "Waiting on you" : `Waiting on ${approval.waitingOn}`}</span>
      <span className="text-slate-500"> · {stageLabel}</span>
    </p>}
    <ApprovalTimeline decisions={history.stageDecisions} pendingStages={history.pendingStages} approval={approval} />

    {mismatch && <section aria-labelledby="approval-variance">
      <h3 id="approval-variance" className="text-xs font-semibold uppercase tracking-wide text-slate-500">PO match</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-600">Ordered</dt><dd className="text-right tabular-nums text-slate-800">{formatMoney(mismatch.poTotal, mismatch.currencyCode)}</dd>
        {mismatch.alreadyInvoiced !== null && <><dt className="text-slate-600">Already invoiced</dt><dd className="text-right tabular-nums text-slate-800">{formatMoney(mismatch.alreadyInvoiced, mismatch.currencyCode)}</dd></>}
        <dt className="text-slate-600">This invoice</dt><dd className="text-right tabular-nums text-slate-800">{formatMoney(mismatch.invoiceTotal, mismatch.currencyCode)}</dd>
        <dt className="text-slate-600">Allowance</dt><dd className="text-right tabular-nums text-slate-800">{formatMoney(mismatch.threshold, mismatch.currencyCode)} ({Math.round(mismatch.percent * 100)}%)</dd>
        <dt className="font-medium text-slate-800">Over by</dt><dd className="text-right font-semibold tabular-nums text-amber-800">{formatMoney(mismatch.variance, mismatch.currencyCode)}</dd>
      </dl>
      <p className="mt-2 text-xs text-slate-500 lg:hidden">Match lines on desktop — the Checks tab there compares every line against the PO.</p>
    </section>}

    <section aria-labelledby="approval-supplier">
      <h3 id="approval-supplier" className="text-xs font-semibold uppercase tracking-wide text-slate-500">From this supplier</h3>
      {supplier
        ? <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-slate-600">Invoices</dt><dd className="tabular-nums text-slate-800">{supplier.documentCount}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-600">Last seen</dt><dd className="text-slate-800">{supplier.lastSeenAt ? relativeTime(supplier.lastSeenAt) : "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-600">Terms</dt><dd className="text-slate-800">{supplier.terms ?? "Not set"}</dd></div>
        </dl>
        : <p className="mt-2 text-sm text-slate-500">No supplier record yet.</p>}
      {duplicate && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Possible duplicate of{" "}
        <Link href={`/workspaces/${workspaceId}/invoices/${duplicate.documentId}${from ? `?from=${encodeURIComponent(from)}` : ""}`} className="font-medium underline underline-offset-2 hover:text-amber-950">
          {duplicate.invoiceNumber ? `invoice ${duplicate.invoiceNumber}` : "another invoice"}
        </Link>
        {" "}({duplicate.state}).
      </p>}
    </section>
  </div>
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
export function ChecksTab({ workspaceId, gates, escalations }: { workspaceId: string; gates: DocumentHistory["gates"]; escalations: DocumentHistory["escalations"] }) {
  const router = useRouter()
  const overrideMode = useOverrideMode()
  const [overridden, setOverridden] = useState<Set<string>>(new Set())
  const open = gates.filter((gate) => !overridden.has(gate.id))
  if (open.length === 0 && escalations.length === 0) return <p className="text-sm text-slate-500">No open checks on this document.</p>
  return <ul className="space-y-2">
    {escalations.map((escalation) => <li key={`escalation-${escalation.id}`} className="rounded-md border border-slate-200 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">{escalation.checkCode.replaceAll("_", " ")}</span>
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
          {escalation.escalationStatus === "in_review" ? "In review" : "Escalated"}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{escalation.message}</p>
      <div className="mt-1.5">
        <Link href={`/workspaces/${workspaceId}/exceptions`} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline">
          Resolve in Exceptions →
        </Link>
      </div>
    </li>)}
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
