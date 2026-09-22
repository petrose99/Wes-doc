import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/** The legacy Bills URL. Invoices (#225, `(queue)/invoices`) is the surface; this only forwards
 * old bookmarks and keeps their two filters. */
export default async function LegacyBillsPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ blocked?: string; unpaid?: string }>
}) {
  const { workspaceId } = await params
  const { blocked, unpaid } = await searchParams
  const query = new URLSearchParams()
  if (blocked === "1") query.set("blocked", "1")
  if (unpaid === "1") query.set("unpaid", "1")
  const suffix = query.toString() ? `?${query.toString()}` : ""
  redirect(`/workspaces/${workspaceId}/invoices${suffix}`)
}
