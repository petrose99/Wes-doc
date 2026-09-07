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
    const useMember = memberAccount?.status === "active"
    const loginEmail = useMember ? memberAccount.email : account.email
    let loginPassword: string
    try {
      loginPassword = decryptSecret(useMember ? memberAccount.passwordEnc : account.passwordEnc)
    } catch {
      // The stored password was encrypted with an old SECRETS_ENCRYPTION_KEY that no longer decrypts —
      // the connection row still says "active" but signing in from it is now impossible. Surface the
      // real reason instead of the generic sign_in_failed so the page can offer a Reset action.
      return NextResponse.redirect(new URL(`/workspaces/${workspaceId}/accounting?error=stale_credentials`, req.url))
    }
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
