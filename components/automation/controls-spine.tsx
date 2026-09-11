import { STAGE_LABELS, type PipelineStage } from "@/lib/documents/stages"
import type { AutonomyLevel } from "@/models/automation-config"
import { ArrowRight, Banknote, CheckCircle2, Inbox, SearchCheck, Send } from "lucide-react"
import Link from "next/link"
import { Fragment, type ComponentType, type ReactNode } from "react"

/** The map between the two surfaces: the same five Documents stages, in the same order with the
 * same icons the pipeline's own StageTabs draws, with each handoff annotated by the control that
 * decides it. Documents is the belt; Controls is the control room — this band is the one place
 * both are drawn as a single object, so a reader never has to reconstruct the relationship from
 * two disconnected screens.
 *
 * The annotation IS the connector: a lever governs a transition, so it sits on the joint rather
 * than in a legend. Synced → Paid carries no lever — the ledger confirms payment, nothing here
 * decides it — and drawing that honestly (a plain joint) is part of the map. */

const STAGE_ICONS: Record<PipelineStage, ComponentType<{ className?: string }>> = {
  inbox: Inbox,
  review: SearchCheck,
  approved: CheckCircle2,
  synced: Send,
  paid: Banknote,
}

const LEVEL_LABELS: Record<AutonomyLevel, string> = {
  suggest: "Suggest — a person publishes",
  auto: "Auto with approval",
  touchless: "Touchless",
}

type Joint = {
  /** The stage this joint leads INTO — rendered before that stage's node. */
  before: PipelineStage
  label: string
  /** Null = no lever governs this handoff (Synced → Paid: the ledger confirms payment). */
  href: string | null
}

export function ControlsSpine({ workspaceId, counts, visibleStages, level, minConfidence, canOpenSettings }: {
  workspaceId: string
  counts: Record<PipelineStage, number>
  /** Mirrors the pipeline's own visibleStages rule so the two surfaces never disagree about
   * whether Synced/Paid exist for this workspace. */
  visibleStages: readonly PipelineStage[]
  level: AutonomyLevel
  minConfidence: number
  /** Settings is owner-only; a member's autonomy annotation stays informative but unlinked. */
  canOpenSettings: boolean
}) {
  const base = `/workspaces/${workspaceId}`
  const autonomyLabel = level === "touchless"
    ? `Touchless · ≥ ${minConfidence.toFixed(2)}`
    : LEVEL_LABELS[level]

  const joints: Joint[] = [
    { before: "review", label: "Vendor rules", href: `${base}/automation/vendors` },
    { before: "approved", label: "Approval workflows", href: `${base}/automation/approvals` },
    { before: "synced", label: autonomyLabel, href: canOpenSettings ? `${base}/automation/settings` : null },
    { before: "paid", label: "Ledger confirms payment", href: null },
  ]
  const jointBefore = (stage: PipelineStage) => joints.find((j) => j.before === stage)

  const stageNode = (stage: PipelineStage) => {
    const Icon = STAGE_ICONS[stage]
    return <Link
      href={`${base}/pipeline?stage=${stage}`}
      className="group flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-slate-50"
    >
      <Icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-600" aria-hidden="true" />
      <span className="text-[13px] font-medium text-slate-800 group-hover:text-slate-900">{STAGE_LABELS[stage]}</span>
      <span className="text-[13px] font-semibold tabular-nums text-slate-500">{counts[stage]}</span>
    </Link>
  }

  // `block w-full` is load-bearing: a bare centered flex child sizes to its own content and never
  // wraps or clips against its slot — it just bleeds over its neighbors. Wrapping (not truncating)
  // is the right failure mode for a 2-4 word label: "Approval workflows" as two short lines stays
  // fully legible; the same label ellipsized to "Approva…" does not.
  const annotation = (joint: Joint): ReactNode => joint.href
    ? <Link href={joint.href} className="block w-full text-[11px] font-medium leading-tight text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline">{joint.label}</Link>
    : <span className="block w-full text-[11px] leading-tight text-slate-400">{joint.label}</span>

  // A real CSS grid, not flexbox, for the desktop band — annotations that wrap to two lines must
  // never push the arrow row out of alignment across columns. A grid's rows size independently:
  // row 1 (annotations) can grow as tall as its tallest wrapped label without affecting row 2's
  // height at all, so the stage icons and the connecting line stay on one shared line regardless
  // of which joint's label happens to wrap. Column template alternates auto (a stage node, sized
  // to its content) and 1fr (a joint, sized to share the remaining space evenly).
  const columns = visibleStages.map((_, i) => (i < visibleStages.length - 1 ? "auto minmax(0,1fr)" : "auto")).join(" ")

  // Below lg: (1024px) — checked against the app's real persistent sidebar, not a bare viewport —
  // there isn't reliably enough width for five stage nodes and four joints on one line even with
  // wrapping annotations; the vertical layout, already full-width per row, reads better there.
  return <div>
    <div className="hidden lg:grid lg:gap-y-1.5" style={{ gridTemplateColumns: columns }}>
      {visibleStages.map((stage, index) => {
        const col = index * 2 + 1
        const joint = jointBefore(stage)
        return <Fragment key={stage}>
          <div style={{ gridColumn: col, gridRow: 2 }} className="flex items-center">{stageNode(stage)}</div>
          {index < visibleStages.length - 1 && <>
            <div style={{ gridColumn: col + 1, gridRow: 1 }} className="flex items-end justify-center px-2 pb-1 text-center">
              {joint ? annotation(joint) : <span className="text-[11px] text-transparent" aria-hidden="true">·</span>}
            </div>
            <div style={{ gridColumn: col + 1, gridRow: 2 }} className="flex items-center px-2" aria-hidden="true">
              <span className="h-px flex-1 bg-[#dbe3ec]" />
              <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" />
            </div>
          </>}
        </Fragment>
      })}
    </div>

    {/* Below lg: the same spine top-to-bottom, annotations indented under each joint. */}
    <div className="flex flex-col lg:hidden">
      {visibleStages.map((stage, index) => {
        const joint = jointBefore(stage)
        return <span key={stage} className="contents">
          {index > 0 && <span className="ml-[7px] flex min-w-0 items-center gap-2.5 border-l border-[#dbe3ec] py-1.5 pl-4">
            {joint && <span className="min-w-0 flex-1 text-left">{annotation(joint)}</span>}
          </span>}
          {stageNode(stage)}
        </span>
      })}
    </div>
  </div>
}
