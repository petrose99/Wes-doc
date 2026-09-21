// Deliberately NOT a "use server" module, matching models/document-matches.ts: this trusts the
// workspaceId/documentId it is handed. The server actions in
// app/(app)/workspaces/[workspaceId]/po-match-actions.ts authorise before calling in.
import { auditEventData, getRequestAuditContext, recordDocumentAudit } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { matchVarianceGateRunner, MATCH_VARIANCE_GATE_TYPE, reevaluateMatchVarianceForDocument } from "@/lib/gates/match-variance"
import type { GateContext } from "@/lib/gates/types"
import { writeAuditEvent } from "@/lib/audit"
import { countMismatchGlyphs, parseLineAssignments, type LineMatch } from "@/lib/matching/line-match"
import { CONFIRMED_MATCH_STATUS, isComparedLink, poLinkKind, rankPoLinks, REJECTED_MATCH_STATUS, type PoLinkKind } from "@/lib/matching/po-link"
import type { PoLineConsumptionDetail } from "@/lib/checks/po-line-consumption"
import { runDeterministicChecks } from "@/models/document-checks"
import { Prisma } from "@/prisma/client"

/** #228 / #250: everything the Invoices row, the Detail pane's line-items section and Match
 * manually need to know about an invoice's Purchase Order link — one read, one shape, so the
 * chip's red count and the pane's `≠` glyphs come from the same numbers (#228 Q5). */

export type PoLink = {
  matchId: string
  poDocumentId: string
  poNumber: string | null
  poFilename: string
  poSupplier: string | null
  poTotal: number | null
  kind: PoLinkKind
  confidence: number
  lineAssignments: Record<string, number | null> | null
  /** invoicedAmount / poTotal as a percent, null when the PO has no total. Populated by
   * `summarizeInvoicedByPo` — see `PoMatchCombobox`'s row secondary line (#363). */
  invoicedPercent: number | null
}

export type InvoicePoSummary = {
  /** The PO the invoice is compared against (confirmed or auto), if any. */
  link: PoLink | null
  /** Likely POs that are not compared: suggestions (dashed chip) — #228 Q11 / Q14 "2 likely POs". */
  suggestions: PoLink[]
  /** The number of `≠` glyphs the pane will show: failing cells + 1 when the Total's gate is open. */
  mismatchCount: number
  /** True once a link was rejected and nothing replaced it (#228 Q14 "PO removed"). */
  removed: boolean
  lines: LineMatch[]
  gateOpen: boolean
  /** The open match-variance gate's arithmetic, for the Total's `≠` breakdown. */
  gate: { variance: number; threshold: number; anchorTotal: number; invoiceTotal: number; percent: number } | null
  /** #228 Q13: an Approval is running on the invoice, so a match change will send it back for
   * review — said *before* the change, in the dialog, not after it in a toast. */
  approvalRunning: boolean
  quantityTolerancePercent: number
  priceTolerancePercent: number
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length ? value.trim() : null
}
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") { const n = Number(value.replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null }
  return null
}
function values(doc: { reviewedData: unknown; rawExtraction: unknown }): Record<string, unknown> {
  return ((doc.reviewedData ?? doc.rawExtraction ?? {}) as Record<string, unknown>)
}
export function invoicePoNumber(data: Record<string, unknown>): string | null {
  return asString(data.po_number) ?? asString(data.purchase_order_number)
}

const MATCH_SELECT = {
  id: true, sourceId: true, targetId: true, status: true, confidence: true, lineAssignments: true,
  source: { select: { id: true, filename: true, reviewedData: true, rawExtraction: true } },
} satisfies Prisma.DocumentMatchSelect

type MatchRow = Prisma.DocumentMatchGetPayload<{ select: typeof MATCH_SELECT }>

function toLink(row: MatchRow, invoiceData: Record<string, unknown>): PoLink {
  const po = values(row.source)
  const poNumber = asString(po.po_number)
  return {
    matchId: row.id, poDocumentId: row.sourceId, poNumber, poFilename: row.source.filename,
    poSupplier: asString(po.supplier) ?? asString(po.vendor), poTotal: asNumber(po.total),
    kind: poLinkKind({ status: row.status, invoicePoNumber: invoicePoNumber(invoiceData), poNumber }),
    confidence: row.confidence, lineAssignments: parseLineAssignments(row.lineAssignments),
    invoicedPercent: null,
  }
}

