import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"
import { listOpenExceptions } from "@/models/exceptions"
import { ListScreenShell } from "@/components/list-screen/list-screen-shell"
import { ExceptionsTable } from "@/components/typed-destinations/exceptions-table"
import { startExceptionReviewAction, resolveExceptionAction } from "./actions"

export const dynamic = "force-dynamic"

/** #210 (Wayfinder map 177): the fifth rail destination — one row per escalated check (not per
 * document), covering both a reviewer's "the document is wrong" call from RationalePopover
 * (#202) and #217's "Flag as anomaly" statement-layout-drift routing, since both just land a
 * DocumentCheckResult with status "escalated" here. */
export default async function ExceptionsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)

  const exceptions = await listOpenExceptions(workspaceId)
  const documentBasePath = `/workspaces/${workspaceId}/documents`
  const startReview = startExceptionReviewAction.bind(null, workspaceId)
  const resolve = resolveExceptionAction.bind(null, workspaceId)

  return <ListScreenShell
    header={<div className="border-b px-6 py-4">
      <h1 className="text-xl font-bold text-slate-900">Exceptions</h1>
      <p className="mt-1 text-sm text-slate-500">Checks a reviewer flagged as a document problem, not an extraction error. Resolve each one with a reason — the document stays untouched until you do.</p>
    </div>}>
    <main className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{exceptions.length} exception{exceptions.length === 1 ? "" : "s"}</CardTitle>
          <CardDescription>Open and in-review escalations across every typed surface. Resolved exceptions drop off this list.</CardDescription>
        </CardHeader>
        <CardContent>
          {exceptions.length === 0
            ? <p className="text-sm text-muted-foreground">No open exceptions. Escalate a check from a document&apos;s field rationale to send it here.</p>
            : <ExceptionsTable documentBasePath={documentBasePath} exceptions={exceptions} startReviewAction={startReview} resolveAction={resolve} />}
        </CardContent>
      </Card>
    </main>
  </ListScreenShell>
}
