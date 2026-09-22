// #225 dev-only seed: purchase orders, bank statements, and two escalated checks so every Queue
// screen has rows. `npx tsx --env-file .env scripts/dev/seed-queue-extras.ts <workspaceId>`.
import { prisma } from "@/lib/db"
import { randomUUID } from "crypto"

const PO_FIELDS = [
  { key: "vendor", label: "Vendor", type: "string", instruction: "", required: true },
  { key: "po_number", label: "PO Number", type: "string", instruction: "", required: true },
  { key: "issue_date", label: "Issue Date", type: "date", instruction: "", required: true },
  { key: "total", label: "Total", type: "number", instruction: "", required: true },
  { key: "currency_code", label: "Currency", type: "string", instruction: "", required: false },
]
const BANK_FIELDS = [
  { key: "account_holder", label: "Account holder", type: "string", instruction: "", required: true },
  { key: "period_start", label: "Period start", type: "date", instruction: "", required: true },
  { key: "period_end", label: "Period end", type: "date", instruction: "", required: true },
  { key: "closing_balance", label: "Closing balance", type: "number", instruction: "", required: true },
]

async function main() {
  const workspaceId = process.argv[2]
  const file = await prisma.documentFile.findFirst({ where: { workspaceId } })
  if (!file) throw new Error("no file")
  const ensureTemplate = async (code: string, name: string, documentType: string, fields: unknown) => {
    let t = await prisma.documentTemplate.findFirst({ where: { workspaceId, code } })
    if (!t) t = await prisma.documentTemplate.create({ data: { workspaceId, fileId: file.id, code, name, documentType, isSystem: true, multiRow: false, versions: { create: { version: 1, fields: fields as never } } } })
    const v = await prisma.documentTemplateVersion.findFirst({ where: { templateId: t.id }, orderBy: { version: "desc" } })
    return { t, v }
  }
  const po = await ensureTemplate("purchase_order", "Purchase Order", "purchase_order", PO_FIELDS)
  const bank = await ensureTemplate("bank_statement", "Bank Statement", "bank_statement", BANK_FIELDS)
  const pos = [
    { vendor: "Acme Corp", po_number: "PO-1042", issue_date: "2026-07-01", total: 5175, currency_code: "USD", status: "reviewed" },
    { vendor: "Northwind Traders", po_number: "PO-1043", issue_date: "2026-08-22", total: 2890, currency_code: "USD", status: "needs_review" },
    { vendor: "Globex", po_number: "PO-1044", issue_date: "2026-09-02", total: 760, currency_code: "EUR", status: "ready_for_review" },
  ]
  for (const p of pos) {
    const { status, ...data } = p
    await prisma.document.create({ data: { id: randomUUID(), workspaceId, fileId: file.id, templateId: po.t.id, templateVersionId: po.v?.id ?? null, docType: "purchase_order", source: "seed", status, filename: `${p.vendor.toLowerCase().replace(/\s+/g, "-")}-${p.po_number}.pdf`, mimeType: "application/pdf", sizeBytes: 40000, sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""), fieldSnapshot: PO_FIELDS as never, reviewedData: data as never, rawExtraction: data as never, confidence: { fieldConfidence: Object.fromEntries(Object.keys(data).map((k) => [k, 0.9])) } as never } })
  }
  const banks = [
    { account_holder: "DocuBite Ltd", period_start: "2026-08-01", period_end: "2026-08-31", closing_balance: 18420.55, status: "reviewed" },
    { account_holder: "DocuBite Ltd", period_start: "2026-07-01", period_end: "2026-07-31", closing_balance: 12980.1, status: "needs_review" },
  ]
  for (const b of banks) {
    const { status, ...data } = b
    await prisma.document.create({ data: { id: randomUUID(), workspaceId, fileId: file.id, templateId: bank.t.id, templateVersionId: bank.v?.id ?? null, docType: "bank_statement", source: "seed", status, filename: `statement-${b.period_start.slice(0, 7)}.pdf`, mimeType: "application/pdf", sizeBytes: 90000, sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""), fieldSnapshot: BANK_FIELDS as never, reviewedData: data as never, rawExtraction: data as never, codingData: { documentType: "bank_statement" } as never, confidence: { fieldConfidence: Object.fromEntries(Object.keys(data).map((k) => [k, 0.88])) } as never } })
  }
  // Two escalated checks on existing invoices → Exceptions rows
  const invoices = await prisma.document.findMany({ where: { workspaceId, template: { code: "invoice" } }, take: 2, orderBy: { createdAt: "asc" } })
  for (const [i, doc] of invoices.entries()) {
    await prisma.documentCheckResult.create({ data: { workspaceId, documentId: doc.id, checkCode: i === 0 ? "invoice_arithmetic" : "duplicate", status: "escalated", message: i === 0 ? "Line items sum to 4,500.00 but the subtotal reads 4,450.00" : "Same supplier and amount as INV-2026-001 received 3 days apart", detail: { fields: ["subtotal"] } as never, escalationStatus: i === 0 ? "open" : "in_review" } })
  }
  console.log("seeded extra rows")
}
main().finally(() => prisma.$disconnect())
