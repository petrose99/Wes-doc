import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
const dir = `${root}/app/(app)/workspaces/[workspaceId]/admin/configuration/report`
mkdirSync(dir, { recursive: true })
let s = execFileSync('git', ['show', 'HEAD:app/(app)/workspaces/[workspaceId]/automation/page.tsx'], { cwd: root, encoding: 'utf8' })
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b) }
rep(`import { getCurrentUser } from "@/lib/auth"
import { getAutomationMetrics } from "@/lib/analytics/workspace-analytics"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { PIPELINE_STAGES } from "@/lib/documents/stages"
import { deriveAutonomyLevel, getOrCreateAutomationConfig } from "@/models/automation-config"
import { countDocumentsByStage } from "@/models/documents"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"
import { AutomationFrame, Figure, Funnel, Ledger, LedgerRow, Panel } from "@/components/automation/automation-ui"
import { ControlsSpine } from "@/components/automation/controls-spine"
import Link from "next/link"
`, `import { AdminPage, ModuleOff } from "@/components/admin/admin-ui"
import { getAutomationMetrics } from "@/lib/analytics/workspace-analytics"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { PIPELINE_STAGES } from "@/lib/documents/stages"
import { deriveAutonomyLevel, getOrCreateAutomationConfig } from "@/models/automation-config"
import { countDocumentsByStage } from "@/models/documents"
import { Figure, Funnel, Ledger, LedgerRow, Panel } from "@/components/automation/automation-ui"
import { ControlsSpine } from "@/components/automation/controls-spine"
import Link from "next/link"
`)
rep(`export default async function AutomationDashboardPage({ params }: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const [metrics, reviewCount, stageCounts, config] = await Promise.all([
    getAutomationMetrics(workspaceId, 30),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
    countDocumentsByStage(workspaceId),
    getOrCreateAutomationConfig(workspaceId),
  ])`, `/** #252: what was Controls › Overview — the pipeline spine with its levers and the last 30
 * days of untouched flow — kept reachable as Configuration › Report. Not in #231's Admin IA and
 * reporting is out of scope on the map, so retiring it is the owner's signature (#256), not this
 * ticket's call. */
export default async function AutomationReportPage({ params }: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const { capabilities, membership } = context
  if (!capabilities.has("touchless-automation")) {
    return <AdminPage title="Report"><ModuleOff what="Touchless automation" href={adminPaths(workspaceId).whatsOn} /></AdminPage>
  }
  const [metrics, stageCounts, config] = await Promise.all([
    getAutomationMetrics(workspaceId, 30),
    countDocumentsByStage(workspaceId),
    getOrCreateAutomationConfig(workspaceId),
  ])`)
rep(`      href: \`/workspaces/\${workspaceId}/automation/settings\`,
      linkLabel: membership.role === "owner" ? "Open Settings" : "Ask an owner",`, `      href: adminPaths(workspaceId).autonomy,
      linkLabel: membership.role === "owner" ? "Open Autonomy" : "Ask an owner",`)
rep(`      href: \`/workspaces/\${workspaceId}/automation/vendors\`,
      linkLabel: "See Vendor rules",`, `      href: adminPaths(workspaceId).suppliers,
      linkLabel: "See Suppliers",`)
rep(`  return <AutomationFrame
    workspaceId={workspaceId}
    active="metrics"
    reviewCount={reviewCount}
    reviewEnabled={reviewEnabled}
    showSettings={membership.role === "owner"}
    status="Rules that decide which documents move on their own and which wait for a person."
  >`, `  return <AdminPage title="Report" intro="Where documents stand right now against the levers that decide whether they move on their own, and how much moved untouched in the last 30 days.">`)
s = s.replace(/<\/AutomationFrame>\n}\s*$/, '</AdminPage>\n}\n')
writeFileSync(`${dir}/page.tsx`, s)
// spine links
const sp = `${root}/components/automation/controls-spine.tsx`
let c = execFileSync('cat', [sp], { encoding: 'utf8' })
c = c.replace('{ before: "review", label: "Vendor rules", href: `${base}/automation/vendors` },', '{ before: "review", label: "Supplier rules", href: `${base}/admin/suppliers` },')
c = c.replace('{ before: "approved", label: "Approval workflows", href: `${base}/automation/approvals` },', '{ before: "approved", label: "Approval flows", href: `${base}/admin/approval-flows` },')
c = c.replace('{ before: "synced", label: autonomyLabel, href: canOpenSettings ? `${base}/automation/settings` : null },', '{ before: "synced", label: autonomyLabel, href: canOpenSettings ? `${base}/admin/configuration/autonomy` : null },')
writeFileSync(sp, c)
console.log('ok')
