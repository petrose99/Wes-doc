import { prisma } from "@/lib/db"
import type { Prisma } from "@/prisma/client"
import { candidateDocumentIds } from "./blocking"
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

  // Phase 4: blocking replaces the LIMIT-200 recent scan with an indexed union over
  // DocumentFieldValue. See lib/matching/blocking.ts. When the source has neither an amount nor
  // a date yet the blocker falls back to the same recent-200 behavior — recall doesn't collapse.
  const ids = await candidateDocumentIds({
    workspaceId,
    documentId,
    amount: source.amount,
    date: source.date,
    poNumber: source.poNumber,
  })

  const candidates = ids.length
    ? await prisma.document.findMany({
        where: { workspaceId, id: { in: ids } },
        select: { id: true, rawExtraction: true, template: { select: { code: true } } },
      })
    : []

  const matchables: MatchableDocument[] = candidates
    .filter((c) => c.template?.code)
    .map((c) => {
      const ext = (c.rawExtraction ?? {}) as Record<string, unknown>
      return {
        id: c.id,
        templateCode: c.template!.code,
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