/** Per-PO invoiced amount/percent for the PO match combobox's row secondary line (#363). Mirrors
 * `summarizePoConsumption`'s math (line ~333) but stays standalone — `summarizePoConsumption`
 * itself calls `summarizeInvoicePoLinks`, so calling it back from here would recurse. */
async function summarizeInvoicedByPo(workspaceId: string, poIds: string[]): Promise<Map<string, { invoicedAmount: number; invoicedPercent: number | null }>> {
  const out = new Map<string, { invoicedAmount: number; invoicedPercent: number | null }>()
  const ids = [...new Set(poIds)]
  if (!ids.length) return out
  const [pos, matches] = await Promise.all([
    prisma.document.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, reviewedData: true, rawExtraction: true } }),
    prisma.documentMatch.findMany({
      where: { workspaceId, matchType: "po_to_invoice", sourceId: { in: ids }, status: { not: REJECTED_MATCH_STATUS } },
      select: { sourceId: true, status: true, confidence: true, target: { select: { reviewedData: true, rawExtraction: true } } },
    }),
  ])
  const poByDoc = new Map(pos.map((po) => [po.id, values(po)]))
  for (const po of pos) {
    const data = poByDoc.get(po.id) ?? {}
    const poNumber = asString(data.po_number)
    let invoicedAmount = 0
    for (const match of matches.filter((candidate) => candidate.sourceId === po.id)) {
      const invData = values(match.target)
      const kind = poLinkKind({ status: match.status, invoicePoNumber: invoicePoNumber(invData), poNumber })
      if (!isComparedLink(kind)) continue // suggested or superseded — not consuming
      invoicedAmount += asNumber(invData.total) ?? asNumber(invData.amount) ?? 0
    }
    const total = asNumber(data.total)
    out.set(po.id, { invoicedAmount, invoicedPercent: total ? Math.round((invoicedAmount / total) * 100) : null })
  }
  return out
}

/** The compared PO for an invoice, or null. Shared by the check wiring and the gate so both
 * ignore rejected and merely-suggested links the same way. */
export async function findComparedPoMatch(workspaceId: string, invoiceId: string): Promise<{ matchId: string; poDocumentId: string; poNumber: string | null; lineAssignments: Record<string, number | null> | null } | null> {
  const [invoice, matches] = await Promise.all([
    prisma.document.findFirst({ where: { id: invoiceId, workspaceId }, select: { reviewedData: true, rawExtraction: true } }),
    prisma.documentMatch.findMany({ where: { workspaceId, matchType: "po_to_invoice", targetId: invoiceId, status: { not: REJECTED_MATCH_STATUS } }, select: MATCH_SELECT }),
  ])
  if (!invoice) return null
  const links = rankPoLinks(matches.map((row) => toLink(row, values(invoice)))).filter((link) => isComparedLink(link.kind))
  const link = links[0]
  return link ? { matchId: link.matchId, poDocumentId: link.poDocumentId, poNumber: link.poNumber, lineAssignments: link.lineAssignments } : null
}

