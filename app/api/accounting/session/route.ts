import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/secret-crypto"
import * as bigcapital from "@/lib/integrations/bigcapital/client"
import { requireWorkspaceRole } from "@/models/workspaces"

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId")
  if (!workspaceId) return NextResponse.json({ error: "missing workspaceId" }, { status: 400 })

  try {
    const user = await getCurrentUser()
    await requireWorkspaceRole(workspaceId, user.id)

    const account = await prisma.bigcapitalAccount.findUnique({ where: { workspaceId } })
    if (!account || !account.organizationId) {
      return NextResponse.redirect(new URL(`/workspaces/${workspaceId}/accounting?error=no_connection`, req.url))
    }

    const password = decryptSecret(account.passwordEnc)
    const session = await bigcapital.signIn(account.email, password)

    const webappUrl = config.integrations.bigcapital.webappUrl
    const payload = encodeURIComponent(JSON.stringify({ token: session.token, organizationId: session.organizationId }))

    return NextResponse.redirect(`${webappUrl}/auth-bridge.html#${payload}`)
  } catch {
    return NextResponse.redirect(new URL(`/workspaces/${workspaceId}/accounting?error=sign_in_failed`, req.url))
  }
}
