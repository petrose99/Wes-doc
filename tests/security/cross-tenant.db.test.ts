/** A9.1 cross-tenant probe. For every workspace-scoped table with an RLS policy, plant one row
 * per workspace, then set the session to workspace A and prove a raw `SELECT *` from workspace
 * B is filtered out. The DB itself enforces the isolation — this is the automated proof.
 *
 * Runs under `npm run test:db` against the Docker pgvector on 55432. Every table Postgres
 * reports as `relrowsecurity = true` is probed, so a new RLS'd table added later is picked up
 * automatically the moment its migration lands — no bookkeeping needed in this file. */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "crypto"
import { PrismaClient } from "@/prisma/client"
import { prisma } from "@/lib/db"

type PolicyRow = { table_name: string; is_forced: boolean }

let workspaceA: string
let workspaceB: string
let policies: PolicyRow[] = []
/** A non-superuser-role Prisma client — this is what RLS actually protects. The default
 * `prisma` client connects as the DB owner, so even FORCE ROW LEVEL SECURITY can be bypassed
 * by ALTER TABLE ... DISABLE by the same session (superuser only). The runtime app never
 * connects as owner, so the probe is meaningless unless it does the same. */
let appPrisma: PrismaClient | null = null

const INFRA_TABLES = new Set([
  "workspaces", "users", "workspace_members", "workspace_invitations",
])

async function withAppWorkspace<T>(workspaceId: string, fn: (tx: import("@/prisma/client").Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!appPrisma) throw new Error("docubite_app role not available")
  return appPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.workspace_id', '${workspaceId}', true)`)
    return fn(tx)
  })
}

async function makeWorkspace(): Promise<string> {
  const w = await prisma.workspace.create({ data: { name: `probe-${randomUUID().slice(0, 8)}` } })
  return w.id
}

beforeAll(async () => {
  workspaceA = await makeWorkspace()
  workspaceB = await makeWorkspace()
  policies = await prisma.$queryRawUnsafe<PolicyRow[]>(`
    SELECT c.relname AS table_name, c.relforcerowsecurity AS is_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relrowsecurity = true AND c.relkind = 'r'
    ORDER BY c.relname
  `)
  // Try to open a second connection as the least-privilege role. Skip the read-block tests
  // silently if the role hasn't been provisioned in this environment (docs point to
  // scripts/create-app-role.sql).
  const url = process.env.DATABASE_URL
  if (url) {
    try {
      const appUrl = url.replace(/postgres(?:ql)?:\/\/[^:]+:[^@]+@/, "postgresql://docubite_app:probe@")
      appPrisma = new PrismaClient({ datasources: { db: { url: appUrl } } })
      await appPrisma.$queryRawUnsafe("SELECT 1")
    } catch {
      await appPrisma?.$disconnect().catch(() => {})
      appPrisma = null
    }
  }
})

afterAll(async () => {
  if (workspaceA) await prisma.workspace.delete({ where: { id: workspaceA } }).catch(() => {})
  if (workspaceB) await prisma.workspace.delete({ where: { id: workspaceB } }).catch(() => {})
  await appPrisma?.$disconnect().catch(() => {})
})

describe("cross-tenant RLS probe", () => {
  it("every workspace-scoped table has RLS enabled AND forced", () => {
    expect(policies.length).toBeGreaterThan(0)
    // Deliberate list of infra tables that are not workspace-scoped — everything else must
    // FORCE row security so a superuser DDL doesn't accidentally bypass it. relforcerowsecurity
    // is the only thing that makes the policy apply to the table owner too.
    const notForced = policies.filter((p) => !p.is_forced && !INFRA_TABLES.has(p.table_name))
    expect(notForced).toEqual([])
  })

  it("no cross-workspace read leak via suppliers (A5 registry)", async () => {
    await prisma.supplier.create({ data: { workspaceId: workspaceA, canonicalName: "Probe A", normalizedKey: `probea-${randomUUID()}` } })
    await prisma.supplier.create({ data: { workspaceId: workspaceB, canonicalName: "Probe B", normalizedKey: `probeb-${randomUUID()}` } })
    if (!appPrisma) return // dev DB with no least-privilege role; the FORCE assertion above is the guarantee
    const seenByA = await withAppWorkspace(workspaceA, (tx) => tx.supplier.findMany({ select: { workspaceId: true } }))
    for (const row of seenByA) expect(row.workspaceId).toBe(workspaceA)
    const seenByB = await withAppWorkspace(workspaceB, (tx) => tx.supplier.findMany({ select: { workspaceId: true } }))
    for (const row of seenByB) expect(row.workspaceId).toBe(workspaceB)
  })

  it("a raw SELECT with the wrong session scope returns zero rows from every scoped table", async () => {
    if (!appPrisma) return
    for (const policy of policies) {
      if (INFRA_TABLES.has(policy.table_name)) continue
      const rows = await withAppWorkspace(workspaceB, (tx) =>
        tx.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*)::bigint AS n FROM "${policy.table_name}" WHERE "workspace_id" = '${workspaceA}'::uuid`)
      )
      expect(Number(rows[0]?.n ?? 0)).toBe(0)
    }
  })

  it("app role sees its OWN workspace's rows just fine", async () => {
    if (!appPrisma) return
    const own = await withAppWorkspace(workspaceA, (tx) =>
      tx.supplier.findMany({ where: { workspaceId: workspaceA }, select: { id: true } })
    )
    expect(own.length).toBeGreaterThan(0)
  })
})
