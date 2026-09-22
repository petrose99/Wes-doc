import { STAGE_LABELS, PIPELINE_STAGES, type PipelineStage } from "@/lib/documents/stages"
import { AlertTriangle, Banknote, CheckCircle2, Inbox, Loader2, SearchCheck, Send } from "lucide-react"
import { ListScreenNavigation } from "@/components/list-screen/list-screen-shell"

const STAGE_ICONS: Record<PipelineStage, typeof Loader2> = {
  inbox: Inbox,
  review: SearchCheck,
  approved: CheckCircle2,
  synced: Send,
  paid: Banknote,
}

/** The pipeline's stage tabs, with an icon and a count badge each. Plain links (?stage=) rather
 * than a client router — this list is a server component's data, so switching tabs is a normal
 * navigation.
 *
 * `failedCount`, when > 0, renders a red sub-badge on the Inbox tab: failed extractions are the
 * one thing on Inbox that needs a person to act rather than wait, and burying them inside the
 * neutral count hid that (audit fix — Inbox merges two opposite states).
 *
 * `visibleStages` lets the page hide Synced/Paid for a workspace where they can never fill —
 * no accounting integration configured and nothing ever synced. Tabs never hide while they hold
 * documents; data always wins over tidiness. */
export function StageTabs({ workspaceId, active, counts, failedCount = 0, visibleStages }: {
  workspaceId: string
  active: PipelineStage
  counts: Record<PipelineStage, number>
  failedCount?: number
  visibleStages?: readonly PipelineStage[]
}) {
  const stages = visibleStages ?? PIPELINE_STAGES
  return <ListScreenNavigation ariaLabel="Pipeline stage" items={stages.map((stage) => ({
    id: stage,
    href: `/workspaces/${workspaceId}/pipeline?stage=${stage}`,
    active: stage === active,
    icon: STAGE_ICONS[stage],
    label: STAGE_LABELS[stage],
    count: counts[stage],
    trailing: stage === "inbox" && failedCount > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-red-700" title={`${failedCount} failed extraction${failedCount === 1 ? "" : "s"} — open Inbox to re-extract or delete`}>
      <AlertTriangle className="h-3 w-3" />{failedCount}
    </span>,
  }))} />
}
