import { permanentRedirect } from "next/navigation"
import { legacyAdminTarget } from "@/lib/admin/paths"

/** #252: this address moved into Admin. A 308 so bookmarks and old links keep landing. */
export default async function LegacyRedirect({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  permanentRedirect(legacyAdminTarget(workspaceId, "settings/email")!)
}
