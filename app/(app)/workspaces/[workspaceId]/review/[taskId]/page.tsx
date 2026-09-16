import { getCurrentUser } from "@/lib/auth"
import { getReviewTask } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"
import { notFound, permanentRedirect } from "next/navigation"

export const dynamic = "force-dynamic"

/** #236 decision #1: /review/[taskId] is retired — the same document's Approval now lives at
 * /approvals/invoices/[documentId] (a task id was never meaningful to a bookmark; the document is
 * what a person actually recognizes). 308, matching the parent route's own retirement. */
export default async function ReviewTaskRedirectPage({ params }: { params: Promise<{ workspaceId: string; taskId: string }> }) {
  const { workspaceId, taskId } = await params
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  const task = await getReviewTask(workspaceId, taskId)
  if (!task) notFound()
  permanentRedirect(`/workspaces/${workspaceId}/approvals/invoices/${task.documentId}`)
}
