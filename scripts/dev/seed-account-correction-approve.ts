// #430 dev-only seed, companion to seed-account-correction.ts: a *pending* review task for the
// same supplier ("Acme Fuel Co"), coded to a *different* account ("Fuel") than the existing
// SupplierAccountRule ("Sundry Expenses"). Approving it in the Detail pane retargets the rule
// (learnSupplierAccountRuleFromApproval) and triggers the review-approval half of Screen 1's
// trigger (checkAffectedByRuleChangeAction), which finds the already-posted "sundry-expenses"
// bill seed-account-correction.ts creates — so this script must run *after* that one, against the
// same workspace. Idempotent per filename.
//   npx tsx --env-file .env scripts/dev/seed-account-correction.ts <workspaceId>
//   npx tsx --env-file .env scripts/dev/seed-account-correction-approve.ts <workspaceId>
import { prisma } from "@/lib/db"
import { FINANCE_TEMPLATES } from "@/lib/domains/finance"
import { randomUUID } from "crypto"
import type { Prisma } from "@/prisma/client"

const INVOICE_FIELDS = FINANCE_TEMPLATES.find((t) => t.code === "invoice")!.fields
const NEW_ACCOUNT_EXTERNAL_ID = "fuel"

async function main() {
  const workspaceId = process.argv[2]
  if (!workspaceId) throw new Error("usage: seed-account-correction-approve.ts <workspaceId>")
  const file = await prisma.documentFile.findFirst({ where: { workspaceId } })
  if (!file) throw new Error("no file in workspace")
  const template = await prisma.documentTemplate.findFirst({ where: { workspaceId, code: "invoice" } })
  if (!template) throw new Error("run seed-account-correction.ts first (no invoice template)")
  const version = await prisma.documentTemplateVersion.findFirst({ where: { templateId: template.id }, orderBy: { version: "desc" } })
  const connection = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider: "quickbooks" } })
  if (!connection) throw new Error("run seed-account-correction.ts first (no connection)")

  const filename = "acme-fuel-pending-review.pdf"
  const data = {
    vendor: "Acme Fuel Co", invoice_number: "AF-9002", issue_date: "2026-09-15", due_date: "2026-10-15",
    currency_code: "USD", subtotal: 180, tax_total: 0, total: 180,
    line_items: [{ description: "Diesel — depot refuel", quantity: 1, unit_price: 180, amount: 180 }],
  }
  const codingData = { documentType: "expense", categoryConfirmed: true, items: [{ index: 0, account_external_id: NEW_ACCOUNT_EXTERNAL_ID, account_source: "manual" }] }

  let doc = await prisma.document.findFirst({ where: { workspaceId, filename } })
  if (!doc) {
    doc = await prisma.document.create({
      data: {
        id: randomUUID(), workspaceId, fileId: file.id, templateId: template.id, templateVersionId: version?.id ?? null,
        docType: "invoice", source: "seed", status: "reviewed", filename, mimeType: "application/pdf", sizeBytes: 19000,
        sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
        fieldSnapshot: INVOICE_FIELDS as unknown as Prisma.InputJsonValue, reviewedData: data as Prisma.InputJsonValue, rawExtraction: data as Prisma.InputJsonValue,
        codingData: codingData as Prisma.InputJsonValue, baseCurrencyTotal: 180,
        confidence: { fieldConfidence: Object.fromEntries(Object.keys(data).map((k) => [k, 0.95])) } as Prisma.InputJsonValue,
      },
    })
  } else {
    doc = await prisma.document.update({ where: { id: doc.id }, data: { status: "reviewed", reviewedData: data as Prisma.InputJsonValue, codingData: codingData as Prisma.InputJsonValue, baseCurrencyTotal: 180 } })
  }

  // Clear any prior task on this doc so re-running the script gives a fresh open task.
  await prisma.reviewTask.updateMany({ where: { workspaceId, documentId: doc.id, status: { in: ["open", "in_review"] } }, data: { status: "rejected" } })
  const task = await prisma.reviewTask.create({
    data: { workspaceId, documentId: doc.id, status: "open", reason: "manual", detail: "#430 dev seed: approve to retarget the account rule", createdById: null },
  })

  console.log(JSON.stringify({ documentId: doc.id, reviewTaskId: task.id, connectionId: connection.id, newAccountExternalId: NEW_ACCOUNT_EXTERNAL_ID }, null, 2))
}

main().then(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exit(1) })
