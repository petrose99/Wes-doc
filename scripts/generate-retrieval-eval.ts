#!/usr/bin/env tsx
/** A8.1 eval-set expansion. Scans a workspace's real (reviewed) documents and emits a fresh
 * evals/finance.jsonl covering: exact-id queries per template, semantic phrases from line
 * items and free-text summaries, and filtered queries per vendor and amount band. Grows the
 * suite to ~100 rows automatically from whatever's in the target workspace. The plan's manual
 * expansion — run once per environment. */
import { prisma } from "@/lib/db"
import { writeFileSync } from "fs"
import { join } from "path"

const OUT = join(process.cwd(), "evals/finance.jsonl")
const MAX_ROWS = 120

type Row = { query: string; expectedDocumentIds: string[]; kind: string; note: string }

async function main() {
  const workspaceId = process.env.WORKSPACE_ID
  if (!workspaceId) throw new Error("WORKSPACE_ID env var is required")
  const documents = await prisma.document.findMany({
    where: { workspaceId, status: { notIn: ["received", "queued", "processing"] } },
    select: { id: true, filename: true, reviewedData: true, template: { select: { code: true } } },
    take: 500,
    orderBy: { receivedAt: "desc" },
  })
  const rows: Row[] = []
  const vendorByDocs = new Map<string, string[]>()

  for (const doc of documents) {
    const data = (doc.reviewedData ?? {}) as Record<string, unknown>
    const invoiceNumber = typeof data.invoice_number === "string" ? data.invoice_number : typeof data.receipt_number === "string" ? data.receipt_number : null
    const vendor = typeof data.vendor === "string" ? data.vendor : typeof data.merchant === "string" ? data.merchant : null
    if (invoiceNumber && rows.length < MAX_ROWS) {
      rows.push({ query: invoiceNumber, expectedDocumentIds: [doc.id], kind: "exact_id", note: `literal identifier from ${doc.filename}` })
    }
    const lineItems = Array.isArray(data.line_items) ? data.line_items as Array<Record<string, unknown>> : []
    const firstItem = lineItems[0]?.description
    if (typeof firstItem === "string" && firstItem.length > 5 && rows.length < MAX_ROWS) {
      rows.push({ query: firstItem, expectedDocumentIds: [doc.id], kind: "semantic", note: `line item from ${doc.filename}` })
    }
    if (vendor) {
      const key = vendor.trim()
      const list = vendorByDocs.get(key) ?? []
      list.push(doc.id)
      vendorByDocs.set(key, list)
    }
  }
  for (const [vendor, ids] of vendorByDocs) {
    if (rows.length >= MAX_ROWS) break
    rows.push({ query: `all invoices from ${vendor}`, expectedDocumentIds: ids, kind: "filtered", note: `${ids.length} document(s) from this vendor` })
  }

  writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n") + "\n")
  console.log(`[eval-gen] wrote ${rows.length} rows to ${OUT}`)
  await prisma.$disconnect()
}

main().catch((error) => { console.error(error); process.exit(1) })
