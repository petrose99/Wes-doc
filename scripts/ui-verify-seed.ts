/** Seed a confirmed test user + workspace for UI verification of the /settings/automation page.
 * Prints the credentials so the browser can sign in. Idempotent — safe to re-run. */
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

const { prisma } = await import("@/lib/db")

const EMAIL = "ui-verify@docubite.local"
const PASSWORD = "UiVerify-P@ssw0rd-2026"

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // 1. Confirmed Supabase user
  const existing = await supabase.auth.admin.listUsers()
  let authUser = existing.data.users.find((u) => u.email === EMAIL)
  if (!authUser) {
    const created = await supabase.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: "UI verify" } })
    if (created.error) throw new Error(`createUser failed: ${created.error.message}`)
    authUser = created.data.user
    console.log("Created Supabase user:", authUser?.id)
  } else {
    // Rotate password so we know it matches.
    await supabase.auth.admin.updateUserById(authUser.id, { password: PASSWORD, email_confirm: true })
    console.log("Reset password on existing Supabase user:", authUser.id)
  }
  const userId = authUser!.id

  // 2. Mirror row in our own users table (needed by workspace membership FKs).
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: EMAIL, name: "UI verify" },
    update: { email: EMAIL, name: "UI verify" },
  })

  // 3. A workspace + owner membership.
  let membership = await prisma.workspaceMember.findFirst({ where: { userId, role: "owner" }, include: { workspace: true } })
  if (!membership) {
    const workspace = await prisma.workspace.create({ data: { id: randomUUID(), name: "UI Verify Workspace" } })
    membership = await prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId, role: "owner" },
      include: { workspace: true },
    })
    console.log("Created workspace:", workspace.id)
  } else {
    console.log("Using existing workspace:", membership.workspaceId)
  }

  console.log("")
  console.log("Sign in with:")
  console.log(`  email:    ${EMAIL}`)
  console.log(`  password: ${PASSWORD}`)
  console.log("")
  console.log(`Then visit: /workspaces/${membership.workspaceId}/settings/automation`)
  console.log(`WORKSPACE_ID=${membership.workspaceId}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
