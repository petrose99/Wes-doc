import { queueArrival } from "@/lib/navigation/origin-server"
import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"
import { listOpenExceptions } from "@/models/exceptions"
import { countWorkspaceDocuments } from "@/models/documents"
import { ExceptionQueue } from "@/components/queue/exception-queue"
import { startExceptionReviewAction, resolveExceptionAction } from "./actions"

export const dynamic = "force-dynamic"

/** #210 (Wayfinder map 177): the fifth rail destination — one row per escalated check, on the
 * Queue screen since #225. */
export async function ExceptionsQueuePage({ params, searchParams, selectedId = null }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ status?: string; sort?: string }>
  selectedId?: string | null
}) {
  const { workspaceId } = await params
  const query = await searchParams
  const { status } = query
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)

  const [all, workspaceDocumentCount] = await Promise.all([listOpenExceptions(workspaceId), countWorkspaceDocuments(workspaceId)])
  const exceptions = status === "open" || status === "in_review" ? all.filter((row) => row.escalationStatus === status) : all

  const arrival = await queueArrival(workspaceId, { searchParams: query as Record<string, string | string[] | undefined>, queuePath: "exceptions", selectedId: selectedId, rowIds: exceptions.map((exception) => exception.id), unfilteredRowIds: all.map((exception) => ({ id: exception.id, documentId: exception.documentId })), missingText: "That exception is no longer open." })
  return <ExceptionQueue
    arrival={arrival}
    workspaceId={workspaceId}
    basePath={`/workspaces/${workspaceId}/exceptions`}
    documentBasePath={`/workspaces/${workspaceId}/documents`}
    exceptions={exceptions}
    initialSelectedId={selectedId}
    workspaceDocumentCount={workspaceDocumentCount}
    startReviewAction={startExceptionReviewAction.bind(null, workspaceId)}
    resolveAction={resolveExceptionAction.bind(null, workspaceId)} />
}

export default function ExceptionsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ status?: string; sort?: string }> }) {
  return ExceptionsQueuePage({ params, searchParams })
}
