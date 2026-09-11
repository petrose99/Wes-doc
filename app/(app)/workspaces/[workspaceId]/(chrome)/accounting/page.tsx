import { redirect } from "next/navigation"

/** /accounting was renamed to /finance so the surface reads as a first-class destination that
 * covers the in-house ledger plus future integrations, not a category label. Kept as a permanent
 * redirect to keep old bookmarks, mail links, and integration callbacks working. */
export default async function AccountingRedirectPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const [{ workspaceId }, { error }] = await Promise.all([params, searchParams])
  redirect(`/workspaces/${workspaceId}/finance${error ? `?error=${encodeURIComponent(error)}` : ""}`)
}
