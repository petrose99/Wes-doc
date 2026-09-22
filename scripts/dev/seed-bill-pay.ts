// #251 dev-only seed: enough Approved, unpaid invoices for Bill Pay and Payment Batches to render
// live, on suppliers with real payment terms. Idempotent per filename / supplier / account.
//   npx tsx --env-file .env scripts/dev/seed-bill-pay.ts <workspaceId> [--reset]
// --reset also clears the workspace's payment batches, payment records and Bill Pay preferences
// so the verification flows start from an empty Payment Batches queue.
//
// What it creates, in one workspace (all invoices `reviewed`, no open ReviewTask — Approved):
//   • Payer accounts "Operating account" (Standard Bank ····4321, ZAR, default) and "USD account"
//     (FNB ····8801, USD).
//   • Supplier Cape Office Supply — 2/10 net 30, bank account set. CO-1201 issued 5 days ago,
//     R 4,380.00 (inside the discount window: 5 days left, R 87.60 off); CO-1188 issued 40 days
//     ago, R 1,250.00, 10 days overdue, discount lapsed.
//   • Supplier Bergrivier Logistics — net 30, bank account set, no discount. BL-7702 issued 12
//     days ago, R 9,900.00; BL-7688 issued 70 days ago, R 2,150.00 (40 days overdue).
//   • Supplier Winelands Catering — net 30, bank account set. WC-0093 issued 8 days ago, R 3,120.00
//     (left unbatched by the verification flow so the Create batch dialog always has a row).
//   • Supplier Karoo Print Works — net 14, NO bank account. KP-311 issued 3 days ago, R 680.00
//     → "Needs bank details", undecidable.
//   • Supplier Northwind Traders already exists from seed-po-mismatch (USD); NW-5490 there is
//     reviewed with total 125 USD, so a mixed-currency selection splits into two batches.
import { prisma } from "@/lib/db"
import { FINANCE_TEMPLATES } from "@/lib/domains/finance"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"
import { randomUUID } from "crypto"
import { Prisma } from "@/prisma/client"

const INVOICE_FIELDS = FINANCE_TEMPLATES.find((t) => t.code === "invoice")!.fields
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const daysAhead = (n: number) => daysAgo(-n)

