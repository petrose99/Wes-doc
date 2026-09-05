import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { decryptSecret } from "@/lib/secret-crypto"
import * as bigcapital from "@/lib/integrations/bigcapital/client"
import { isValidRedirectPath } from "@/lib/integrations/bigcapital/redirect-validator"
import { requireWorkspaceRole } from "@/models/workspaces"
import { getMemberAccount } from "@/models/bigcapital-members"

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

    const memberAccount = await getMemberAccount(workspaceId, user.id)
    const loginEmail = memberAccount?.status === "active" ? memberAccount.email : account.email
    const loginPassword = memberAccount?.status === "active" ? decryptSecret(memberAccount.passwordEnc) : decryptSecret(account.passwordEnc)
    const session = await bigcapital.signIn(loginEmail, loginPassword)

    const redirectPath = req.nextUrl.searchParams.get("redirectPath")
    const safeRedirectPath = redirectPath && isValidRedirectPath(redirectPath) ? redirectPath : null

    const webappUrl = config.integrations.bigcapital.webappUrl
    const returnUrl = new URL(`/workspaces/${workspaceId}`, req.url).toString()
    const payload = encodeURIComponent(JSON.stringify({
      token: session.token,
      organizationId: session.organizationId,
      returnUrl,
      ...(safeRedirectPath ? { redirectPath: safeRedirectPath } : {}),
    }))

    return NextResponse.redirect(`${webappUrl}/auth-bridge.html#${payload}`)
  } catch {
    return NextResponse.redirect(new URL(`/workspaces/${workspaceId}/accounting?error=sign_in_failed`, req.url))
  }
}
