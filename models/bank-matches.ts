// Deliberately NOT a "use server" module, matching every other models/*.ts helper: trusts the
// workspaceId/documentId it is handed. Server actions live in
// app/(app)/workspaces/[workspaceId]/bank-match-actions.ts and do the auth + capability gate.
import { auditEventData, getRequestAuditContext } from "@/lib/audit"
import { suggestMatches, type BankTransaction, type MatchCandidateDocument } from "@/lib/bank-match/matcher"
import { prisma } from "@/lib/db"
import { DOC_TYPE_SPECS, DOC_TYPES, resolveDocType, type MatchCandidateFieldMap } from "@/lib/doc-types"
import { matchSupplierStatementEntries, type SupplierStatementEntry } from "@/lib/reconciliation/supplier-statement"
import { onBankMatchAccepted, onBankMatchUnaccepted } from "@/lib/reconciliation/close-loop"
import { computeContentHash, getStatementLineIdsByHash, projectStatementLines, type StatementLineInput } from "@/models/statement-lines"
import { Prisma } from "@/prisma/client"
import { cache } from "react"

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}
function asDate(value: unknown): Date | null {
  if (typeof value !== "string") return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function loadCandidateDocuments(workspaceId: string, excludeDocumentId: string): Promise<MatchCandidateDocument[]> {
  const matchableDocTypes = DOC_TYPES.filter((dt) => DOC_TYPE_SPECS[dt].matchCandidateFields)
  const documents = await prisma.document.findMany({
    where: { workspaceId, id: { not: excludeDocumentId }, status: { notIn: ["received", "queued", "processing"] }, OR: [{ docType: { in: matchableDocTypes } }, { template: { code: { in: ["invoice", "receipt", "expense_receipt"] } } }] },
    select: { id: true, reviewedData: true, docType: true, template: { select: { code: true } } },
    take: 500,
  })
  return documents.flatMap((document) => {
    const map: MatchCandidateFieldMap | undefined = DOC_TYPE_SPECS[resolveDocType(document)].matchCandidateFields
    if (!map) return []
    const values = (document.reviewedData ?? {}) as Record<string, unknown>
    return [{
      documentId: document.id,
      supplier: asString(values[map.supplier]),
      total: asNumber(values[map.total]),
      date: asDate(values[map.date]),
      currencyCode: asString(values[map.currency]),
      invoiceNumber: map.invoiceNumber ? asString(values[map.invoiceNumber]) : null,
    }]
  })
}

/** Deletes every non-accepted BankMatch row for this (statement, kind) before inserting fresh
 * suggestions — an accepted match is a person's decision and must survive a re-run; a stale
 * "suggested" or "rejected" row from a prior run has no reason to. Suggestions include a
 * statementLineId when the projection has run; it's written into BankMatch.statementLineId so
 * later re-projections can join by durable identity rather than array position. */
async function replaceSuggestions(workspaceId: string, statementDocumentId: string, kind: string, suggestions: { transactionIndex: number; matchedDocumentId: string; confidence: number; dateDeltaDays: number | null; statementLineId: string | null }[]): Promise<void> {
  await prisma.$transaction([
    prisma.bankMatch.deleteMany({ where: { workspaceId, statementDocumentId, kind, status: { not: "accepted" } } }),
    ...suggestions.map((s) => prisma.bankMatch.upsert({
      where: { workspaceId_kind_statementDocumentId_transactionIndex_matchedDocumentId: { workspaceId, kind, statementDocumentId, transactionIndex: s.transactionIndex, matchedDocumentId: s.matchedDocumentId } },
      create: { workspaceId, statementDocumentId, kind, transactionIndex: s.transactionIndex, matchedDocumentId: s.matchedDocumentId, confidence: s.confidence, dateDeltaDays: s.dateDeltaDays, statementLineId: s.statementLineId },
      update: { confidence: s.confidence, dateDeltaDays: s.dateDeltaDays, status: "suggested", decidedById: null, decidedAt: null, statementLineId: s.statementLineId },
    })),
  ])
}

/** Regenerates "bank" suggestions for one bank_statement document — matches each transaction row
 * against every invoice/receipt/expense_receipt document in the workspace not already excluded.
 * Never throws past the caller, matching every other post-extraction side effect in
 * lib/document-processing.ts. */
export async function regenerateBankMatchSuggestions(workspaceId: string, statementDocumentId: string): Promise<void> {
  try {
    const document = await prisma.document.findFirst({
      where: { id: statementDocumentId, workspaceId },
      select: { id: true, reviewedData: true, template: { select: { code: true } } },
    })
    if (document?.template?.code !== "bank_statement") return
    const values = (document.reviewedData ?? {}) as Record<string, unknown>
    const statementCurrency = asString(values.currency_code)
    const rows = Array.isArray(values.transactions) ? (values.transactions as unknown[]) : []
    const transactions: BankTransaction[] = rows.map((row, index) => {
      const r = (row ?? {}) as Record<string, unknown>
      const debit = asNumber(r.debit)
      const credit = asNumber(r.credit)
      return { index, date: asDate(r.transaction_date), description: asString(r.description), amount: debit ?? credit }
    })
    if (!transactions.length) {
      await projectStatementLines(workspaceId, statementDocumentId, [])
      await replaceSuggestions(workspaceId, statementDocumentId, "bank", [])
      return
    }

    // Project first — subsequent suggestion writes attach to a durable StatementLine.id, so an
    // accepted match survives the next re-extraction even if `transactions` reshuffles.
    const lineInputs: StatementLineInput[] = transactions.map((t) => ({
      lineIndex: t.index,
      txnDate: t.date,
      amount: t.amount,
      currencyCode: statementCurrency,
      description: t.description,
      counterparty: null,
      direction: (t.amount ?? 0) >= 0 ? "debit" : "credit",
    }))
    await projectStatementLines(workspaceId, statementDocumentId, lineInputs)
    const hashToId = await getStatementLineIdsByHash(workspaceId, statementDocumentId)
    const idByIndex = new Map<number, string>()
    for (const line of lineInputs) {
      const hash = computeContentHash(line)
      const id = hashToId.get(hash)
      if (id) idByIndex.set(line.lineIndex, id)
    }

    const candidates = await loadCandidateDocuments(workspaceId, statementDocumentId)
    const suggestions = suggestMatches(transactions, candidates, { statementCurrency })
    await replaceSuggestions(workspaceId, statementDocumentId, "bank", suggestions.map((s) => ({
      transactionIndex: s.transactionIndex,
      matchedDocumentId: s.documentId,
      confidence: s.confidence,
      dateDeltaDays: s.dateDeltaDays,
      statementLineId: idByIndex.get(s.transactionIndex) ?? null,
    })))
  } catch (error) {
    console.error("[bank-match] failed to regenerate suggestions:", error instanceof Error ? error.message : error)
  }
}

/** Regenerates "supplier_statement" suggestions — matches each statement entry against the
 * workspace's invoices from the same supplier (lib/reconciliation/supplier-statement.ts's own,
 * stricter matcher: invoice-number-in-description first, amount+date fallback second). */
export async function regenerateSupplierStatementMatches(workspaceId: string, statementDocumentId: string): Promise<void> {
  try {
    const document = await prisma.document.findFirst({
      where: { id: statementDocumentId, workspaceId },
      select: { id: true, reviewedData: true, template: { select: { code: true } } },
    })
    if (document?.template?.code !== "supplier_statement") return
    const values = (document.reviewedData ?? {}) as Record<string, unknown>
    const statementSupplier = asString(values.supplier)
    const statementCurrency = asString(values.currency_code)
    const rows = Array.isArray(values.entries) ? (values.entries as unknown[]) : []
    const entries: SupplierStatementEntry[] = rows.map((row, index) => {
      const r = (row ?? {}) as Record<string, unknown>
      return { index, date: asDate(r.entry_date), description: asString(r.description), amount: asNumber(r.amount) }
    })
    if (!entries.length) {
      await projectStatementLines(workspaceId, statementDocumentId, [])
      await replaceSuggestions(workspaceId, statementDocumentId, "supplier_statement", [])
      return
    }

    const lineInputs: StatementLineInput[] = entries.map((e) => ({
      lineIndex: e.index,
      txnDate: e.date,
      amount: e.amount,
      currencyCode: statementCurrency,
      description: e.description,
      counterparty: statementSupplier,
      direction: null,
    }))
    await projectStatementLines(workspaceId, statementDocumentId, lineInputs)
    const hashToId = await getStatementLineIdsByHash(workspaceId, statementDocumentId)
    const idByIndex = new Map<number, string>()
    for (const line of lineInputs) {
      const id = hashToId.get(computeContentHash(line))
      if (id) idByIndex.set(line.lineIndex, id)
    }

    const allInvoices = await loadCandidateDocuments(workspaceId, statementDocumentId)
    // Pre-filtered to invoices whose vendor fuzzy-matches the statement's own supplier — a supplier
    // statement should never match an unrelated supplier's invoice just because the amount lines up.
    const candidates = statementSupplier
      ? allInvoices.filter((candidate) => candidate.supplier && fuzzySupplierMatch(candidate.supplier, statementSupplier))
      : []
    const suggestions = matchSupplierStatementEntries(entries, candidates, { statementCurrency })
    await replaceSuggestions(workspaceId, statementDocumentId, "supplier_statement", suggestions.map((s) => ({
      transactionIndex: s.transactionIndex,
      matchedDocumentId: s.documentId,
      confidence: s.confidence,
      dateDeltaDays: s.dateDeltaDays,
      statementLineId: idByIndex.get(s.transactionIndex) ?? null,
    })))
  } catch (error) {
    console.error("[bank-match] failed to regenerate supplier statement matches:", error instanceof Error ? error.message : error)
  }
}

function fuzzySupplierMatch(a: string, b: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  const na = normalize(a)
  const nb = normalize(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

export const listBankMatches = cache(async (workspaceId: string, statementDocumentId: string) => prisma.bankMatch.findMany({
  where: { workspaceId, statementDocumentId },
  orderBy: { transactionIndex: "asc" },
  // Phase 5: also pull paymentStatus so the UI can render the "Reconciled" pill on an accepted
  // match — see components/bank-match/match-panel.tsx.
  include: { matchedDocument: { select: { id: true, filename: true, reviewedData: true, paymentStatus: true } } },
}))

export async function decideBankMatch(input: { workspaceId: string; matchId: string; status: "accepted" | "rejected"; actorId: string }) {
  const match = await prisma.bankMatch.findFirst({ where: { id: input.matchId, workspaceId: input.workspaceId }, select: { id: true, statementDocumentId: true, transactionIndex: true, kind: true, status: true } })
  if (!match) throw new Error("bank_match_not_found")
  const priorStatus = match.status
  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.bankMatch.update({ where: { id: match.id }, data: { status: input.status, decidedById: input.actorId, decidedAt: new Date() } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, documentId: match.statementDocumentId, actorId: input.actorId, type: `bank_match.${input.status}`, detail: { matchId: match.id, transactionIndex: match.transactionIndex, kind: match.kind } as Prisma.InputJsonValue }, context) }),
  ])
  // Phase 5: close the reconciliation loop after the decision commits. Never throws past the
  // caller — the accept/reject itself must not fail because of a downstream side effect.
  if (input.status === "accepted") {
    await onBankMatchAccepted({ workspaceId: input.workspaceId, matchId: match.id }).catch(() => {})
  } else if (priorStatus === "accepted") {
    // Was accepted, now rejected: reverse the close-loop effects.
    await onBankMatchUnaccepted({ workspaceId: input.workspaceId, matchId: match.id }).catch(() => {})
  }
  return updated
}
