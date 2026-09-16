// #250 dev-only seed: a PO-backed invoice with a line mismatch, so the View PO row, the Purchase
// Orders column and the PO pane render live. Idempotent per PO number.
//   npx tsx --env-file .env scripts/dev/seed-po-mismatch.ts <workspaceId>
//
// What it creates, in one workspace:
//   • PO-2088 from Northwind Traders — 3 lines (Widget A ×100 @ 12.50, Bracket kit ×40 @ 8.00,
//     Delivery ×1 @ 45.00), total 1,565.
//   • NW-5511 from Northwind Traders citing PO-2088 — Widget A ×112 @ 12.50 (quantity over the
//     5 % allowance), Bracket kit ×20 @ 9.20 (unit price 15 % off), Delivery ×1 @ 45.00, plus a
//     "Site survey" line no PO line matches. Total 1,669 — over the PO total by more than the
//     2 % match-variance, so the Total's gate is open too. Expect 3 `≠`: quantity, unit price, Total.
//   • NW-5490 from Northwind Traders, an earlier invoice on the same PO — Widget A ×10 — so the
//     breakdown names a sibling under "Already invoiced".
//   • NW-5512 from Northwind Traders with no PO number and a pending match to PO-2088 — the dashed
//     "Likely PO-2088" chip that compares nothing until confirmed.
import { prisma } from "@/lib/db"
import { FINANCE_OPTIONAL_TEMPLATES, FINANCE_TEMPLATES } from "@/lib/domains/finance"
import { runDeterministicChecks } from "@/models/document-checks"
import { matchVarianceGateRunner, MATCH_VARIANCE_GATE_TYPE } from "@/lib/gates/match-variance"
import type { GateContext } from "@/lib/gates/types"
import { randomUUID } from "crypto"
import type { Prisma } from "@/prisma/client"

const INVOICE_FIELDS = FINANCE_TEMPLATES.find((t) => t.code === "invoice")!.fields
const PO_FIELDS = FINANCE_OPTIONAL_TEMPLATES.find((t) => t.code === "purchase_order")!.fields

