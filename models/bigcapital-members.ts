import { randomBytes } from "crypto"
import { prisma } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/secret-crypto"
import * as bigcapital from "@/lib/integrations/bigcapital/client"
import config from "@/lib/config"

function generatePassword(): string {
  return `${randomBytes(18).toString("base64url")}Aa1!`
}

function buildMemberAliasEmail(userEmail: string, workspaceId: string): string {
  const at = userEmail.lastIndexOf("@")
  if (at < 0) return userEmail
  return `${userEmail.slice(0, at)}+wm_${workspaceId}${userEmail.slice(at)}`
}

function splitName(name: string, email: string): { firstName: string; lastName: string } {
  const parts = (name || email.split("@")[0]).trim().split(/\s+/)
  return { firstName: parts[0] || "DocuBite", lastName: parts.slice(1).join(" ") || "User" }
}

export async function getMemberAccount(workspaceId: string, userId: string) {
  return prisma.bigcapitalMemberAccount.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
}

export async function provisionMemberAccount(
  workspaceId: string,
  user: { id: string; name: string; email: string },
): Promise<void> {
  if (!config.integrations.bigcapital.enabled) return

  const wsAccount = await prisma.bigcapitalAccount.findUnique({ where: { workspaceId } })
  if (!wsAccount?.organizationId) return

  const existing = await prisma.bigcapitalMemberAccount.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  })
  if (existing) return

  const password = generatePassword()
  const aliasEmail = buildMemberAliasEmail(user.email, workspaceId)
  const { firstName, lastName } = splitName(user.name, user.email)

  const signedUp = await bigcapital.signup({ firstName, lastName, email: aliasEmail, password })

  await prisma.bigcapitalMemberAccount.create({
    data: {
      workspaceId,
      userId: user.id,
      bigcapitalUserId: signedUp.userId,
      email: aliasEmail,
      passwordEnc: encryptSecret(password),
      status: "active",
    },
  })

  const wsPassword = decryptSecret(wsAccount.passwordEnc)
  const adminSession = await bigcapital.signIn(wsAccount.email, wsPassword)
  const roles = await bigcapital.listRoles(adminSession.token, wsAccount.organizationId)
  const memberRole = roles.find((r) => r.slug === "member") ?? roles.find((r) => r.slug === "editor") ?? roles[0]
  if (memberRole) {
    await bigcapital.sendOrganizationInvite(adminSession.token, wsAccount.organizationId, aliasEmail, memberRole.id).catch((error) => {
      console.error("[bigcapital-members] invite failed:", error instanceof Error ? error.message : error)
    })
  }
}
