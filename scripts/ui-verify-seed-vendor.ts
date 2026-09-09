/** Add vendor coding history to the ui-verify workspace so /coding-history has content. */
import { randomUUID } from "node:crypto"

const { prisma } = await import("@/lib/db")

const EMAIL = "ui-verify@docubite.local"

async function main() {
  const user = await prisma.user.findFirstOrThrow({ where: { email: EMAIL } })
  const membership = await prisma.workspaceMember.findFirstOrThrow({ where: { userId: user.id, role: "owner" }, include: { workspace: true } })
  const workspaceId = membership.workspaceId

  // A file to hang templates + documents off.
  const file = await prisma.documentFile.create({ data: { workspaceId, name: "vendor-history-seed", createdById: user.id } })
  const template = await prisma.documentTemplate.upsert({
    where: { fileId_code: { fileId: file.id, code: "invoice" } },
    create: { workspaceId, code: "invoice", name: "Invoice", fileId: file.id, documentType: "invoice" },
    update: {},
  })

  const vendors: Array<{ supplier: string; coding: Record<string, string>; count: number }> = [
    { supplier: "Acme Ltd", coding: { account: "6000", taxCode: "T1" }, count: 5 },
    { supplier: "BrightPeak Design", coding: { account: "6100", taxCode: "T1" }, count: 4 },
    { supplier: "Cedar Valley Coffee", coding: { account: "7020" }, count: 3 },
    { supplier: "One-off Vendor", coding: { account: "9999" }, count: 1 }, // below threshold
  ]

  for (const v of vendors) {
    for (let i = 0; i < v.count; i++) {
      await prisma.document.create({
        data: {
          workspaceId, fileId: file.id, templateId: template.id, source: "upload",
          filename: `${v.supplier}-${i}.pdf`, mimeType: "application/pdf", sizeBytes: 1,
          sha256: randomUUID().replace(/-/g, ""),
          status: "reviewed", receivedAt: new Date(), fieldSnapshot: {},
          reviewedData: { vendor: v.supplier, total: 100 * (i + 1) },
          codingData: v.coding,
          codingSource: "manual",
        },
      })
    }
  }

  console.log(`Seeded ${vendors.reduce((n, v) => n + v.count, 0)} confirmed docs across ${vendors.length} vendors`)
  console.log(`Visit: /workspaces/${workspaceId}/coding-history`)
}

main().catch((e) => { console.error(e); process.exit(1) })
