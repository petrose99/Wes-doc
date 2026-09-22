import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"
import { paymentBatchFile, recordPaymentBatchExport } from "@/models/payment-batches"
import { notFound } from "next/navigation"

/** GET /api/workspaces/<workspaceId>/payment-runs/<runId>/download — regenerates the ZA EFT CSV
 * for an approved Payment batch and returns it as an attachment. The CSV is not stored on the
 * batch (a regenerated file is byte-identical), keeping the persisted state small.
 *
 * #229 Q2 (#251): the file is a consequence of approval — a pending or rejected batch has no
 * file — and downloading it is a *fact* stamped on the batch (`exportedAt/By`), never a state.
 * Auth: workspace member; a member handling the bank upload is the exact use case. */
export async function GET(_req: Request, { params }: { params: Promise<{ workspaceId: string; runId: string }> }) {
  const { workspaceId, runId } = await params
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)

  const file = await paymentBatchFile({ workspaceId, batchId: runId })
  if (!file) notFound()
  if (file.status === "pending_approval" || file.status === "rejected") {
    return new Response("This batch has no payment file: it is not approved.", { status: 409, headers: { "content-type": "text/plain; charset=utf-8" } })
  }
  if (file.problems.length > 0) {
    return new Response(`The payment file can't be written:\n${file.problems.join("\n")}`, { status: 422, headers: { "content-type": "text/plain; charset=utf-8" } })
  }

  await recordPaymentBatchExport({ workspaceId, actorId: user.id, batchId: runId })
  return new Response(file.csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "private, no-store",
    },
  })
}
