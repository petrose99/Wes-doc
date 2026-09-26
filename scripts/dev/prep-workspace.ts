// Make a dev workspace fit for a capture round, idempotently:
//   npx tsx --env-file .env scripts/dev/prep-workspace.ts <workspaceId>
// (or `node scripts/dev/dev.mjs prep <ws>` / `start <ws>`).
// #266 G2: the dev workspace's jurisdictionCode was null, every upload failed,
// and two sessions chased the failing probes before finding it.
import { prisma } from "@/lib/db"

const workspaceId = process.argv[2]
if (!workspaceId) { console.error("usage: prep-workspace.ts <workspaceId>"); process.exit(2) }

const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true, jurisdictionCode: true } })
if (!ws) { console.error(`prep: workspace ${workspaceId} not found`); process.exit(1) }
const fixes: string[] = []
if (!ws.jurisdictionCode) {
  await prisma.workspace.update({ where: { id: ws.id }, data: { jurisdictionCode: "US" } })
  fixes.push("jurisdictionCode null → US")
}
console.log(`prep ${ws.name} (${ws.id}): ${fixes.length ? fixes.join(", ") : "nothing to fix"}`)
await prisma.$disconnect()