export async function summarizeInvoicePoLinks(workspaceId: string, invoiceIds: string[]): Promise<Map<string, InvoicePoSummary>> {
  const out = new Map<string, InvoicePoSummary>()
  if (!invoiceIds.length) return out
  const [invoices, matches, checks, gates, workspace, config, runningApprovals] = await Promise.all([
    prisma.document.findMany({ where: { workspaceId, id: { in: invoiceIds } }, select: { id: true, reviewedData: true, rawExtraction: true } }),
    prisma.documentMatch.findMany({ where: { workspaceId, matchType: "po_to_invoice", targetId: { in: invoiceIds } }, select: MATCH_SELECT }),
    prisma.documentCheckResult.findMany({ where: { workspaceId, documentId: { in: invoiceIds }, checkCode: "po_line_consumption" }, select: { documentId: true, detail: true } }),
    prisma.gate.findMany({ where: { workspaceId, documentId: { in: invoiceIds }, gateType: MATCH_VARIANCE_GATE_TYPE, state: "blocked" }, select: { documentId: true, payload: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { poQuantityTolerancePercent: true } }),
    prisma.workspaceAutomationConfig.findUnique({ where: { workspaceId }, select: { matchTolerance: true } }),
    prisma.reviewTask.findMany({ where: { workspaceId, documentId: { in: invoiceIds }, workflowId: { not: null }, status: { in: ["open", "in_review"] } }, select: { documentId: true } }),
  ])
  const approvalRunningIds = new Set(runningApprovals.map((task) => task.documentId))
  const gateByDoc = new Map(gates.map((gate) => [gate.documentId, gate.payload as Record<string, unknown> | null]))
  const detailByDoc = new Map(checks.map((check) => [check.documentId, check.detail as unknown as PoLineConsumptionDetail | null]))
  const matchesByDoc = new Map<string, MatchRow[]>()
  for (const row of matches) { const list = matchesByDoc.get(row.targetId) ?? []; list.push(row); matchesByDoc.set(row.targetId, list) }
  const tolerance = config?.matchTolerance && typeof config.matchTolerance === "object" && !Array.isArray(config.matchTolerance) ? (config.matchTolerance as { percent?: number }) : null
  const priceTolerancePercent = Math.round(((tolerance?.percent ?? 0.02) * 100) * 100) / 100

  const invoicedByPo = await summarizeInvoicedByPo(workspaceId, matches.map((match) => match.sourceId))

  for (const invoice of invoices) {
    const data = values(invoice)
    const links = rankPoLinks((matchesByDoc.get(invoice.id) ?? []).map((row) => toLink(row, data)))
    for (const candidate of links) candidate.invoicedPercent = invoicedByPo.get(candidate.poDocumentId)?.invoicedPercent ?? null
    const link = links.find((candidate) => isComparedLink(candidate.kind)) ?? null
    const suggestions = links.filter((candidate) => candidate.kind === "suggested")
    // "PO removed" only when a link the invoice itself cited was rejected; a rejected suggestion
    // on an invoice with no PO number leaves it at "No PO", which is what it always was.
    const removed = !link && !suggestions.length && links.some((candidate) => candidate.kind === "rejected") && invoicePoNumber(data) !== null
    const detail = link ? detailByDoc.get(invoice.id) ?? null : null
    const lines = detail && detail.poDocumentId === link?.poDocumentId && Array.isArray(detail.lines) ? detail.lines : []
    const payload = link ? gateByDoc.get(invoice.id) ?? null : null
    const gateOpen = !!link && gateByDoc.has(invoice.id)
    const num = (key: string) => (payload && typeof payload[key] === "number" ? (payload[key] as number) : null)
    const gate = gateOpen && num("variance") !== null && num("threshold") !== null
      ? { variance: num("variance") as number, threshold: num("threshold") as number, anchorTotal: num("anchorTotal") ?? 0, invoiceTotal: num("invoiceTotal") ?? 0, percent: num("percent") ?? 0 }
      : null
    out.set(invoice.id, {
      link, suggestions, removed, lines, gateOpen, gate, approvalRunning: approvalRunningIds.has(invoice.id),
      mismatchCount: link ? countMismatchGlyphs(lines, gateOpen) : 0,
      quantityTolerancePercent: workspace?.poQuantityTolerancePercent ?? 5,
      priceTolerancePercent,
    })
  }
  return out
}

export type PoCandidate = { documentId: string; poNumber: string | null; supplier: string | null; total: number | null; sameSupplier: boolean; invoicedPercent: number | null }

const CANDIDATE_PAGE = 50

/** The POs a reviewer can pick in Match manually's Replace. The search runs here, over every PO
 * in the workspace, so "no Purchase Order matches" is only ever said when it is true — a
 * client-side window would hide an older PO the reviewer can name. Same supplier first, then
 * newest; `truncated` tells the picker to ask for a narrower search rather than pretend. */
export async function listPoCandidates(workspaceId: string, invoiceId: string, query = ""): Promise<{ candidates: PoCandidate[]; truncated: boolean; total: number }> {
  const invoice = await prisma.document.findFirst({ where: { id: invoiceId, workspaceId }, select: { reviewedData: true, rawExtraction: true } })
  if (!invoice) return { candidates: [], truncated: false, total: 0 }
  const data = values(invoice)
  const supplier = (asString(data.vendor) ?? asString(data.supplier) ?? asString(data.merchant) ?? "").toLowerCase()
  const needle = query.trim().toLowerCase()
  const pos = await prisma.document.findMany({
    where: { workspaceId, docType: "purchase_order", status: { notIn: ["received", "queued", "processing", "failed"] } },
    select: { id: true, reviewedData: true, rawExtraction: true },
    orderBy: { receivedAt: "desc" },
  })
  const all = pos
    .map((po): PoCandidate => {
      const v = values(po)
      const poSupplier = asString(v.supplier) ?? asString(v.vendor)
      return { documentId: po.id, poNumber: asString(v.po_number), supplier: poSupplier, total: asNumber(v.total), sameSupplier: !!supplier && !!poSupplier && poSupplier.toLowerCase() === supplier, invoicedPercent: null }
    })
    .filter((po) => !needle || [po.poNumber, po.supplier].some((text) => text?.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.sameSupplier) - Number(a.sameSupplier))
  const page = all.slice(0, CANDIDATE_PAGE)
  const invoicedByPo = await summarizeInvoicedByPo(workspaceId, page.map((po) => po.documentId))
  for (const po of page) po.invoicedPercent = invoicedByPo.get(po.documentId)?.invoicedPercent ?? null
  return { candidates: page, truncated: all.length > CANDIDATE_PAGE, total: all.length }
}

// --------------------------------------------------------------------------------------------
// Match manually (#228 Q7, Q10, Q11, Q13): confirm / replace / reject the PO and reassign line
// matches. Every change is audited as a match change, re-runs the checks and the match-variance
// gate, and — when an Approval is running — sends the invoice back for review with a fixed reason.
// --------------------------------------------------------------------------------------------

export const PO_MATCH_SENT_BACK_REASON = (actorName: string) => `PO match changed by ${actorName}`

async function requireInvoice(workspaceId: string, invoiceId: string) {
  const invoice = await prisma.document.findFirst({ where: { id: invoiceId, workspaceId }, select: { id: true, reviewedData: true, rawExtraction: true } })
  if (!invoice) throw new Error("document_not_found")
  return invoice
}

async function requireMatch(workspaceId: string, invoiceId: string, matchId: string) {
  const match = await prisma.documentMatch.findFirst({ where: { id: matchId, workspaceId, targetId: invoiceId, matchType: "po_to_invoice" }, select: MATCH_SELECT })
  if (!match) throw new Error("po_match_not_found")
  return match
}

/** #228 Q13: any open Approval on the invoice returns to review, with the fixed reason. The run
 * keeps its workflow so it can be restarted from stage 0; the stage that was pending is not
 * decided. Audited as `approval_sent_back` so the Approval tab can say why. */
async function sendRunningApprovalBack(workspaceId: string, invoiceId: string, actorId: string, actorName: string) {
  const tasks = await prisma.reviewTask.findMany({ where: { workspaceId, documentId: invoiceId, workflowId: { not: null }, status: { in: ["open", "in_review"] } }, select: { id: true, currentStageIndex: true } })
  if (!tasks.length) return false
  const reason = PO_MATCH_SENT_BACK_REASON(actorName)
  const context = await getRequestAuditContext()
  await prisma.$transaction([
    ...tasks.map((task) => prisma.reviewTask.update({ where: { id: task.id }, data: { status: "open", currentStageIndex: 0 } })),
    ...tasks.map((task) => prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId, documentId: invoiceId, actorId, type: "approval_sent_back", detail: { taskId: task.id, fromStageIndex: task.currentStageIndex, reason } }, context) })),
  ])
  return true
}

