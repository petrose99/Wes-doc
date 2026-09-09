import { AutomationFrame, Empty, Figure, Panel, Pill, Sheet, Th } from "@/components/automation/automation-ui"
import { PinVendorHistoryButton } from "@/components/automation/pin-vendor-history-button"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { HISTORY_APPLY_THRESHOLDS } from "@/lib/automation/vendor-history"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"
import { summarizeVendorHistory } from "@/models/vendor-history"

export const dynamic = "force-dynamic"

/** Phase 3 visibility, folded into /automation as the "Vendors" tab: shows every
 * (vendor, template) with confirmed coding history, plus what the auto-coding engine will
 * do for it — apply the modal value directly (touchless), or fall through to the LLM. */
export default async function AutomationVendorsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const isOwner = membership.role === "owner"
  const [rows, reviewCount] = await Promise.all([
    summarizeVendorHistory(workspaceId),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
  ])
  const autoCount = rows.filter((row) => row.willAutoApply).length

  return <AutomationFrame
    workspaceId={workspaceId}
    active="vendors"
    reviewCount={reviewCount}
    reviewEnabled={reviewEnabled}
    status={<>
      What each vendor gets coded to before the AI is asked. A coding applies on its own once at least{" "}
      {HISTORY_APPLY_THRESHOLDS.minSupport} confirmed documents agree {Math.round(HISTORY_APPLY_THRESHOLDS.minAgreement * 100)}% of the time.
    </>}
  >
    {rows.length === 0
      ? <Empty title="No confirmed history yet">
          A document counts as history once it is coded, whether by hand or by a rule. Three consistent
          codings for the same vendor are enough for the engine to apply them to the next one on its own.
        </Empty>
      : <>
        <Figure
          layout="inline"
          value={`${autoCount}`}
          state={autoCount > 0 ? "auto" : "idle"}
          caption={<>
            of the {rows.length} vendors with confirmed history now{" "}
            {autoCount === 1 ? "codes itself" : "code themselves"}. The rest still go to the AI on every document.
          </>}
        />

        <Panel
          title="Confirmed coding history"
          note={<>
            Each row is one vendor and document type. The percentage is how consistently past documents
            were coded that way, and the count is how many there were, so 100% of 5 means all five
            agreed. Sorted by how much history the workspace has.
          </>}
        >
          <Sheet minWidth={720} head={<>
            <Th>Vendor</Th>
            <Th>Document type</Th>
            <Th align="right">Confirmed</Th>
            <Th>Coding</Th>
            <Th>Behaviour</Th>
            {isOwner && <Th>{""}</Th>}
          </>}>
            {rows.map((row) => {
              const modalCoding = Object.fromEntries(
                Object.entries(row.prior.byKey).map(([key, stat]) => [key, stat.modalValue] as const),
              )
              return (
                <tr key={`${row.supplier}::${row.templateCode}`} className="align-top">
                  <td className="py-3 pr-4 font-medium text-slate-900">{row.supplier}</td>
                  <td className="py-3 pr-4 text-slate-500">{row.templateCode}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{row.totalConfirmed}</td>
                  <td className="py-3 pr-4">
                    <ul className="space-y-1">
                      {Object.entries(row.prior.byKey).map(([key, stat]) => (
                        <li key={key} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                          <span className="text-slate-500">{key}</span>
                          <span className="font-medium text-slate-900">{stat.modalValue}</span>
                          <span className="tabular-nums text-slate-400">
                            {Math.round(stat.agreement * 100)}% of {stat.support}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="py-3 pr-4">
                    {row.willAutoApply
                      ? <Pill state="auto">Codes itself</Pill>
                      : <Pill state="idle">Asks the AI</Pill>}
                  </td>
                  {isOwner && <td className="py-3">
                    <PinVendorHistoryButton workspaceId={workspaceId} supplier={row.supplier} templateCode={row.templateCode} coding={modalCoding} />
                  </td>}
                </tr>
              )
            })}
          </Sheet>
        </Panel>
      </>}
  </AutomationFrame>
}