async function main() {
  const workspaceId = process.argv[2]
  if (!workspaceId) throw new Error("usage: seed-bill-pay.ts <workspaceId>")
  const file = await prisma.documentFile.findFirst({ where: { workspaceId } })
  if (!file) throw new Error("no file in workspace")
  if (process.argv[3] === "--reset") {
    await prisma.invoicePayment.deleteMany({ where: { workspaceId } })
    await prisma.paymentRunItem.deleteMany({ where: { workspaceId } })
    await prisma.paymentRun.deleteMany({ where: { workspaceId } })
    await prisma.billPayPreference.deleteMany({ where: { workspaceId } })
    console.log("reset payment batches, records and preferences")
  }

  let template = await prisma.documentTemplate.findFirst({ where: { workspaceId, code: "invoice" } })
  if (!template) template = await prisma.documentTemplate.create({ data: { workspaceId, fileId: file.id, code: "invoice", name: "Invoice", documentType: "invoice", isSystem: true, multiRow: true, versions: { create: { version: 1, fields: INVOICE_FIELDS as never } } } })
  const version = await prisma.documentTemplateVersion.findFirst({ where: { templateId: template.id }, orderBy: { version: "desc" } })

  const ensureAccount = async (name: string, bankName: string, lastFour: string, currencyCode: string, isDefault: boolean) => {
    const existing = await prisma.payerAccount.findFirst({ where: { workspaceId, name } })
    if (existing) return existing.id
    const account = await prisma.payerAccount.create({ data: { workspaceId, name, bankName, lastFour, currencyCode, isDefault } })
    return account.id
  }
  await ensureAccount("Operating account", "Standard Bank", "4321", "ZAR", true)
  await ensureAccount("USD account", "FNB", "8801", "USD", false)

  const ensureSupplier = async (name: string, terms: { net: number | null; pct: number | null; days: number | null }, bank: { account: string; branchCode: string } | null) => {
    const normalizedKey = normalizeSupplierName(name)
    const data = { paymentTermsDays: terms.net, earlyPaymentDiscountPercent: terms.pct, earlyPaymentDiscountDays: terms.days, bankDetails: bank ? (bank as Prisma.InputJsonValue) : Prisma.JsonNull }
    const existing = await prisma.supplier.findFirst({ where: { workspaceId, normalizedKey } })
    if (existing) { await prisma.supplier.update({ where: { id: existing.id }, data }); return existing.id }
    const supplier = await prisma.supplier.create({ data: { workspaceId, canonicalName: name, normalizedKey, ...data } })
    return supplier.id
  }
  await ensureSupplier("Cape Office Supply", { net: 30, pct: 2, days: 10 }, { account: "62011223344", branchCode: "051001" })
  await ensureSupplier("Bergrivier Logistics", { net: 30, pct: null, days: null }, { account: "1029384756", branchCode: "198765" })
  await ensureSupplier("Karoo Print Works", { net: 14, pct: null, days: null }, null)
  await ensureSupplier("Winelands Catering", { net: 30, pct: null, days: null }, { account: "4098765432", branchCode: "250655" })

  const createInvoice = async (input: { filename: string; vendor: string; number: string; issued: string; due?: string; total: number; currency: string }) => {
    const data = { vendor: input.vendor, invoice_number: input.number, issue_date: input.issued, ...(input.due ? { due_date: input.due } : {}), currency_code: input.currency, subtotal: input.total, tax_total: 0, total: input.total, line_items: [{ description: "Services", quantity: 1, unit_price: input.total, amount: input.total }] }
    const existing = await prisma.document.findFirst({ where: { workspaceId, filename: input.filename }, select: { id: true } })
    if (existing) {
      await prisma.document.update({ where: { id: existing.id }, data: { reviewedData: data as Prisma.InputJsonValue, rawExtraction: data as Prisma.InputJsonValue, status: "reviewed", reviewedAt: new Date() } })
      return existing.id
    }
    const doc = await prisma.document.create({
      data: {
        id: randomUUID(), workspaceId, fileId: file.id, templateId: template!.id, templateVersionId: version?.id ?? null,
        docType: "invoice", source: "seed", status: "reviewed", reviewedAt: new Date(), filename: input.filename, mimeType: "application/pdf", sizeBytes: 42000,
        sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
        fieldSnapshot: INVOICE_FIELDS as Prisma.InputJsonValue, reviewedData: data as Prisma.InputJsonValue, rawExtraction: data as Prisma.InputJsonValue,
        confidence: { fieldConfidence: Object.fromEntries(Object.keys(data).map((k) => [k, 0.95])) } as Prisma.InputJsonValue,
      },
    })
    return doc.id
  }
  await createInvoice({ filename: "cape-office-CO-1201.pdf", vendor: "Cape Office Supply", number: "CO-1201", issued: daysAgo(5), due: daysAhead(25), total: 4380, currency: "ZAR" })
  await createInvoice({ filename: "cape-office-CO-1188.pdf", vendor: "Cape Office Supply", number: "CO-1188", issued: daysAgo(40), due: daysAgo(10), total: 1250, currency: "ZAR" })
  await createInvoice({ filename: "bergrivier-BL-7702.pdf", vendor: "Bergrivier Logistics", number: "BL-7702", issued: daysAgo(12), total: 9900, currency: "ZAR" })
  await createInvoice({ filename: "bergrivier-BL-7688.pdf", vendor: "Bergrivier Logistics", number: "BL-7688", issued: daysAgo(70), due: daysAgo(40), total: 2150, currency: "ZAR" })
  await createInvoice({ filename: "winelands-WC-0093.pdf", vendor: "Winelands Catering", number: "WC-0093", issued: daysAgo(8), total: 3120, currency: "ZAR" })
  await createInvoice({ filename: "karoo-print-KP-311.pdf", vendor: "Karoo Print Works", number: "KP-311", issued: daysAgo(3), total: 680, currency: "ZAR" })
  console.log("seeded Bill Pay rows, suppliers and payer accounts for", workspaceId)
}

main().then(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exit(1) })