async function reevaluateGateAfterMatchChange(workspaceId: string, invoiceId: string) {
  const existing = await prisma.gate.findUnique({ where: { documentId_gateType: { documentId: invoiceId, gateType: MATCH_VARIANCE_GATE_TYPE } }, select: { state: true } })
  if (existing?.state === "blocked") { await reevaluateMatchVarianceForDocument({ workspaceId, documentId: invoiceId }); return }
  const doc = await prisma.document.findUnique({ where: { id: invoiceId }, select: { id: true, workspaceId: true, docType: true, fieldSnapshot: true, reviewedData: true, rawExtraction: true, receivedAt: true } })
  if (!doc) return
  const ctx: GateContext = { workspaceId, documentId: invoiceId, document: doc as GateContext["document"] }
  const verdict = await matchVarianceGateRunner.run(ctx)
  if (!verdict.blocked) return
  const row = await prisma.gate.upsert({
    where: { documentId_gateType: { documentId: invoiceId, gateType: MATCH_VARIANCE_GATE_TYPE } },
    create: { workspaceId, documentId: invoiceId, gateType: MATCH_VARIANCE_GATE_TYPE, severity: verdict.severity, state: "blocked", payload: (verdict.payload ?? null) as Prisma.InputJsonValue },
    update: { severity: verdict.severity, state: "blocked", firedAt: new Date(), resolvedAt: null, resolvedBy: null, overrideReason: null, payload: (verdict.payload ?? null) as Prisma.InputJsonValue },
  })
  await writeAuditEvent({ workspaceId, actorId: null, type: "gate.blocked", subjectType: "gate", subjectId: row.id, payload: { gateType: MATCH_VARIANCE_GATE_TYPE, documentId: invoiceId, severity: verdict.severity, ...(verdict.payload ?? {}) } })
}

