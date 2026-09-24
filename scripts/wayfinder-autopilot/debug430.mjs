import { prisma } from "@/lib/db"
const workspaceId = "af91555d-7450-4b21-a8ac-73db092617c8"
const doc = await prisma.document.findFirst({ where: { id: "570d8e7a-479b-41ee-9fe5-e10c9415d3d8" }, select: { id: true, status: true, paymentStatus: true, reviewedData: true, rawExtraction: true, codingData: true, accountCorrectionDismissedAt: true } })
console.log(JSON.stringify(doc, null, 2))
const rules = await prisma.supplierAccountRule.findMany({ where: { workspaceId }, select: { supplierName: true, accountExternalId: true } })
console.log(JSON.stringify(rules, null, 2))
await prisma.$disconnect()
