import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/** #266 spec Screen 4: `/pipeline` closes (#243 decision 4) — the four typed queues (Invoices,
 * Purchase Orders, Receipts, Bank Statements) are the one intake surface per type now, so this
 * redirects before any data fetch (no flash of the old page). Its stage distinction is lost for
 * anything that pointed at `?stage=review|inbox|approved|synced|paid` — a real, accepted
 * regression (spec's "Known regression, accepted"), not re-opened here. `PipelineShell` and its
 * stage-tab chrome (`components/pipeline/pipeline-shell.tsx`) stay in place, unreached — deleting
 * a whole shell component in the same session as the intake surface is a larger diff than this
 * ticket covers; flagged as a follow-up cleanup. */
export default async function PipelinePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  redirect(`/workspaces/${workspaceId}/invoices`)
}