/** The shared tail of every Match manually change: audit, re-run the checks (which rewrites the
 * po_line_consumption row and its `≠` count), re-evaluate the Total's gate, send a running
 * Approval back. Returns whether an Approval was sent back so the UI can say so. */
async function afterMatchChange(input: { workspaceId: string; invoiceId: string; actorId: string; actorName: string; change: Record<string, unknown> }) {
  await recordDocumentAudit({ workspaceId: input.workspaceId, documentId: input.invoiceId, actorId: input.actorId, type: "po_match_changed", detail: input.change as Prisma.InputJsonValue })
  await runDeterministicChecks({ workspaceId: input.workspaceId, documentId: input.invoiceId })
  await reevaluateGateAfterMatchChange(input.workspaceId, input.invoiceId).catch((error) => console.error("[po-matching] gate re-evaluation failed:", error instanceof Error ? error.message : error))
  const sentBack = await sendRunningApprovalBack(input.workspaceId, input.invoiceId, input.actorId, input.actorName)
  return { sentBack }
}

export async function confirmPoMatch(input: { workspaceId: string; invoiceId: string; matchId: string; actorId: string; actorName: string }) {
  const invoice = await requireInvoice(input.workspaceId, input.invoiceId)
  const match = await requireMatch(input.workspaceId, input.invoiceId, input.matchId)
  // Confirming a link that is already compared (the matcher's guess citing the invoice's own PO
  // number) changes no fact: nothing new is compared, so no check re-runs and no running
  // Approval is sent back — #228 Q13's reason is "PO match changed", and it has not.
  const alreadyCompared = isComparedLink(toLink(match, values(invoice)).kind)
  await prisma.$transaction([
    // One compared PO per invoice: confirming this one rejects any other non-rejected link.
    prisma.documentMatch.updateMany({ where: { workspaceId: input.workspaceId, targetId: input.invoiceId, matchType: "po_to_invoice", id: { not: match.id }, status: { not: REJECTED_MATCH_STATUS } }, data: { status: REJECTED_MATCH_STATUS, resolvedAt: new Date(), resolvedById: input.actorId } }),
    prisma.documentMatch.update({ where: { id: match.id }, data: { status: CONFIRMED_MATCH_STATUS, resolvedAt: new Date(), resolvedById: input.actorId } }),
  ])
  if (alreadyCompared) {
    await recordDocumentAudit({ workspaceId: input.workspaceId, documentId: input.invoiceId, actorId: input.actorId, type: "po_match_changed", detail: { action: "confirm", matchId: match.id, poDocumentId: match.sourceId, alreadyCompared: true } })
    return { sentBack: false }
  }
  return afterMatchChange({ ...input, change: { action: "confirm", matchId: match.id, poDocumentId: match.sourceId } })
}

