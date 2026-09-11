import { redirect } from "next/navigation"

/** /files was renamed to /worksheets so the URL matches what the user sees in the rail. Old bookmarks,
 * share links, and integration callbacks land here and forward on, query string preserved. */
export default async function FilesRedirectPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams])
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v))
    else qs.append(key, value)
  }
  const suffix = qs.toString()
  redirect(`/workspaces/${workspaceId}/worksheets${suffix ? `?${suffix}` : ""}`)
}
