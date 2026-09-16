import { readFileSync, writeFileSync } from 'node:fs'
const p = '/home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/admin/po-mismatch-flows/page.tsx'
let s = readFileSync(p, 'utf8')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b) }
rep(`import { AutomationFrame, Empty, Figure, Ledger, LedgerRow, Panel } from "@/components/automation/automation-ui"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { summarizeMatching } from "@/models/matching-metrics"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"
`, `import { AdminPage, ModuleOff, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Empty, Figure, Ledger, LedgerRow, Panel } from "@/components/automation/automation-ui"
import { PoQuantityTolerance } from "@/components/workspace/po-quantity-tolerance"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { summarizeMatching } from "@/models/matching-metrics"
`)
rep(`/** Phase 4 visibility, folded into /automation as the "Matches" tab: DocumentMatch rollup +
 * BankMatch reconciliation state. */
export default async function AutomationMatchesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const [summary, reviewCount] = await Promise.all([
    summarizeMatching(workspaceId),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
  ])
`, `/** #231 Q13 (#252): Admin › PO Mismatch Flows — the tolerances a match is judged by, then the
 * match history that was Controls › Matches as its read-only log. "Who approves a mismatch"
 * and the match-variance percent as a setting are #253's. */
export default async function PoMismatchFlowsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const paths = adminPaths(workspaceId)
  if (!context.capabilities.has("touchless-automation")) {
    return <AdminPage title="PO Mismatch Flows"><ModuleOff what="Touchless automation" href={paths.whatsOn} /></AdminPage>
  }
  const summary = await summarizeMatching(workspaceId)
`)
rep(`  return <AutomationFrame
    workspaceId={workspaceId}
    active="matches"
    reviewCount={reviewCount}
    reviewEnabled={reviewEnabled}
    showSettings={membership.role === "owner"}
    status="Documents the pipeline tied to each other, and how far the bank lines it accepted have gone toward reconciled."
  >
    {summary.total === 0 && summary.bankTotal === 0`, `  return <AdminPage title="PO Mismatch Flows" intro="How far an invoice may differ from its purchase order before the row shows a mismatch, and the record of every match the pipeline has proposed.">
    {!context.owner && <ReadOnlyBand owners={context.owners} />}

    <Panel title="Tolerances" note="A line inside the tolerance shows = on the invoice row; outside it shows ≠ and the Total carries the match-variance gate.">
      <PoQuantityTolerance workspaceId={workspaceId} percent={context.workspace.poQuantityTolerancePercent} readOnly={!context.owner} />
    </Panel>

    <Panel title="Match history" note="Documents the pipeline tied to each other, and how far the bank lines it accepted have gone toward reconciled.">
    {summary.total === 0 && summary.bankTotal === 0`)
rep(`      </>}
  </AutomationFrame>
}`, `      </>}
    </Panel>
  </AdminPage>
}`)
// The inner Panels become plain sections inside the Match history panel (no nested panel titles at h2 level twice)
s = s.replace(/<Panel title="Document matches" note=/g, '<Panel title="Document matches" note=')
writeFileSync(p, s)
console.log('ok')
