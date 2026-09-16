/** Demo and admin accounts for a local install.
 *
 * Deliberately talks to Prisma directly instead of going through lib/auth.ts. That module pulls
 * in next/headers, which throws the moment it is imported outside a request — so the "correct"
 * route of calling getViewerUser cannot run under tsx at all. What it does instead is provision
 * both halves by hand: a Supabase identity via the admin API (real password, email pre-confirmed
 * — these are synthetic accounts, not migrated ones, so there is no reset flow to route them
 * through) and the matching local User row, linked by supabaseUserId exactly the way
 * resolveOrProvisionUser links a real sign-up.
 *
 * Run with: npm run db:seed  (dev server stopped — the local PGlite database takes one connection)
 */
import { createAdminClient } from "@/lib/supabase/server"
import { createWorkspaceForUser } from "@/models/workspaces"
import { createOrganization, addCompanyToOrganization } from "@/models/organizations"
import { drainProvisionJobs } from "@/models/bigcapital"
import { prisma } from "@/lib/db"
import { DEV_BYPASS_USER } from "@/lib/supabase/dev-bypass"

type DemoAccount = { email: string; name: string; role: string; password: string }

/** Fixed, obviously-local passwords: the point of a demo account is that someone can sign in
 * without going hunting, and these only ever exist on a developer's machine. The production
 * guard below is what keeps them there. */
const ACCOUNTS: DemoAccount[] = [
  { email: "admin@docubite.local", name: "DocuBite Admin", role: "admin", password: "admin-docubite-2026" },
  { email: "demo@docubite.local", name: "Demo User", role: "user", password: "demo-docubite-2026" },
]

/** Provisions (or updates) the Supabase Auth identity for one demo account, returning its
 * supabaseUserId. Looked up by the LOCAL row's already-linked id first, not by asking Supabase to
 * search by email — that keeps this idempotent without needing a second Supabase API round trip
 * on every re-run, and re-running re-syncs the password so a changed ACCOUNTS entry (or a demo
 * password fiddled with by hand) never goes stale. */
async function upsertSupabaseIdentity(email: string, password: string, name: string): Promise<string> {
  const admin = createAdminClient()
  const existing = await prisma.user.findUnique({ where: { email }, select: { supabaseUserId: true } })
  if (existing?.supabaseUserId) {
    await admin.auth.admin.updateUserById(existing.supabaseUserId, { password })
    return existing.supabaseUserId
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
  if (error || !data.user) throw new Error(`Could not create Supabase user for ${email}: ${error?.message}`)
  return data.user.id
}

async function seedAccount(account: DemoAccount) {
  const supabaseUserId = await upsertSupabaseIdentity(account.email, account.password, account.name)
  const user = await prisma.user.upsert({
    where: { email: account.email },
    create: { email: account.email, name: account.name, role: account.role, emailVerified: true, supabaseUserId },
    update: { name: account.name, role: account.role, supabaseUserId },
  })

  // createWorkspaceForUser also seeds the starter file and worksheets a real sign-up gets, so a
  // demo account opens on a working sheet rather than an empty shell. Only on the first run:
  // re-seeding must not hand the account a second workspace every time.
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } })
  if (!membership) await createWorkspaceForUser(user)

  return { email: account.email, password: account.password, role: account.role }
}

/** #254/#287: DEV_AUTH_BYPASS always resolves to this fixed identity (lib/supabase/dev-bypass.ts),
 * whose personal workspace is normally provisioned lazily on first request. That leaves it in
 * exactly one workspace, which can't exercise a switcher, Companies, Users or the Dashboard
 * rollups — all of which only render past ≥2 memberships. Seed it a second, org-grouped
 * workspace up front so #285/#286/#287 have something to point Playwright at without a manual
 * "add a company" click first. Idempotent: skips once the user already has ≥2 memberships. */
async function seedDevBypassOrganization() {
  const user = await prisma.user.upsert({
    where: { email: DEV_BYPASS_USER.email },
    create: { id: DEV_BYPASS_USER.id, email: DEV_BYPASS_USER.email, name: DEV_BYPASS_USER.name, role: "user", emailVerified: true },
    update: {},
  })

  const memberships = await prisma.workspaceMember.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } })
  if (memberships.length === 0) await createWorkspaceForUser(user)
  if (memberships.length >= 2) return

  const organization = await prisma.organization.findFirst({ where: { name: "Acme Advisory", members: { some: { userId: user.id } } } })
    ?? (await createOrganization("Acme Advisory", user.id))
  const existingCompany = await prisma.workspace.findFirst({ where: { organizationId: organization.id, members: { some: { userId: user.id } } } })
  if (!existingCompany) await addCompanyToOrganization(organization.id, user.id, { name: "Riverside Bakery Co.", country: "US", baseCurrency: "USD" })
}

async function main() {
  // These are known credentials with an admin account among them. Seeding them into a real
  // deployment would hand anyone who reads this file an admin login.
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_ACCOUNTS !== "true") {
    throw new Error("Refusing to seed demo accounts in production. Set SEED_DEMO_ACCOUNTS=true if this is genuinely what you want.")
  }

  const seeded = []
  for (const account of ACCOUNTS) seeded.push(await seedAccount(account))
  await seedDevBypassOrganization()

  console.log("\nSeeded accounts:\n")
  for (const row of seeded) console.log(`  ${row.email.padEnd(30)} ${row.password.padEnd(24)} ${row.role}`)
  console.log("")

  // Process any pending Bigcapital provisioning jobs inline (normally handled by the job worker).
  // Best-effort: if the Bigcapital containers aren't running, this silently skips.
  try {
    const processed = await drainProvisionJobs()
    if (processed > 0) console.log(`Provisioned ${processed} Bigcapital organization(s).\n`)
  } catch (error) {
    console.log("Bigcapital provisioning skipped (containers not running?).\n")
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