export async function rejectPoMatch(input: { workspaceId: string; invoiceId: string; matchId: string; actorId: string; actorName: string }) {
  await requireInvoice(input.workspaceId, input.invoiceId)
  const match = await requireMatch(input.workspaceId, input.invoiceId, input.matchId)
  await prisma.documentMatch.update({ where: { id: match.id }, data: { status: REJECTED_MATCH_STATUS, resolvedAt: new Date(), resolvedById: input.actorId, lineAssignments: Prisma.DbNull } })
  // A rejected PO leaves no comparison behind: the check row goes with it (#228 Q14 "PO removed").
  const compared = await findComparedPoMatch(input.workspaceId, input.invoiceId)
  if (!compared) await prisma.documentCheckResult.deleteMany({ where: { workspaceId: input.workspaceId, documentId: input.invoiceId, checkCode: "po_line_consumption" } })
  return afterMatchChange({ ...input, change: { action: "reject", matchId: match.id, poDocumentId: match.sourceId } })
}

export async function replacePoMatch(input: { workspaceId: string; invoiceId: string; poDocumentId: string; actorId: string; actorName: string }) {
  await requireInvoice(input.workspaceId, input.invoiceId)
  const po = await prisma.document.findFirst({ where: { id: input.poDocumentId, workspaceId: input.workspaceId, docType: "purchase_order" }, select: { id: true } })
  if (!po) throw new Error("purchase_order_not_found")
  const now = new Date()
  const [, match] = await prisma.$transaction([
    prisma.documentMatch.updateMany({ where: { workspaceId: input.workspaceId, targetId: input.invoiceId, matchType: "po_to_invoice", sourceId: { not: po.id }, status: { not: REJECTED_MATCH_STATUS } }, data: { status: REJECTED_MATCH_STATUS, resolvedAt: now, resolvedById: input.actorId } }),
    prisma.documentMatch.upsert({
      where: { sourceId_targetId: { sourceId: po.id, targetId: input.invoiceId } },
      create: { workspaceId: input.workspaceId, sourceId: po.id, targetId: input.invoiceId, matchType: "po_to_invoice", confidence: 1, discrepancies: [], status: CONFIRMED_MATCH_STATUS, resolvedAt: now, resolvedById: input.actorId },
      update: { status: CONFIRMED_MATCH_STATUS, resolvedAt: now, resolvedById: input.actorId, lineAssignments: Prisma.DbNull },
      select: { id: true },
    }),
  ])
  return afterMatchChange({ ...input, change: { action: "replace", matchId: match.id, poDocumentId: po.id } })
}

export async function setPoLineAssignments(input: { workspaceId: string; invoiceId: string; matchId: string; assignments: Record<string, number | null>; actorId: string; actorName: string }) {
  await requireInvoice(input.workspaceId, input.invoiceId)
  const match = await requireMatch(input.workspaceId, input.invoiceId, input.matchId)
  const assignments = parseLineAssignments(input.assignments) ?? {}
  await prisma.documentMatch.update({ where: { id: match.id }, data: { lineAssignments: Object.keys(assignments).length ? (assignments as Prisma.InputJsonValue) : Prisma.DbNull } })
  return afterMatchChange({ ...input, change: { action: "assign_lines", matchId: match.id, poDocumentId: match.sourceId, assignments } })
}

// --------------------------------------------------------------------------------------------
// Purchase Orders queue and pane (#228 Q8): consumption per PO — Invoiced amount and percent,
// Fully invoiced (derived, never set by hand), per-line Ordered / Invoiced / Remaining and the
// matched invoices.
// --------------------------------------------------------------------------------------------

