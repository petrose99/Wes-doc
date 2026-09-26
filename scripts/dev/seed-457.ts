// #457 dev-only seed for the Company currency capture round (spec §6). Idempotent; re-run it
// before every round (a round never confirms a change, but a manual click might have).
//   npx tsx --env-file .env scripts/dev/seed-457.ts
//
// Org Acme Advisory (viewer = Dev user, owner of Riverside + Harbor, Member of Northwind):
//   • Harbor Lights Cafe — LS/LSL, unlocked, 14 unposted documents, Xero connected with ledger ZAR
//     → S3 Currency row (Change), S4 Change dialog (14), S7 card mismatch Owner (Switch).
//   • Riverside Bakery Co. — LS/LSL, locked 12 Sep 2026 by the first bill posted to Xero, Xero
//     connected with ledger ZAR → S5 row locked, S9 card locked.
//   • Northwind Traders — LS/LSL, unlocked, Xero connected with ledger ZAR, viewer is Member
//     → S6 row as Member (plain), S8 card mismatch non-Owner.
// Personal Maluti Supplies (af91555d) is left as it is: its Invoices queue is S10.
import { prisma } from "@/lib/db"

const HARBOR = "a74a45c2-aa1a-4f75-8fe5-80011962c57d"
const RIVERSIDE = "9cdcdf3f-9608-47a1-8495-abb1e210871c"
const NORTHWIND = "c5315ed3-053f-4dba-9821-ab1d085d405a"

async function xero(workspaceId: string, tenantName: string) {
  const existing = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider: "xero" } })
  const data = { status: "connected", tenantName, ledgerCurrency: "ZAR", ledgerCurrencyReadAt: new Date() }
  if (existing) await prisma.integrationConnection.update({ where: { id: existing.id }, data })
  else await prisma.integrationConnection.create({ data: { workspaceId, provider: "xero", providerConfigKey: "xero", externalTenantId: `seed457-${workspaceId.slice(0, 8)}`, ...data } })
}

async function main() {
  const unlocked = { country: "LS", baseCurrency: "LSL", currencyLockedAt: null, currencyLockCause: null, currencyLockProvider: null }
  await prisma.workspace.update({ where: { id: HARBOR }, data: unlocked })
  await prisma.workspace.update({ where: { id: NORTHWIND }, data: unlocked })
  await prisma.workspace.update({
    where: { id: RIVERSIDE },
    data: { country: "LS", baseCurrency: "LSL", currencyLockedAt: new Date("2026-09-12T09:00:00Z"), currencyLockCause: "bill", currencyLockProvider: "xero" },
  })
  await xero(HARBOR, "Harbor Lights (ZAR books)")
  await xero(RIVERSIDE, "Riverside Bakery (ZAR books)")
  await xero(NORTHWIND, "Northwind Traders (ZAR books)")

  // 14 unposted documents in Harbor, so the Change dialog names a count.
  let file = await prisma.documentFile.findFirst({ where: { workspaceId: HARBOR, name: "seed-457" } })
  if (!file) file = await prisma.documentFile.create({ data: { workspaceId: HARBOR, name: "seed-457" } })
  const have = await prisma.document.count({ where: { workspaceId: HARBOR, fileId: file.id } })
  for (let i = have; i < 14; i++) {
    await prisma.document.create({
      data: {
        workspaceId: HARBOR, fileId: file.id, source: "upload", status: "received",
        filename: `harbor-invoice-${i + 1}.pdf`, mimeType: "application/pdf", sizeBytes: 1024,
        sha256: `seed457-harbor-${i + 1}`, fieldSnapshot: [],
      },
    })
  }
  console.log("seed-457: Harbor (LS/LSL unlocked, 14 docs), Riverside (locked, bill/Xero), Northwind (Member); Xero ledger ZAR on all three")
}
main().finally(() => prisma.$disconnect())
