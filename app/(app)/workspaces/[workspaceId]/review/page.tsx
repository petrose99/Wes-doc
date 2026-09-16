import { permanentRedirect } from "next/navigation"

export const dynamic = "force-dynamic"

/** #236 decision #1: /review is retired — Approvals › Invoices is its replacement, a 308 so any
 * bookmark, link or search-engine index pointing at the old URL is corrected in place. */
export default async function ReviewQueueRedirectPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  permanentRedirect(`/workspaces/${workspaceId}/approvals/invoices`)
}
