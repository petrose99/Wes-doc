// Deliberately NOT a "use server" module, matching every other models/*.ts helper: trusts the
// workspaceId/documentId it is handed. Any server actions live alongside bank-match-actions.ts
// and do the auth + capability gate.
import { createHash } from "node:crypto"

import { prisma } from "@/lib/db"
import { toCents } from "@/lib/money"

/** Phase 2: durable line identity.
 *
 * Statement documents extract their line items into `reviewedData.transactions` (bank_statement)
 * or `reviewedData.entries` (supplier_statement). Re-extraction reshuffles that array — the
 * transactionIndex column on BankMatch was addressing into a moving target. `contentHash` is a
 * stable identity over the normalized line content (date | amount cents | currency | description),
 * so the same physical line survives a re-projection under the same StatementLine id.
 *
 * Contract with regenerateBankMatchSuggestions:
 *   1) project first (this module),
 *   2) suggest matches keyed on the new statementLineId (bank-matches.ts),
 *   3) an accepted BankMatch pointing at a StatementLine survives even when the underlying
 *      reviewedData row vanishes: this module marks such lines lineIndex = -1 rather than
 *      deleting them, matching the "an accepted match is a person's decision" rule in
 *      models/bank-matches.ts.
 */

const NORMALIZE_WS = /\s+/g

export type StatementLineInput = {
  lineIndex: number
  txnDate: Date | null
  amount: number | null
  currencyCode: string | null
  description: string | null
  counterparty: string | null
  direction: "debit" | "credit" | null
}

function normalizeDescription(value: string | null): string {
  if (!value) return ""
  return value.toLowerCase().replace(NORMALIZE_WS, " ").trim()
}

/** Build the stable hash. Same physical line → same hash across re-extractions. */
export function computeContentHash(line: StatementLineInput): string {
  const dateKey = line.txnDate ? line.txnDate.toISOString().slice(0, 10) : ""
  const amountKey = String(toCents(line.amount))
  const currencyKey = (line.currencyCode ?? "").toUpperCase()
  const descKey = normalizeDescription(line.description)
  return createHash("sha256").update(`${dateKey}|${amountKey}|${currencyKey}|${descKey}`).digest("hex")
}

/** Suffix genuine duplicate lines with `-N` so `(documentId, contentHash)` uniqueness holds.
 * Two rows that hash identically get `-2`, `-3`, and so on. Order is the caller's lineIndex —
 * the first occurrence keeps the plain hash. */
function assignUniqueHashes(lines: StatementLineInput[]): { input: StatementLineInput; contentHash: string }[] {
  const counts = new Map<string, number>()
  const result: { input: StatementLineInput; contentHash: string }[] = []
  for (const line of lines) {
    const base = computeContentHash(line)
    const seen = counts.get(base) ?? 0
    counts.set(base, seen + 1)
    const contentHash = seen === 0 ? base : `${base}-${seen + 1}`
    result.push({ input: line, contentHash })
  }
  return result
}

/** Idempotent projection: upsert every line by (documentId, contentHash), then reconcile the
 * old set — a vanished line is only kept if an accepted BankMatch still references it. */
export async function projectStatementLines(
  workspaceId: string,
  documentId: string,
  lines: StatementLineInput[],
): Promise<{ upserted: number; orphaned: number; deleted: number }> {
  const hashed = assignUniqueHashes(lines)
  const newHashes = new Set(hashed.map((h) => h.contentHash))

  const existing = await prisma.statementLine.findMany({
    where: { workspaceId, documentId },
    select: { id: true, contentHash: true, lineIndex: true },
  })
  const existingByHash = new Map(existing.map((row) => [row.contentHash, row]))

  // upsert current lines
  for (const { input, contentHash } of hashed) {
    const prior = existingByHash.get(contentHash)
    if (prior) {
      if (prior.lineIndex !== input.lineIndex) {
        await prisma.statementLine.update({
          where: { id: prior.id },
          data: {
            lineIndex: input.lineIndex,
            txnDate: input.txnDate,
            amount: input.amount,
            currencyCode: input.currencyCode,
            description: input.description,
            counterparty: input.counterparty,
            direction: input.direction,
          },
        })
      }
    } else {
      await prisma.statementLine.create({
        data: {
          workspaceId,
          documentId,
          lineIndex: input.lineIndex,
          contentHash,
          txnDate: input.txnDate,
          amount: input.amount,
          currencyCode: input.currencyCode,
          description: input.description,
          counterparty: input.counterparty,
          direction: input.direction,
        },
      })
    }
  }

  // reconcile vanished lines
  const vanished = existing.filter((row) => !newHashes.has(row.contentHash))
  let orphaned = 0
  let deleted = 0
  if (vanished.length) {
    const stillReferenced = await prisma.bankMatch.findMany({
      where: {
        workspaceId,
        statementLineId: { in: vanished.map((v) => v.id) },
        status: "accepted",
      },
      select: { statementLineId: true },
    })
    const referencedIds = new Set(stillReferenced.map((m) => m.statementLineId).filter((id): id is string => Boolean(id)))
    for (const row of vanished) {
      if (referencedIds.has(row.id)) {
        if (row.lineIndex !== -1) {
          await prisma.statementLine.update({ where: { id: row.id }, data: { lineIndex: -1 } })
        }
        orphaned++
      } else {
        await prisma.statementLine.delete({ where: { id: row.id } })
        deleted++
      }
    }
  }

  return { upserted: hashed.length, orphaned, deleted }
}

/** Fetch a documentId → contentHash-keyed lookup so callers (bank-matches.ts) can join a
 * transactionIndex back to a StatementLine.id and write BankMatch.statementLineId. */
export async function getStatementLineIdsByHash(
  workspaceId: string,
  documentId: string,
): Promise<Map<string, string>> {
  const rows = await prisma.statementLine.findMany({
    where: { workspaceId, documentId },
    select: { id: true, contentHash: true },
  })
  return new Map(rows.map((r) => [r.contentHash, r.id]))
}
