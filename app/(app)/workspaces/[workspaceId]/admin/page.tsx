import { permanentRedirect } from "next/navigation"
import { adminPaths } from "@/lib/admin/paths"

/** The Admin rail item lands on Configuration — the section an owner opens most. */
export default async function AdminIndex({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  permanentRedirect(adminPaths(workspaceId).configuration)
}