async function main() {
  const workspaceId = process.argv[2]
  if (!workspaceId) throw new Error("usage: seed-po-mismatch.ts <workspaceId>")
  const file = await prisma.documentFile.findFirst({ where: { workspaceId } })
  if (!file) throw new Error("no file in workspace")

  const ensureTemplate = async (code: string, name: string, documentType: string, fields: unknown) => {
    let t = await prisma.documentTemplate.findFirst({ where: { workspaceId, code } })
    if (!t) t = await prisma.documentTemplate.create({ data: { workspaceId, fileId: file.id, code, name, documentType, isSystem: true, multiRow: true, versions: { create: { version: 1, fields: fields as never } } } })
    const v = await prisma.documentTemplateVersion.findFirst({ where: { templateId: t.id }, orderBy: { version: "desc" } })
    return { t, v }
  }
  const invoiceT = await ensureTemplate("invoice", "Invoice", "invoice", INVOICE_FIELDS)
  const poT = await ensureTemplate("purchase_order", "Purchase Order", "purchase_order", PO_FIELDS)

  const createDoc = async (input: { template: typeof invoiceT; docType: "invoice" | "purchase_order"; filename: string; data: Record<string, unknown>; fields: unknown; status?: string }) => {
    const existing = await prisma.document.findFirst({ where: { workspaceId, filename: input.filename }, select: { id: true } })
    if (existing) {
      await prisma.document.update({ where: { id: existing.id }, data: { reviewedData: input.data as Prisma.InputJsonValue, rawExtraction: input.data as Prisma.InputJsonValue, fieldSnapshot: input.fields as Prisma.InputJsonValue } })
      return existing.id
    }
    const doc = await prisma.document.create({
      data: {
        id: randomUUID(), workspaceId, fileId: file.id, templateId: input.template.t.id, templateVersionId: input.template.v?.id ?? null,
        docType: input.docType, source: "seed", status: input.status ?? "needs_review", filename: input.filename, mimeType: "application/pdf", sizeBytes: 42000,
        sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
        fieldSnapshot: input.fields as Prisma.InputJsonValue, reviewedData: input.data as Prisma.InputJsonValue, rawExtraction: input.data as Prisma.InputJsonValue,
        confidence: { fieldConfidence: Object.fromEntries(Object.keys(input.data).map((k) => [k, 0.93])) } as Prisma.InputJsonValue,
      },
    })
    return doc.id
  }

  const poId = await createDoc({
    template: poT, docType: "purchase_order", filename: "northwind-PO-2088.pdf", status: "reviewed", fields: PO_FIELDS,
    data: {
      po_number: "PO-2088", supplier: "Northwind Traders", order_date: "2026-08-20", delivery_date: "2026-09-10", currency_code: "USD", total: 1565,
      line_items: [
        { description: "Widget A", quantity: 100, unit_price: 12.5, amount: 1250 },
        { description: "Bracket kit", quantity: 40, unit_price: 8, amount: 320 },
        { description: "Delivery", quantity: 1, unit_price: 45, amount: 45 },
      ],
    },
  })

  const earlierId = await createDoc({
    template: invoiceT, docType: "invoice", filename: "northwind-NW-5490.pdf", status: "reviewed", fields: INVOICE_FIELDS,
    data: {
      vendor: "Northwind Traders", invoice_number: "NW-5490", po_number: "PO-2088", issue_date: "2026-08-28", due_date: "2026-09-27", currency_code: "USD",
      subtotal: 125, tax_total: 0, total: 125,
      line_items: [{ description: "Widget A", quantity: 10, unit_price: 12.5, amount: 125 }],
    },
  })

  const invoiceId = await createDoc({
    template: invoiceT, docType: "invoice", filename: "northwind-NW-5511.pdf", fields: INVOICE_FIELDS,
    data: {
      vendor: "Northwind Traders", invoice_number: "NW-5511", po_number: "PO-2088", issue_date: "2026-09-12", due_date: "2026-10-12", currency_code: "USD",
      subtotal: 1669, tax_total: 0, total: 1669,
      line_items: [
        { description: "Widget A", quantity: 112, unit_price: 12.5, amount: 1400 },
        { description: "Bracket kit", quantity: 20, unit_price: 9.2, amount: 184 },
        { description: "Delivery", quantity: 1, unit_price: 45, amount: 45 },
        { description: "Site survey", quantity: 1, unit_price: 40, amount: 40 },
      ],
    },
  })

  const suggestedId = await createDoc({
    template: invoiceT, docType: "invoice", filename: "northwind-NW-5512.pdf", fields: INVOICE_FIELDS,
    data: {
      vendor: "Northwind Traders", invoice_number: "NW-5512", issue_date: "2026-09-14", due_date: "2026-10-14", currency_code: "USD",
      subtotal: 320, tax_total: 0, total: 320,
      line_items: [{ description: "Bracket kit", quantity: 40, unit_price: 8, amount: 320 }],
    },
  })

  const link = async (targetId: string, confidence: number) => prisma.documentMatch.upsert({
    where: { sourceId_targetId: { sourceId: poId, targetId } },
    create: { workspaceId, sourceId: poId, targetId, matchType: "po_to_invoice", confidence, discrepancies: [] },
    update: { confidence, status: "pending", lineAssignments: null as unknown as Prisma.InputJsonValue },
  })
  await link(earlierId, 0.96)
  await link(invoiceId, 0.94)
  await link(suggestedId, 0.71)

  for (const id of [earlierId, invoiceId, suggestedId]) await runDeterministicChecks({ workspaceId, documentId: id })

  // The Total's match-variance gate for NW-5511 (1,669 vs 1,565 is 6.6 % off, allowance 2 % / 500
  // floor → the floor wins at 500, so we shrink the floor for the dev workspace to make it fire).
  await prisma.workspaceAutomationConfig.upsert({
    where: { workspaceId },
    create: { workspaceId, matchTolerance: { percent: 0.02, floor: { amount: 20 } } },
    update: { matchTolerance: { percent: 0.02, floor: { amount: 20 } } },
  })
  const doc = await prisma.document.findUnique({ where: { id: invoiceId }, select: { id: true, workspaceId: true, docType: true, fieldSnapshot: true, reviewedData: true, rawExtraction: true, receivedAt: true } })
  const verdict = await matchVarianceGateRunner.run({ workspaceId, documentId: invoiceId, document: doc as GateContext["document"] })
  if (verdict.blocked) {
    await prisma.gate.upsert({
      where: { documentId_gateType: { documentId: invoiceId, gateType: MATCH_VARIANCE_GATE_TYPE } },
      create: { workspaceId, documentId: invoiceId, gateType: MATCH_VARIANCE_GATE_TYPE, severity: verdict.severity, state: "blocked", payload: (verdict.payload ?? null) as Prisma.InputJsonValue },
      update: { severity: verdict.severity, state: "blocked", payload: (verdict.payload ?? null) as Prisma.InputJsonValue, resolvedAt: null, overrideReason: null },
    })
  }
  console.log(JSON.stringify({ poId, invoiceId, earlierId, suggestedId, gateBlocked: verdict.blocked }, null, 2))
}

main().then(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exit(1) })
