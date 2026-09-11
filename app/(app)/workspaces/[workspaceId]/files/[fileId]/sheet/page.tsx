import { redirect } from "next/navigation"

export default async function SheetRedirectPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; fileId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ workspaceId, fileId }, query] = await Promise.all([params, searchParams])
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v))
    else qs.append(key, value)
  }
  const suffix = qs.toString()
  redirect(`/workspaces/${workspaceId}/worksheets/${fileId}/sheet${suffix ? `?${suffix}` : ""}`)
}