export type PoConsumptionLine = { index: number; description: string | null; ordered: number | null; invoiced: number; remaining: number | null; unitPrice: number | null }
export type PoMatchedInvoice = { documentId: string; invoiceNumber: string | null; supplier: string | null; total: number | null; currencyCode: string | null; kind: PoLinkKind; mismatchCount: number }
export type PoConsumption = {
  poDocumentId: string
  poNumber: string | null
  total: number | null
  currencyCode: string | null
  /** Sum of the compared invoices' totals. */
  invoicedAmount: number
  /** invoicedAmount / total, as a percent, when the PO has a total. */
  invoicedPercent: number | null
  fullyInvoiced: boolean
  /** "Received" is data DocuBite lacks (#228 Q8) — always null, rendered as "—". */
  received: null
  lines: PoConsumptionLine[]
  invoices: PoMatchedInvoice[]
}

export async function summarizePoConsumption(workspaceId: string, poIds: string[]): Promise<Map<string, PoConsumption>> {
  const out = new Map<string, PoConsumption>()
  if (!poIds.length) return out
  const [pos, matches] = await Promise.all([
    prisma.document.findMany({ where: { workspaceId, id: { in: poIds } }, select: { id: true, reviewedData: true, rawExtraction: true } }),
    prisma.documentMatch.findMany({
      where: { workspaceId, matchType: "po_to_invoice", sourceId: { in: poIds }, status: { not: REJECTED_MATCH_STATUS } },
      select: { id: true, sourceId: true, targetId: true, status: true, confidence: true, lineAssignments: true, target: { select: { id: true, reviewedData: true, rawExtraction: true } } },
    }),
  ])
  const invoiceIds = [...new Set(matches.map((match) => match.targetId))]
  const summaries = await summarizeInvoicePoLinks(workspaceId, invoiceIds)

  for (const po of pos) {
    const data = values(po)
    const poNumber = asString(data.po_number)
    const poLines = Array.isArray(data.line_items) ? (data.line_items as unknown[]).map((raw, index) => {
      const row = (raw ?? {}) as Record<string, unknown>
      return { index, description: asString(row.description), ordered: asNumber(row.quantity), unitPrice: asNumber(row.unit_price) }
    }) : []
    const consumed = new Map<number, number>()
    const invoices: PoMatchedInvoice[] = []
    let invoicedAmount = 0
    for (const match of matches.filter((candidate) => candidate.sourceId === po.id)) {
      const summary = summaries.get(match.targetId)
      const link = summary?.link
      if (!link || link.poDocumentId !== po.id) continue // suggested or superseded — not consuming
      const inv = values(match.target)
      const total = asNumber(inv.total) ?? asNumber(inv.amount)
      invoicedAmount += total ?? 0
      invoices.push({ documentId: match.targetId, invoiceNumber: asString(inv.invoice_number), supplier: asString(inv.vendor) ?? asString(inv.supplier), total, currencyCode: asString(inv.currency_code) ?? asString(inv.currency), kind: link.kind, mismatchCount: summary?.mismatchCount ?? 0 })
      for (const line of summary?.lines ?? []) {
        if (line.poLineIndex === null || line.quantity.thisInvoice === null) continue
        consumed.set(line.poLineIndex, (consumed.get(line.poLineIndex) ?? 0) + line.quantity.thisInvoice)
      }
    }
    const lines: PoConsumptionLine[] = poLines.map((line) => {
      const invoiced = consumed.get(line.index) ?? 0
      return { ...line, invoiced, remaining: line.ordered === null ? null : Math.max(0, line.ordered - invoiced) }
    })
    const total = asNumber(data.total)
    const quantified = lines.filter((line) => line.ordered !== null)
    out.set(po.id, {
      poDocumentId: po.id, poNumber, total, currencyCode: asString(data.currency_code),
      invoicedAmount, invoicedPercent: total ? Math.round((invoicedAmount / total) * 100) : null,
      fullyInvoiced: quantified.length > 0 && quantified.every((line) => line.invoiced >= (line.ordered as number)),
      received: null, lines, invoices,
    })
  }
  return out
}
