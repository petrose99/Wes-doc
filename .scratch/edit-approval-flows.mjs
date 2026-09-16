import { readFileSync, writeFileSync } from 'node:fs'
const p = '/home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/admin/approval-flows/page.tsx'
let s = readFileSync(p, 'utf8')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b) }
rep(`import { AutomationFrame, Empty, Panel, Pill } from "@/components/automation/automation-ui"
import { ApprovalWorkflowForm, type ApprovalFormMember } from "@/components/workspace/approval-workflow-form"
import { ApprovalWorkflowRowControls } from "@/components/workspace/approval-workflow-row"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { decimalToNumber } from "@/lib/money"
import { listApprovalWorkflows } from "@/models/approval-workflows"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { getWorkspaceMembers, requireWorkspaceRole } from "@/models/workspaces"
`, `import { AdminPage, ModuleOff, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Empty, Panel, Pill } from "@/components/automation/automation-ui"
import { ApprovalWorkflowForm, type ApprovalFormMember } from "@/components/workspace/approval-workflow-form"
import { ApprovalWorkflowRowControls } from "@/components/workspace/approval-workflow-row"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { decimalToNumber } from "@/lib/money"
import { listApprovalWorkflows } from "@/models/approval-workflows"
`)
rep(`/** WP-AP2: approval-workflow configuration moved out of /settings and into the Automation surface,
 * where the rest of the "how much does the pipeline finish without a person" controls live.
 *`, `/** #231 Q12 (#252): Admin › Approval Flows — the workflow list and editor, on the Admin shell.
 * The Default flow selector and its consequence sentence are #253's; until then the fact in
 * force is stated under the title: approvals start by hand from the Invoices bulk bar.
 *`)
rep(`export default async function AutomationApprovalsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")
  const owner = membership.role === "owner"
  const capabilities = await getWorkspaceCapabilities(workspaceId)
  if (!capabilities.has("approval-workflows")) {
    return <AutomationFrame workspaceId={workspaceId} active="approvals" reviewCount={0} reviewEnabled={false} showSettings={owner} status="Approval workflows are disabled for this workspace.">
      <Empty title="Not enabled">Turn on the Approval workflows module in Settings → Modules to configure named stages here.</Empty>
    </AutomationFrame>
  }

  const [workflows, members, reviewCount] = await Promise.all([
    listApprovalWorkflows(workspaceId),
    getWorkspaceMembers(workspaceId),
    countOpenReviewTasks(workspaceId),
  ])
  const memberOptions: ApprovalFormMember[] = members.map((m) => ({`, `export default async function ApprovalFlowsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const { owner, membership, members } = context
  if (!context.capabilities.has("approval-workflows")) {
    return <AdminPage title="Approval Flows"><ModuleOff what="Approval workflows" href={adminPaths(workspaceId).whatsOn} /></AdminPage>
  }

  const workflows = await listApprovalWorkflows(workspaceId)
  const memberOptions: ApprovalFormMember[] = members.map((m) => ({`)
rep(`  return <AutomationFrame
    workspaceId={workspaceId}
    active="approvals"
    reviewCount={reviewCount}
    reviewEnabled={capabilities.has("review-queue")}
    showSettings={owner}
    status="Route a bill through named stages before it counts as approved. Add named approvers or an amount threshold per stage."
  >
    {owner && (`, `  return <AdminPage title="Approval Flows" intro="Route an invoice through named stages before it counts as approved, with named approvers or an amount threshold per stage. Approvals start by hand from the Invoices bulk bar.">
    {!owner && <ReadOnlyBand owners={context.owners} />}
    {owner && (`)
rep(`        ? <Empty title="No workflows yet">Review tasks use the plain open → in review → approved/rejected flow until one is started on them.</Empty>`, `        ? <Empty title="No workflows yet">Until one exists, an approval started from the Invoices bulk bar is a single decision by an owner.</Empty>`)
rep(`    </Panel>
  </AutomationFrame>
}`, `    </Panel>
  </AdminPage>
}`)
writeFileSync(p, s)
console.log('ok')
