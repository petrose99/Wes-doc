import { redirect } from "next/navigation"

export default async function FileHubRedirectPage({ params }: { params: Promise<{ workspaceId: string; fileId: string }> }) {
  const { workspaceId, fileId } = await params
  redirect(`/workspaces/${workspaceId}/worksheets/${fileId}`)
}
