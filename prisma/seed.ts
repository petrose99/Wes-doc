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
 * "add a company" click first. Idempotent: every item is looked up by name before it is created. */
async function seedDevBypassOrganization() {
  const user = await prisma.user.upsert({
    where: { email: DEV_BYPASS_USER.email },
    create: { id: DEV_BYPASS_USER.id, email: DEV_BYPASS_USER.email, name: DEV_BYPASS_USER.name, role: "user", emailVerified: true },
    update: {},
  })

  // Every item below is checked by name, so re-seeding adds nothing a previous run already made.
  // Personal workspace → Companies state (c).
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } })
  if (memberships.length === 0) await createWorkspaceForUser(user)

  // #285: the Companies screen has three page states and two pane variants; each needs a row the
  // capture round can navigate to.
  //   (a) Acme Advisory — Riverside Bakery Co. (owner) + Harbor Lights Cafe (owner) + Northwind
  //       Traders (member only, owned by a Prisma-only user — the non-owner pane and the hidden
  //       "k more in ‹org›" line when the row is filtered out);
  //   (b) Pine Street Consulting — an ungrouped team workspace the dev user owns: opening its
  //       Companies page shows "Name your organization", and from Acme it is the Move candidate;
  //   (c) the personal workspace above.
  const organization = await prisma.organization.findFirst({ where: { name: "Acme Advisory", members: { some: { userId: user.id } } } })
    ?? (await createOrganization("Acme Advisory", user.id))
  const ownedCompanies: { name: string; country: string; baseCurrency: string }[] = [
    { name: "Riverside Bakery Co.", country: "LS", baseCurrency: "LSL" },
    { name: "Harbor Lights Cafe", country: "ZA", baseCurrency: "ZAR" },
  ]
  for (const company of ownedCompanies) {
    const existing = await prisma.workspace.findFirst({ where: { organizationId: organization.id, name: company.name } })
    if (!existing) await addCompanyToOrganization(organization.id, user.id, company)
  }

  // Northwind's owner is a Prisma-only user (no Supabase identity — nobody signs in as them), so
  // this part runs on a sandbox without Supabase env, where the demo accounts above are skipped.
  const northwindOwner = await prisma.user.upsert({
    where: { email: "northwind-owner@docubite.local" },
    create: { email: "northwind-owner@docubite.local", name: "Priya Naidoo", role: "user", emailVerified: true },
    update: {},
  })
  const northwind = await prisma.workspace.findFirst({ where: { organizationId: organization.id, name: "Northwind Traders" } })
    ?? (await addCompanyToOrganization(organization.id, northwindOwner.id, { name: "Northwind Traders", country: "ZA", baseCurrency: "ZAR" }))
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: northwind.id, userId: user.id } },
    create: { workspaceId: northwind.id, userId: user.id, role: "member" },
    update: {},
  })

  const ungrouped = await prisma.workspace.findFirst({ where: { organizationId: null, kind: "team", name: "Pine Street Consulting", members: { some: { userId: user.id, role: "owner" } } } })
  if (!ungrouped) await createWorkspaceForUser(user, { name: "Pine Street Consulting", kind: "team", country: "LS", baseCurrency: "LSL" })
}

async function main() {
  // These are known credentials with an admin account among them. Seeding them into a real
  // deployment would hand anyone who reads this file an admin login.
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_ACCOUNTS !== "true") {
    throw new Error("Refusing to seed demo accounts in production. Set SEED_DEMO_ACCOUNTS=true if this is genuinely what you want.")
  }

  // The demo accounts need the Supabase admin API; a local sandbox without it (DEV_AUTH_BYPASS
  // only) still gets the dev-bypass organization below, which is what the UI capture rounds use.
  const seeded = []
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    for (const account of ACCOUNTS) seeded.push(await seedAccount(account))
  } else {
    console.log("Supabase env not set — skipping demo accounts; seeding the dev-bypass organization only.")
  }
  await seedDevBypassOrganization()

  console.log("\nSeeded accounts:\n")
  for (const row of seeded) console.log(`  ${row.email.padEnd(30)} ${row.password.padEnd(24)} ${row.role}`)
  console.log("")
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
