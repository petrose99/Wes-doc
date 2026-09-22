import { CompaniesScreen } from "../page"

export const dynamic = "force-dynamic"

/** #285: a deep link to one company opens Admin › Companies with that row selected and the pane
 * open — the same screen, not a separate page (the Queue-screen convention, #225). */
export default async function CompanyDeepLinkPage({ params }: { params: Promise<{ workspaceId: string; companyId: string }> }) {
  const { workspaceId, companyId } = await params
  return CompaniesScreen({ params: Promise.resolve({ workspaceId }), selectedId: companyId })
}
