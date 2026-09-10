#!/usr/bin/env tsx
/**
 * Post-deploy smoke test: with DB_RLS_ENABLED=true, a SELECT scoped to workspace A must return 0
 * rows from workspace B. Run it once against production immediately after enabling RLS, then
 * whenever a migration has touched anything policy-related.
 *
 *   DATABASE_URL=... DB_RLS_ENABLED=true npx tsx scripts/verify-rls-live.ts <workspaceA> <workspaceB>
 *
 * Exits 0 on isolation confirmed, non-zero otherwise. Uses the SAME connection string the app
 * uses — never a superuser DSN — because superuser bypasses RLS by default and would mask the
 * problem the script exists to find.
 */
import { PrismaClient } from "@/prisma/client"

async function main() {
  const [wsA, wsB] = process.argv.slice(2)
  if (!wsA || !wsB) {
    console.error("Usage: verify-rls-live.ts <workspaceA-id> <workspaceB-id>")
    process.exit(2)
  }
  if (process.env.DB_RLS_ENABLED !== "true") {
    console.error("Refusing to run: DB_RLS_ENABLED must be true — this script proves the switch is on.")
    process.exit(2)
  }
  const prisma = new PrismaClient()
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.workspace_id', ${wsA}::text, true)`
      const rows = (await tx.$queryRaw`
        SELECT count(*)::int as cross_count
        FROM "Document"
        WHERE "workspaceId" = ${wsB}
      `) as Array<{ cross_count: number }>
      const crossCount = rows[0]?.cross_count ?? -1
      if (crossCount !== 0) {
        console.error(`FAIL: scoped to ${wsA}, saw ${crossCount} rows belonging to ${wsB}. RLS is not effective.`)
        process.exit(1)
      }
      console.log(`OK: scoped to ${wsA}, 0 rows visible for ${wsB}. RLS policies enforced.`)
    })
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
