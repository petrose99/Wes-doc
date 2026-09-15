import { ExceptionsQueuePage } from "../page"

export const dynamic = "force-dynamic"

/** #225: a deep link to one exception opens the Exceptions queue with that row selected and the
 * Detail pane open — the same screen, not a separate page. */
export default async function ExceptionDeepLinkPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; exceptionId: string }>
  searchParams: Promise<{ status?: string; sort?: string }>
}) {
  const { workspaceId, exceptionId } = await params
  return ExceptionsQueuePage({ params: Promise.resolve({ workspaceId }), searchParams, selectedId: exceptionId })
}
