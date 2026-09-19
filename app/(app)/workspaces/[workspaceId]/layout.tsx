import { MobileHeader } from "@/components/shell/mobile-header"
import { MobileTabBar } from "@/components/shell/mobile-tab-bar"
import { Sidebar } from "@/components/shell/sidebar"
import { SkipToListLink } from "@/components/shell/skip-to-list-link"
import { getCurrentUser, getSession } from "@/lib/auth"
import config from "@/lib/config"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { createClient } from "@/lib/supabase/server"
import { countReadyToApprove } from "@/models/approvals"
import { countDocumentsByStage } from "@/models/documents"
import { countOpenExceptions } from "@/models/exceptions"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { countBatchesPendingApproval } from "@/models/payment-batches"
import { getWorkspaceMembership, getWorkspacesForUser } from "@/models/workspaces"
import { redirect } from "next/navigation"

/** App shell: Lido's persistent left rail, full-bleed content beside it. The Files list and the
 * sheet both fill the remaining viewport; pages that want the narrower reading column wrap
 * themselves via the (chrome) route group's layout. */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  // A layout throw would escape the segment's own error boundary and hit the global error
  // page, so send non-members to their workspace list instead.
  const membership = await getWorkspaceMembership(workspaceId, user.id)
  if (!membership) redirect("/workspaces")

  // F15/F1: a hipaaMode workspace requires an aal2 session — MFA actually completed, not just
  // available. login-form.tsx already routes a fresh sign-in through /mfa/challenge when a factor
  // exists, so reaching here at aal1 despite one existing means an older session predates that
  // enrollment; step them up now rather than waiting for their next full login. If no verified
  // factor exists at all there is nothing to challenge — that's a real enforcement gap (the
  // workspace owner turned hipaaMode on before every member enrolled MFA), left as a nudge rather
  // than a dead-end redirect loop into a page they cannot complete.
  if (membership.workspace.hipaaMode) {
    const session = await getSession()
    if (session && session.aal !== "aal2") {
      const supabase = await createClient()
      const { data: factors } = await supabase.auth.mfa.listFactors()
      if (factors?.totp?.some((factor) => factor.status === "verified")) {
        redirect(`/mfa/challenge?next=${encodeURIComponent(`/workspaces/${workspaceId}`)}`)
      }
    }
  }

  // pipelineReviewCount feeds the sidebar's Pipeline nav badge — read on every navigation the same
  // way workspaces/capabilities already are, since it's cheap (one grouped count query) and the
  // badge needs to stay current without the reader having to visit Pipeline first.
  const [workspaces, capabilities, pipelineCounts, openExceptionsCount, batchesPendingApprovalCount] = await Promise.all([
    getWorkspacesForUser(user.id),
    getWorkspaceCapabilities(workspaceId),
    countDocumentsByStage(workspaceId),
    // #210: the Exceptions rail badge — same cheap-and-always-fresh treatment as the other counts.
    // (#238: the Worksheets unplaced count is gone with the surface it pointed at.)
    countOpenExceptions(workspaceId),
    // #251: the Payments rail badge — batches waiting for an owner's decision.
    countBatchesPendingApproval(workspaceId),
  ])

  // The Review rail entry carries an open-task badge for the same reason Extraction does: the
  // queue is where work waits on a person, and it is only worth walking to when something is in
  // it. Fetched after capabilities so a workspace without the review-queue module pays nothing.
  const reviewTaskCount = capabilities.has("review-queue") ? await countOpenReviewTasks(workspaceId) : 0

  // #236: the Approvals rail badge — the signed-in person's own Ready-to-Approve count across
  // both Approvals queues, never the workspace-wide total. Same capability gate as the queue
  // routes themselves.
  const approvalsReadyCount = capabilities.has("review-queue")
    ? await countReadyToApprove(workspaceId, { userId: user.id, role: membership.role as "owner" | "reviewer" | "member" })
    : 0

  const switchable = workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    kind: workspace.kind,
    role: workspace.members[0]?.role,
    organizationId: workspace.organizationId,
    organizationName: workspace.organization?.name ?? null,
  }))

  return <div className="flex min-h-screen bg-white text-slate-900">
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-slate-900 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg">Skip to content</a>
    {/* #262: a second skip link, only when a queue is mounted (`QueueScreen` sets the body flag) —
        Tab, Tab, Enter reaches the first row without walking the rail. */}
    <SkipToListLink />
    <Sidebar
      workspaceId={workspaceId}
      workspaces={switchable}
      user={{ name: user.name, email: user.email, approvalEmails: user.approvalNoticeEmails }}
      enabledModuleKeys={[...capabilities.enabled]}
      accountingEnabled={config.integrations.bigcapital.enabled}
      pipelineReviewCount={pipelineCounts.review}
      reviewTaskCount={reviewTaskCount}
      /* pipelineCounts.approved is the Approved-stage count from countDocumentsByStage: documents
       * past review and waiting to push to the ledger. Only meaningful when accountingEnabled;
       * the sidebar itself hides the Finance badge otherwise. */
      financePushableCount={pipelineCounts.approved}
      openExceptionsCount={openExceptionsCount}
      batchesPendingApprovalCount={batchesPendingApprovalCount}
      approvalsReadyCount={approvalsReadyCount} />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[radial-gradient(1200px_480px_at_100%_-10%,rgba(4,120,87,0.05),transparent_60%),#fafbfc]">
      <MobileHeader workspaceId={workspaceId} workspaces={switchable} user={{ name: user.name, email: user.email }} />
      {/* #261 (#240's input): the tab bar precedes the queue in DOM order so its landmark comes
          before every row in Tab order; it is `fixed`, so nothing moves visually. */}
      <MobileTabBar workspaceId={workspaceId} approvalsReadyCount={approvalsReadyCount} openExceptionsCount={openExceptionsCount} approvalsEnabled={capabilities.has("review-queue")} accountingEnabled={config.integrations.bigcapital.enabled} />
      <div id="main" role="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col pb-[72px] md:pb-0">{children}</div>
    </div>
  </div>
}
