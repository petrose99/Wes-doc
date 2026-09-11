import { AutomationFrame, Empty, Figure, Panel, Pill, Sheet, Th } from "@/components/automation/automation-ui"
import { VendorHistorySheet } from "@/components/automation/vendor-history-sheet"
import { getCurrentUser } from "@/lib/auth"
import { getSupplierTrust, type SupplierTrustRow } from "@/lib/analytics/workspace-analytics"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { HISTORY_APPLY_THRESHOLDS } from "@/lib/automation/vendor-history"
import { SUPPLIER_COLD_START_COUNT, SUPPLIER_TRUST_STREAK } from "@/lib/readiness/supplier-thresholds"
import { listPinnedRuleIdsBySupplier } from "@/models/automation-rules"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"
import { summarizeVendorHistory } from "@/models/vendor-history"

export const dynamic = "force-dynamic"

/** One supplier's standing in the trust ladder — answers "why is this vendor still going to
 * review, and how much longer" without anyone reading the readiness code. Moved here from the
 * Overview so everything supplier-shaped lives on one tab: whether a vendor's documents may skip
 * review (this table) and what gets filled in when they do (the coding table below). */
function SupplierRow({ row }: { row: SupplierTrustRow }) {
  const standing = row.coldStart
    ? { state: "waiting" as const, label: "Still new" }
    : row.trusted
      ? { state: "auto" as const, label: "Trusted" }
      : { state: "idle" as const, label: "Building trust" }
  return <tr>
    <td className="py-2.5 pr-4 font-medium text-slate-900">{row.name}</td>
    <td className="py-2.5 pr-4"><Pill state={standing.state}>{standing.label}</Pill></td>
    <td className="py-2.5 pr-4 text-slate-600">
      {row.coldStart
        ? `${row.remainingToGraduate} more document${row.remainingToGraduate === 1 ? "" : "s"} reviewed by a person`
        : "None — past the new-vendor period"}
    </td>
    <td className="py-2.5 pr-4 tabular-nums text-slate-600">{row.consecutiveClean} of {SUPPLIER_TRUST_STREAK}</td>
    <td className="py-2.5 text-right tabular-nums text-slate-600">{row.effectiveMinConfidence.toFixed(2)}</td>
  </tr>
}

/** The one supplier tab: both per-vendor levers side by side. Trust (may this vendor's documents
 * skip review?) and coding history (what gets filled in before the AI is asked?). They used to
 * live on two different tabs with no link between them, which made either one hard to place in
 * the pipeline. */
export default async function AutomationVendorsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const isOwner = membership.role === "owner"
  const [rows, supplierTrust, reviewCount, pinnedRuleIds] = await Promise.all([
    summarizeVendorHistory(workspaceId),
    getSupplierTrust(workspaceId),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
    isOwner ? listPinnedRuleIdsBySupplier(workspaceId) : Promise.resolve(new Map<string, string>()),
  ])
  const autoCount = rows.filter((row) => row.willAutoApply).length

  return <AutomationFrame
    workspaceId={workspaceId}
    active="vendors"
    reviewCount={reviewCount}
    reviewEnabled={reviewEnabled}
    showSettings={isOwner}
    status="Each vendor carries two rules. Trust decides whether its documents may skip a person's review; coding history decides what gets filled in for them automatically. Both are earned from the documents you have already reviewed."
  >
    <Panel
      title="Who can skip review"
      note={<>
        A new vendor&rsquo;s first {SUPPLIER_COLD_START_COUNT} documents always go to a person, however confident
        the extraction is. After {SUPPLIER_TRUST_STREAK} clean documents in a row, the vendor is trusted and its
        documents can move on their own.
      </>}
    >
      {supplierTrust.length === 0
        ? <Empty title="No vendors recognised yet">
            Vendors appear here as documents are extracted. The first document from any vendor starts its trust record.
          </Empty>
        : <Sheet head={<>
            <Th>Vendor</Th>
            <Th>Standing</Th>
            <Th>Before it can skip review</Th>
            <Th>Clean streak</Th>
            <Th align="right">Confidence bar</Th>
          </>}>
            {supplierTrust.map((row) => <SupplierRow key={row.supplierId} row={row} />)}
          </Sheet>}
    </Panel>

    <Panel
      title="What gets filled in automatically"
      note={<>
        When {HISTORY_APPLY_THRESHOLDS.minSupport} or more of a vendor&rsquo;s reviewed documents agree on a value{" "}
        {Math.round(HISTORY_APPLY_THRESHOLDS.minAgreement * 100)}% of the time, the next document gets that value
        without asking the AI. Vendors below that bar still go to the AI on every document.
      </>}
    >
      {rows.length === 0
        ? <Empty title="No coding history yet">
            History builds as documents are coded — by hand or by a rule. Three consistent codings
            for the same vendor are enough for the next one to fill itself in.
          </Empty>
        : <>
          <div className="mb-5">
            <Figure
              layout="inline"
              value={`${autoCount}`}
              state={autoCount > 0 ? "auto" : "idle"}
              caption={<>
                of {rows.length} vendor{rows.length === 1 ? "" : "s"} with history now{" "}
                {autoCount === 1 ? "fills itself in" : "fill themselves in"}. The rest still go to the AI every time.
              </>}
            />
          </div>
          <VendorHistorySheet
            workspaceId={workspaceId}
            rows={rows}
            pinnedRuleIds={Object.fromEntries(pinnedRuleIds)}
            isOwner={isOwner}
          />
        </>}
    </Panel>
  </AutomationFrame>
}
