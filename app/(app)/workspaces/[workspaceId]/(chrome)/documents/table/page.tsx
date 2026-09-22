import { redirect } from "next/navigation"
import { documentDestinationPath } from "@/lib/typed-destinations"
import { getWorkspaceDocument } from "@/models/documents"

// The review table grew into the full-screen extraction sheet, which now lives inside a file.
// Old links no longer name a file, so land on the Files list.
export default async function LegacyTablePage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ documentId?: string; id?: string }>
}) {
  const { workspaceId } = await params
  const { documentId, id } = await searchParams
  const legacyDocumentId = documentId ?? id
  if (legacyDocumentId) {
    const document = await getWorkspaceDocument(workspaceId, legacyDocumentId)
    if (document) redirect(documentDestinationPath(`/workspaces/${workspaceId}`, document))
  }
  redirect(`/workspaces/${workspaceId}/library`)
}
