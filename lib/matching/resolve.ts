import { prisma } from "@/lib/db"
import type { Prisma } from "@/prisma/client"
import { findMatches, type MatchableDocument, type MatchResult } from "./engine"

export async function resolveDocumentMatches(workspaceId: string, documentId: string): Promise<MatchResult[]> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: {
      id: true,
      rawExtraction: true,
      template: { select: { code: true } },
    },
  })
  if (!document || !document.rawExtraction || !document.template?.code) return []

  const extracted = document.rawExtraction as Record<string, unknown>
  const source: MatchableDocument = {
    id: document.id,
    templateCode: document.template.code,
    vendor: asString(extracted.vendor) ?? asString(extracted.merchant),
    amount: asNumber(extracted.total) ?? asNumber(extracted.amount),
    date: asString(extracted.date) ?? asString(extracted.invoice_date),
    poNumber: asString(extracted.po_number) ?? asString(extracted.purchase_order_number),
  }

  const candidates = await prisma.$queryRawUnsafe<{ id: string; raw_extraction: unknown; template_code: string }[]>(
    `SELECT d."id", d."raw_extraction", t."code" AS "template_code"
     FROM "documents" d
     JOIN "document_templates" t ON t."id" = d."template_id"
     WHERE d."workspace_id" = $1::uuid
       AND d."id" != $2::uuid
       AND d."raw_extraction" IS NOT NULL
       AND d."template_id" IS NOT NULL
     ORDER BY d."received_at" DESC
     LIMIT 200`,
    workspaceId,
    documentId,
  )

  const matchables: MatchableDocument[] = candidates.map((c) => {
    const ext = (typeof c.raw_extraction === "object" && c.raw_extraction !== null ? c.raw_extraction : {}) as Record<string, unknown>
    return {
      id: c.id,
      templateCode: c.template_code,
      vendor: asString(ext.vendor) ?? asString(ext.merchant),
      amount: asNumber(ext.total) ?? asNumber(ext.amount),
      date: asString(ext.date) ?? asString(ext.invoice_date),
      poNumber: asString(ext.po_number) ?? asString(ext.purchase_order_number),
    }
  })

  const results = findMatches(source, matchables)

  for (const match of results) {
    await prisma.documentMatch.upsert({
      where: { sourceId_targetId: { sourceId: match.sourceId, targetId: match.targetId } },
      create: {
        workspaceId,
        sourceId: match.sourceId,
        targetId: match.targetId,
        matchType: match.matchType,
        confidence: match.confidence,
        discrepancies: match.discrepancies as unknown as Prisma.InputJsonValue,
      },
      update: {
        matchType: match.matchType,
        confidence: match.confidence,
        discrepancies: match.discrepancies as unknown as Prisma.InputJsonValue,
      },
    })
  }

  return results
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && !isNaN(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""))
    return isNaN(n) ? null : n
  }
  return null
}
