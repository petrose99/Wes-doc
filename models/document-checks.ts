// Deliberately NOT a "use server" module, matching every other models/*.ts helper in this
// package: this trusts the documentId/workspaceId it is handed. Called from the worker
// (lib/document-processing.ts), which has already authorised the document by construction.
import { track } from "@/lib/analytics"
import { recordSystemAudit } from "@/lib/audit"
import { checkInvoiceArithmetic } from "@/lib/checks/arithmetic"
import { checkLineItemArithmetic } from "@/lib/checks/line-item-arithmetic"
import { checkPoLineConsumption, type PoLineConsumptionInput } from "@/lib/checks/po-line-consumption"
import { parseLineAssignments } from "@/lib/matching/line-match"
import { isComparedLink, poLinkKind, rankPoLinks, REJECTED_MATCH_STATUS } from "@/lib/matching/po-link"
import { deriveStatementLayout, evaluateStatementDrift, type StatementLayout } from "@/lib/checks/statement-layout-drift"
import { checkAmountAnomaly } from "@/lib/checks/amount-anomaly"
import { checkBankDetails } from "@/lib/checks/bank-details"
import { checkPdfForensics, readPdfForensicSignals } from "@/lib/checks/pdf-forensics"
import { checkTextLayerDivergence } from "@/lib/checks/text-layer-divergence"
import { extractPdfTextLayer } from "@/lib/pdf/text-layer"
import { checkSplitInvoices } from "@/lib/checks/split-invoices"
import { checkVendorOnboarding } from "@/lib/checks/vendor-onboarding"
import { checkAttachmentLimit } from "@/lib/checks/attachment-limit"
import type { AttachProvider } from "@/lib/integrations/attach-limits"
import { loadAttachmentRendition } from "@/lib/integration-attach-rendition"
import { decimalToNumber } from "@/lib/money"
import { documentStorageKey, readDocumentSource } from "@/lib/document-storage"
import { resolveSupplier } from "@/lib/suppliers/alias"
import { normalizeIban } from "@/lib/suppliers/normalize"
import { checkStatementBalance } from "@/lib/checks/balance"
import { findNearDuplicate, type DocumentIdentity } from "@/lib/checks/duplicates"
import { findMissingStatementPeriods } from "@/lib/checks/statement-periods"
import { checkTaxConsistency } from "@/lib/checks/tax-consistency"
import type { CheckResult } from "@/lib/checks/types"
import { checkVatNumber } from "@/lib/checks/vat-number"
import { prisma } from "@/lib/db"
import { createReviewTask } from "@/models/review-tasks"
import { checkLineCoding, LINE_CODING_CHECK_CODES, lineCodingInputFromDocument } from "@/lib/checks/line-coding"
import { loadLineCodingContext } from "@/models/accounting-entities"
import { emitAccountsPayableEvent } from "@/lib/webhooks"
import { kickWebhookDrain } from "@/lib/webhook-delivery"
import { getTaxProfile } from "@/models/tax-profiles"
import { DOC_TYPE_SPECS, resolveDocType, type CheckFieldMap } from "@/lib/doc-types"
import { Prisma } from "@/prisma/client"

/** Only these two default to "fail" — every other check defaults to "warn" (the roadmap's own
 * call): a wrong total or a knowingly-reingested file are not judgment calls, everything else
 * (a statement's own rounding, a rate mismatch, a plausible near-dupe) is worth a look, not a
 * block. "duplicate" is fail only for its exact-match branch — see runDeterministicChecks. */
const FAIL_BY_DEFAULT = new Set<string>(["invoice_arithmetic", "bank_detail_change", ...LINE_CODING_CHECK_CODES])

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

/** Runs every applicable deterministic check for one document, persists each result (upserted by
 * (documentId, checkCode), so a reprocess updates the same row rather than accumulating history —
 * DocumentAuditEvent is where history lives), and opens a ReviewTask + emits an analytics event
 * for any check that came back warn or fail. Never throws past the caller, matching every other
 * post-extraction side effect in lib/document-processing.ts. */
export async function runDeterministicChecks(input: { workspaceId: string; documentId: string }): Promise<void> {
  try {
    const document = await prisma.document.findFirst({
      where: { id: input.documentId, workspaceId: input.workspaceId },
      select: { id: true, templateId: true, reviewedData: true, codingData: true, mimeType: true, ocrText: true, docType: true, institutionId: true, sizeBytes: true, pageRange: true, storageKey: true, filename: true, template: { select: { code: true } } },
    })
    if (!document) return
    const docType = resolveDocType(document)
    const map: CheckFieldMap | undefined = DOC_TYPE_SPECS[docType].checkFields
    if (!map) return

    const values = (document.reviewedData ?? {}) as Record<string, unknown>
    const get = (key: keyof CheckFieldMap) => (map[key] ? values[map[key] as string] : undefined)
    const currencyCode = asString(get("currency"))
    const lineItems = Array.isArray(get("lineItems")) ? (get("lineItems") as unknown[]).map((item) => {
      const row = item as Record<string, unknown> | null
      return {
        quantity: asNumber(row?.quantity),
        unitPrice: asNumber(row?.unit_price),
        amount: asNumber(row?.amount),
      }
    }) : []

    const results: CheckResult[] = []

    if (map.total || map.subtotal) {
      const otherCharges = Array.isArray(get("otherCharges")) ? (get("otherCharges") as unknown[]).map((item) => ({ amount: asNumber((item as Record<string, unknown> | null)?.amount) })) : []
      const arithmetic = checkInvoiceArithmetic({ currencyCode, subtotal: asNumber(get("subtotal")), taxTotal: asNumber(get("taxTotal")), shippingTotal: asNumber(get("shippingTotal")), otherCharges, total: asNumber(get("total")), lineItems })
      if (arithmetic) results.push(arithmetic)
      const lineArithmetic = checkLineItemArithmetic({ currencyCode, lineItems })
      if (lineArithmetic) results.push(lineArithmetic)
    }

    // #206: cumulative PO/invoice line-consumption, only meaningful once this invoice is matched
    // to a PO (lib/matching engine's po_to_invoice edge).
    if (map.lineItems) {
      const poConsumption = await checkPoLineConsumptionAgainstMatchedPo(input.workspaceId, document.id, map.lineItems, values, document.codingData)
      if (poConsumption) results.push(poConsumption)
    }

    if (map.openingBalance && map.closingBalance) {
      const transactions = Array.isArray(get("transactions")) ? (get("transactions") as unknown[]).map((row) => {
        const r = row as Record<string, unknown> | null
        return { debit: asNumber(r?.debit), credit: asNumber(r?.credit), running_balance: asNumber(r?.running_balance), account_ref: asString(r?.account_ref) }
      }) : []
      const accounts = Array.isArray(get("accounts")) ? (get("accounts") as unknown[]).map((row) => {
        const r = row as Record<string, unknown> | null
        return { account_number: asString(r?.account_number), opening_balance: asNumber(r?.opening_balance), closing_balance: asNumber(r?.closing_balance) }
      }) : []
      const balance = checkStatementBalance({ currencyCode, openingBalance: asNumber(get("openingBalance")), closingBalance: asNumber(get("closingBalance")), transactions, accounts })
      if (balance) results.push(balance)

      // #207: layout drift, only meaningful once a person has asserted an institution for this
      // statement. First statement for a newly-asserted institution has nothing to diff
      // against — this call learns the layout instead of judging it.
      if (document.institutionId) {
        const rawTransactions = Array.isArray(get("transactions")) ? (get("transactions") as unknown[]).filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : []
        const drift = await checkStatementDriftAgainstInstitution(input.workspaceId, document.institutionId, rawTransactions)
        if (drift) results.push(drift)
      }
    }

    const taxProfile = map.taxTotal || map.supplierVatNumber ? await getTaxProfile(input.workspaceId) : null

    if (map.taxTotal && taxProfile) {
      // expense_receipt has no subtotal field; derive it from total - tax when both are present,
      // since "subtotal" here means only "the base the rate applies to", not a printed field.
      const subtotal = asNumber(get("subtotal")) ?? (asNumber(get("total")) !== null && asNumber(get("taxTotal")) !== null ? (asNumber(get("total")) as number) - (asNumber(get("taxTotal")) as number) : null)
      const taxConsistency = checkTaxConsistency({ currencyCode, documentDate: asDate(get("date")), subtotal, taxTotal: asNumber(get("taxTotal")), rates: taxProfile.config.rates })
      if (taxConsistency) results.push(taxConsistency)
    }

    if (map.supplierVatNumber && taxProfile?.config.registrationNumberPattern) {
      const vatNumber = checkVatNumber({ vatNumber: asString(get("supplierVatNumber")), registrationNumberPattern: taxProfile.config.registrationNumberPattern })
      if (vatNumber) results.push(vatNumber)
    }

    if (map.supplier && map.paymentIban) {
      const bankDetails = await checkSupplierBankDetails(input.workspaceId, asString(get("supplier")), asString(get("paymentIban")))
      if (bankDetails) results.push(bankDetails)
    }

    // A2.5 vendor-onboarding: only for first-sighting suppliers. Reads the extracted supplier
    // fields (address, IBAN, VAT) directly; skips silently when nothing to check.
    if (map.supplier) {
      const supplierName = asString(get("supplier"))
      if (supplierName) {
        const onboarding = await checkVendorOnboardingForDocument(input.workspaceId, {
          supplierName,
          paymentIban: map.paymentIban ? asString(get("paymentIban")) : null,
          vatNumber: map.supplierVatNumber ? asString(get("supplierVatNumber")) : null,
          vatFormatPass: results.find((r) => r.checkCode === "vat_number_format")?.status === "pass"
            ? true : results.find((r) => r.checkCode === "vat_number_format")?.status === "warn" ? false : null,
          address: asString(values["supplier_address"]),
          senderEmail: asString(values["supplier_email"]),
        })
        if (onboarding) results.push(onboarding)
      }
    }

    // A2.8 split-invoice: same-supplier documents in a 7-day window whose totals sum near an
    // approval threshold while each stays under it.
    if (map.supplier && map.total) {
      const split = await checkSplitInvoicesAgainstHistory(input.workspaceId, document.templateId, document.id, asString(get("supplier")), asNumber(get("total")), asDate(get("date")), map)
      if (split) results.push(split)
    }

    if (map.supplier && map.invoiceNumber && map.total) {
      const totalValue = asNumber(get("total"))
      // A2.3: infer credit-note-ness deterministically — negative total OR the template's own
      // documentType is a credit note. Consumers already know the sign; nothing else changes.
      const isCreditNote = totalValue !== null && totalValue < 0
      const identity: DocumentIdentity = {
        documentId: document.id, supplier: asString(get("supplier")), invoiceNumber: asString(get("invoiceNumber")), total: totalValue, currencyCode, isCreditNote,
        fieldKeys: { supplier: map.supplier, invoiceNumber: map.invoiceNumber, total: map.total },
      }
      results.push(...(await checkDuplicates(input.workspaceId, document.templateId, identity, map)))
      const resubmission = await checkSuspiciousResubmission(input.workspaceId, document.id, identity)
      if (resubmission) results.push(resubmission)

      // A2.7: per-supplier amount anomaly + round-number spike.
      const anomaly = await checkAmountAnomalyAgainstHistory(input.workspaceId, document.templateId, document.id, identity, map)
      if (anomaly) results.push(anomaly)
    }

    // #461: pre-post warn that the source file the connected ledger would attach after posting
    // is over its size/type limit — known statically, before the post, per ADR 0016.
    const attachLimit = await checkAttachmentLimitForDocument(input.workspaceId, document)
    if (attachLimit) results.push(attachLimit)

    // A2.1: PDF forensic mismatches (DocInfo vs XMP dates/tools). Only meaningful for PDFs.
    const forensics = await runPdfForensicsCheck(input.workspaceId, document.id, document.mimeType ?? null)
    if (forensics) results.push(forensics)

    // A2.6 text-layer vs OCR divergence: only meaningful for PDFs with both signals.
    const divergence = await runTextLayerDivergenceCheck(input.workspaceId, document.id, document.mimeType ?? null, document.ocrText ?? null)
    if (divergence) results.push(divergence)

    if (map.accountNumber && map.periodStart && map.periodEnd) {
      const accountNumber = asString(get("accountNumber"))
      if (accountNumber) {
        const periods = await siblingStatementPeriods(input.workspaceId, document.templateId, document.id, accountNumber, map)
        const missing = findMissingStatementPeriods(periods)
        if (missing) results.push(missing)
      }
    }

    for (const result of results) await persistCheckResult(input.workspaceId, document.id, result)
    await refreshLineCodingChecks(input.workspaceId, document.id)
  } catch (error) {
    console.error("[checks] failed to run deterministic checks:", error instanceof Error ? error.message : error)
  }
}

type LineCodingDocument = { id: string; codingData: unknown; reviewedData: unknown }

/** ADR 0014: re-judges a document's coding against the ledger it would post to and persists the
 * result — every firing code a fail, every earlier fail that no longer fires flipped to pass, so a
 * fix clears the Check. Runs after extraction, after Save review, and after every Sync accounts
 * (the connection variant). Never throws past the caller. */
export async function refreshLineCodingChecks(workspaceId: string, documentId: string): Promise<void> {
  try {
    const [document, connection] = await Promise.all([
      prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { id: true, codingData: true, reviewedData: true } }),
      prisma.integrationConnection.findFirst({ where: { workspaceId, status: "connected" }, orderBy: { createdAt: "asc" }, select: { id: true, provider: true, ledgerCapabilities: true } }),
    ])
    if (document && connection) await persistLineCodingChecks(workspaceId, connection, [document])
  } catch (error) {
    console.error("[checks] line coding refresh failed:", error instanceof Error ? error.message : error)
  }
}

/** The connection's reviewed, not-yet-posted documents, after a sync changed what the ledger takes. */
export async function refreshLineCodingChecksForConnection(workspaceId: string, connectionId: string): Promise<void> {
  try {
    const connection = await prisma.integrationConnection.findFirst({ where: { id: connectionId, workspaceId }, select: { id: true, provider: true, ledgerCapabilities: true } })
    if (!connection) return
    const posted = await prisma.integrationPush.findMany({ where: { workspaceId, connectionId, status: "succeeded" }, select: { documentId: true } })
    const documents = await prisma.document.findMany({
      where: { workspaceId, status: "reviewed", id: { notIn: posted.map((push) => push.documentId) } },
      select: { id: true, codingData: true, reviewedData: true },
    })
    await persistLineCodingChecks(workspaceId, connection, documents)
  } catch (error) {
    console.error("[checks] line coding refresh for connection failed:", error instanceof Error ? error.message : error)
  }
}

type LineCodingConnection = { id: string; provider: string; ledgerCapabilities: Prisma.JsonValue | null }

async function persistLineCodingChecks(workspaceId: string, connection: LineCodingConnection, documents: LineCodingDocument[]): Promise<void> {
  const context = await loadLineCodingContext(workspaceId, connection)
  if (!context) return
  for (const document of documents) {
    const input = lineCodingInputFromDocument(document)
    if (!input) continue
    const results = checkLineCoding({ ...context, ...input })
    for (const result of results) await persistCheckResult(workspaceId, document.id, result)
    const firing = new Set(results.map((result) => result.checkCode))
    await prisma.documentCheckResult.updateMany({
      where: { workspaceId, documentId: document.id, status: { not: "pass" }, checkCode: { in: LINE_CODING_CHECK_CODES.filter((code) => !firing.has(code)) } },
      data: { status: "pass" },
    })
  }
}

/** ADR 0014: the post read-back's warn Checks (lib/checks/line-coding.ts ledgerReadBackChecks),
 * written after the push is marked posted. */
export async function recordLedgerReadBack(workspaceId: string, documentId: string, results: CheckResult[]): Promise<void> {
  for (const result of results) await persistCheckResult(workspaceId, documentId, result)
}

async function persistCheckResult(workspaceId: string, documentId: string, result: CheckResult): Promise<void> {
  const status = result.status === "fail" && !FAIL_BY_DEFAULT.has(result.checkCode) && result.checkCode !== "duplicate" ? "warn" : result.status
  const detail = result.detail || result.fields ? { ...(result.detail ?? {}), fields: result.fields ?? [] } : null
  await prisma.documentCheckResult.upsert({
    where: { documentId_checkCode: { documentId, checkCode: result.checkCode } },
    create: { workspaceId, documentId, checkCode: result.checkCode, status, message: result.message, detail: detail as Prisma.InputJsonValue },
    update: { status, message: result.message, detail: detail as Prisma.InputJsonValue },
  })
  if (status === "pass") return

  await track("document_check_failed", { documentId, checkCode: result.checkCode, status: status as "warn" | "fail" }, { workspaceId })
  // One open review task per (document, check) — a reprocess that still fails the same check
  // must not pile up duplicate tasks every run.
  const existing = await prisma.reviewTask.findFirst({ where: { workspaceId, documentId, reason: "check_failed", status: { in: ["open", "in_review"] }, detail: { contains: result.checkCode } }, select: { id: true } })
  if (!existing) await createReviewTask({ workspaceId, documentId, reason: "check_failed", detail: `${result.checkCode}: ${result.message}`, priority: status === "fail" ? 1 : 0, createdById: null })
  // WP-AP1: check.failed webhook. Best-effort — never throw past persistCheckResult.
  try {
    const emitted = await emitAccountsPayableEvent(prisma, {
      workspaceId,
      createdAt: new Date(),
      event: { type: "check.failed", documentId, data: { check_code: result.checkCode, status: status as "warn" | "fail", message: result.message } },
    })
    if (emitted.queued > 0) await kickWebhookDrain().catch(() => {})
  } catch (error) {
    console.error("[checks] check.failed webhook emit failed:", error instanceof Error ? error.message : error)
  }
}

/** #207 wiring: reads the institution's saved layout, evaluates drift, and — for the first
 * statement seen for a newly-asserted institution — learns the layout instead of judging it
 * (there is nothing to diff against yet, per #183's inventory requirement that "not applicable"
 * be a real, distinguishable state). Confirmed drift never auto-updates the saved layout; only a
 * reviewer choosing "Accept as new layout" does that (that UI flow is #220's scope). */
async function checkStatementDriftAgainstInstitution(workspaceId: string, institutionId: string, transactions: Array<Record<string, unknown>>): Promise<CheckResult | null> {
  try {
    const institution = await prisma.institution.findFirst({ where: { id: institutionId, workspaceId }, select: { savedLayout: true } })
    if (!institution) return null
    const savedLayout = institution.savedLayout as StatementLayout | null
    const result = evaluateStatementDrift({ transactions, savedLayout })
    if (result.kind === "not_applicable" && transactions.length) {
      await prisma.institution.update({ where: { id: institutionId }, data: { savedLayout: deriveStatementLayout(transactions) as unknown as Prisma.InputJsonValue } })
      return null
    }
    if (result.kind !== "drift") return null
    return { checkCode: "statement_layout_drift", status: "warn", message: `This statement's layout differs from the saved layout for this institution: ${result.changes.join("; ")}`, detail: { changes: result.changes, layout: result.layout } }
  } catch (error) {
    console.error("[checks] statement layout drift lookup failed:", error instanceof Error ? error.message : error)
    return null
  }
}

/** #206 wiring: finds the PO this invoice matched to (lib/matching's po_to_invoice edge), pulls
 * its line items plus every sibling invoice already matched to the same PO, and hands the pooled
 * consumption to the pure checker. Skips silently when the invoice has no PO match yet — the
 * check only makes sense once matching has run. */
async function checkPoLineConsumptionAgainstMatchedPo(workspaceId: string, documentId: string, lineItemsKey: string, currentValues: Record<string, unknown>, currentCodingData: unknown): Promise<CheckResult | null> {
  try {
    // #228 Q11: only a *compared* link counts — confirmed by hand, or the matcher's guess when
    // the invoice cites the same PO number. A suggestion compares nothing; a rejected link is gone.
    const candidates = await prisma.documentMatch.findMany({
      where: { workspaceId, matchType: "po_to_invoice", targetId: documentId, status: { not: REJECTED_MATCH_STATUS } },
      select: { id: true, sourceId: true, status: true, confidence: true, lineAssignments: true, source: { select: { reviewedData: true, rawExtraction: true, codingData: true } } },
    })
    const invoicePoNumber = asString(currentValues.po_number) ?? asString(currentValues.purchase_order_number)
    const ranked = rankPoLinks(candidates.map((row) => {
      const poValues = (row.source.reviewedData ?? row.source.rawExtraction ?? {}) as Record<string, unknown>
      const poNumber = asString(poValues.po_number)
      return { row, poValues, poNumber, confidence: row.confidence, kind: poLinkKind({ status: row.status, invoicePoNumber, poNumber }) }
    })).filter((link) => isComparedLink(link.kind))
    const match = ranked[0]
    if (!match) return null
    const poLineItems = parseLineItemsForConsumption(match.poValues[lineItemsKey], match.row.source.codingData)
    if (!poLineItems.length) return null

    // Only siblings that are themselves *compared* against this PO consume its lines — a merely
    // suggested link on another invoice must not push this one over the allowance.
    const siblingMatches = await prisma.documentMatch.findMany({ where: { workspaceId, matchType: "po_to_invoice", sourceId: match.row.sourceId, targetId: { not: documentId }, status: { not: REJECTED_MATCH_STATUS } }, select: { targetId: true, status: true } })
    const siblingStatus = new Map(siblingMatches.map((s) => [s.targetId, s.status]))
    const siblings = siblingMatches.length ? await prisma.document.findMany({ where: { workspaceId, id: { in: siblingMatches.map((s) => s.targetId) } }, select: { id: true, filename: true, reviewedData: true, codingData: true } }) : []

    const invoiceLineItems: PoLineConsumptionInput["invoiceLineItems"] = parseLineItemsForConsumption(currentValues[lineItemsKey], currentCodingData).map((item, rowIndex) => ({ documentId, rowIndex, ...item }))
    const siblingLabels: Record<string, string> = {}
    for (const sibling of siblings) {
      const values = (sibling.reviewedData ?? {}) as Record<string, unknown>
      const siblingKind = poLinkKind({ status: siblingStatus.get(sibling.id) ?? "pending", invoicePoNumber: asString(values.po_number) ?? asString(values.purchase_order_number), poNumber: match.poNumber })
      if (!isComparedLink(siblingKind)) continue
      siblingLabels[sibling.id] = asString(values.invoice_number) ?? sibling.filename
      invoiceLineItems.push(...parseLineItemsForConsumption(values[lineItemsKey], sibling.codingData).map((item, rowIndex) => ({ documentId: sibling.id, rowIndex, ...item })))
    }

    const [workspace, config] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { poQuantityTolerancePercent: true } }),
      prisma.workspaceAutomationConfig.findUnique({ where: { workspaceId }, select: { matchTolerance: true } }),
    ])
    // #228 Q12: the unit-price allowance is the workspace match-variance percent (stored as a
    // fraction, 0.02 = 2 %).
    const tolerance = config?.matchTolerance && typeof config.matchTolerance === "object" && !Array.isArray(config.matchTolerance) ? (config.matchTolerance as { percent?: number }) : null
    const priceTolerancePercent = Math.round(((typeof tolerance?.percent === "number" ? tolerance.percent : 0.02) * 100) * 100) / 100
    return checkPoLineConsumption({
      poDocumentId: match.row.sourceId,
      poNumber: match.poNumber,
      poLineItems,
      invoiceLineItems,
      quantityTolerancePercent: workspace?.poQuantityTolerancePercent ?? 5,
      priceTolerancePercent,
      lineAssignments: parseLineAssignments(match.row.lineAssignments),
      siblingLabels,
      currentDocumentId: documentId,
    })
  } catch (error) {
    console.error("[checks] po line consumption lookup failed:", error instanceof Error ? error.message : error)
    return null
  }
}

/** #459: `itemExternalId` comes from `codingData.items[index].item_external_id`, index-aligned
 * with the reviewed line items (see `resolveDocumentCodingItems`'s `lineItems` param) — the raw
 * extraction never carries an item id itself. A document with no coding yet (or fewer coded rows
 * than line items) resolves those rows to no item, same as before this wiring existed. */
function parseLineItemsForConsumption(value: unknown, codingData?: unknown): Array<{ description: string | null; quantity: number | null; unitPrice: number | null; itemExternalId?: string | null }> {
  if (!Array.isArray(value)) return []
  const coding = codingData && typeof codingData === "object" ? (codingData as Record<string, unknown>) : null
  const codingItems = coding && Array.isArray(coding.items) ? (coding.items as unknown[]) : []
  return value.map((item, index) => {
    const row = item as Record<string, unknown> | null
    const codingRow = codingItems[index] as Record<string, unknown> | null | undefined
    const itemExternalId = typeof codingRow?.item_external_id === "string" ? codingRow.item_external_id : null
    return { description: asString(row?.description), quantity: asNumber(row?.quantity), unitPrice: asNumber(row?.unit_price), itemExternalId }
  })
}

/** A2.2 wiring: resolves the extracted supplier through the A5 registry, compares this document's
 * payment IBAN against the supplier's remembered bank details, and LEARNS a first-seen IBAN onto
 * the Supplier row (audited — a remembered detail is a security-relevant fact). A change is never
 * learned automatically: the check fails, and only a person updating the supplier clears it. */
async function checkSupplierBankDetails(workspaceId: string, supplierName: string | null, extractedIban: string | null): Promise<CheckResult | null> {
  if (!supplierName || !normalizeIban(extractedIban)) return null
  const resolution = await resolveSupplier(workspaceId, supplierName)
  if (!resolution.supplierId) {
    // Registry hasn't seen this supplier yet (worker ordering or backfill gap) — compare against
    // nothing; the observation writer will create the row and next run learns the IBAN.
    return checkBankDetails({ extractedIban, knownIban: null, supplierName })
  }
  const supplier = await prisma.supplier.findUnique({ where: { id: resolution.supplierId }, select: { iban: true, canonicalName: true } })
  const result = checkBankDetails({ extractedIban, knownIban: supplier?.iban ?? null, supplierName: supplier?.canonicalName ?? supplierName })
  if (result?.status === "pass" && result.detail?.firstSeen && supplier) {
    const iban = normalizeIban(extractedIban)
    await prisma.supplier.update({ where: { id: resolution.supplierId }, data: { iban, bankDetails: { iban } } }).catch(() => {})
    await recordSystemAudit({ workspaceId, type: "supplier.bank_details_learned", detail: { supplierId: resolution.supplierId, iban } })
  }
  return result
}

/** A2.7 wiring: pulls the supplier's per-template amount history (capped to the last N
 * comparable documents) and hands it to the pure checker. Fails silent on any lookup error —
 * an anomaly report is a "look at it" signal, never a blocker on its own. */
async function checkAmountAnomalyAgainstHistory(workspaceId: string, templateId: string | null, documentId: string, identity: DocumentIdentity, map: CheckFieldMap): Promise<CheckResult | null> {
  if (!templateId || !map.supplier || !map.total || identity.total === null || !identity.supplier?.trim()) return null
  const supplier = identity.supplier.trim().toLowerCase()
  const siblings = await prisma.document.findMany({
    where: { workspaceId, templateId, id: { not: documentId }, status: { notIn: ["received", "queued", "processing"] } },
    select: { reviewedData: true },
    orderBy: { receivedAt: "desc" },
    take: 500,
  })
  const history: number[] = []
  for (const sibling of siblings) {
    const values = (sibling.reviewedData ?? {}) as Record<string, unknown>
    const otherSupplier = asString(values[map.supplier as string])?.trim().toLowerCase() ?? null
    const otherTotal = asNumber(values[map.total as string])
    if (otherSupplier === supplier && otherTotal !== null) history.push(otherTotal)
    if (history.length >= 200) break
  }
  return checkAmountAnomaly({ amount: identity.total, history, supplierName: identity.supplier })
}

/** A2.1 wiring: reads the first 64KB and last 64KB of the source PDF (metadata clusters near
 * the trailer, XMP earlier) and runs the pure forensic check. Never throws; a storage read
 * miss simply skips the check. */
/** A2.6 wiring: reads the source PDF's embedded text layer via pdfjs and hands it to the pure
 * divergence check alongside the ocrText we already have. Never throws; a scanned PDF with no
 * text layer returns silently. */
async function runTextLayerDivergenceCheck(workspaceId: string, documentId: string, mimeType: string | null, ocrText: string | null): Promise<CheckResult | null> {
  if (mimeType !== "application/pdf" || !ocrText?.trim()) return null
  try {
    const buffer = await readDocumentSource(documentStorageKey(workspaceId, documentId))
    const textLayer = await extractPdfTextLayer(buffer)
    if (!textLayer) return null
    return checkTextLayerDivergence({ textLayer, ocrText })
  } catch (error) {
    console.error("[checks] text-layer read failed:", error instanceof Error ? error.message : error)
    return null
  }
}

async function runPdfForensicsCheck(workspaceId: string, documentId: string, mimeType: string | null): Promise<CheckResult | null> {
  if (mimeType !== "application/pdf") return null
  try {
    const buffer = await readDocumentSource(documentStorageKey(workspaceId, documentId))
    // A truncated head+tail is enough for forensic markers without loading the whole file.
    const head = buffer.subarray(0, Math.min(buffer.length, 65_536))
    const tail = buffer.length > 65_536 ? buffer.subarray(buffer.length - 65_536) : Buffer.alloc(0)
    const sample = tail.length ? Buffer.concat([head, tail]) : head
    return checkPdfForensics(readPdfForensicSignals(sample))
  } catch (error) {
    console.error("[checks] pdf forensics read failed:", error instanceof Error ? error.message : error)
    return null
  }
}

/** A2.5 wiring: resolves the supplier through the A5 registry to read its documentCount, then
 * calls the pure onboarding checker. Silent on any registry hiccup (this is a warn-level check;
 * a check failure to run must not block the pipeline). */
/** #461: only meaningful once a ledger is connected — no connection means no attach step ever
 * runs, so there is nothing to warn about yet. Cheap path: the stored file's own size/type covers
 * every case except a split child (its own page range cut from the parent's stored PDF) or a
 * HEIC/WEBP image (converted to JPEG for the attach) — only those two need the actual rendered
 * size, computed once here via the same pure rendition the attempt will use. Never throws past
 * the caller (runDeterministicChecks already wraps the whole pass in try/catch, but this can run
 * ahead of storage being available for a very old document, and a warn Check must never crash the
 * whole run over a missing file). */
async function checkAttachmentLimitForDocument(workspaceId: string, document: {
  id: string
  mimeType: string
  sizeBytes: number
  pageRange: string | null
  storageKey: string | null
  filename: string
}): Promise<CheckResult | null> {
  try {
    const connection = await prisma.integrationConnection.findFirst({ where: { workspaceId, status: "connected" }, select: { provider: true } })
    if (!connection) return null
    const provider = connection.provider as AttachProvider

    const needsRendition = Boolean(document.pageRange) || document.mimeType === "image/heic" || document.mimeType === "image/webp"
    if (!needsRendition) {
      return checkAttachmentLimit({ provider, contentType: document.mimeType, sizeBytes: document.sizeBytes })
    }
    if (!document.storageKey) return null
    const rendition = await loadAttachmentRendition(document)
    return checkAttachmentLimit({ provider, contentType: rendition.contentType, sizeBytes: rendition.buffer.length })
  } catch (error) {
    console.error("[checks] attachment limit check failed:", error instanceof Error ? error.message : error)
    return null
  }
}

async function checkVendorOnboardingForDocument(workspaceId: string, input: {
  supplierName: string
  paymentIban: string | null
  vatNumber: string | null
  vatFormatPass: boolean | null
  address: string | null
  senderEmail: string | null
}): Promise<CheckResult | null> {
  try {
    const resolution = await resolveSupplier(workspaceId, input.supplierName)
    const supplierRow = resolution.supplierId ? await prisma.supplier.findUnique({ where: { id: resolution.supplierId }, select: { documentCount: true } }) : null
    return checkVendorOnboarding({
      supplierName: input.supplierName,
      senderEmail: input.senderEmail,
      supplierAddress: input.address,
      paymentIban: input.paymentIban,
      vatNumber: input.vatNumber,
      vatFormatPass: input.vatFormatPass,
      supplierDocumentCount: supplierRow?.documentCount ?? 0,
    })
  } catch (error) {
    console.error("[checks] vendor onboarding lookup failed:", error instanceof Error ? error.message : error)
    return null
  }
}

/** A2.8 wiring: pulls up to N same-template sibling documents in a 7-day window from the same
 * supplier, then hands them to the pure split-invoice checker. Approval threshold comes from
 * the smallest active ReviewRoutingRule.thresholdAmount above zero, or a 1000 default. */
async function checkSplitInvoicesAgainstHistory(workspaceId: string, templateId: string | null, documentId: string, supplierName: string | null, amount: number | null, date: Date | null, map: CheckFieldMap): Promise<CheckResult | null> {
  if (!templateId || !supplierName?.trim() || amount === null || !date) return null
  try {
    const supplier = supplierName.trim().toLowerCase()
    const windowStart = new Date(date.getTime() - 7 * 86400_000)
    const siblings = await prisma.document.findMany({
      where: { workspaceId, templateId, id: { not: documentId }, receivedAt: { gte: windowStart, lte: date } },
      select: { id: true, reviewedData: true, receivedAt: true },
      orderBy: { receivedAt: "desc" },
      take: 50,
    })
    if (!map.supplier || !map.total) return null
    const window: { documentId: string; amount: number; date: Date }[] = []
    for (const sibling of siblings) {
      const values = (sibling.reviewedData ?? {}) as Record<string, unknown>
      const otherSupplier = asString(values[map.supplier as string])?.trim().toLowerCase() ?? null
      const otherAmount = asNumber(values[map.total as string])
      if (otherSupplier !== supplier || otherAmount === null) continue
      window.push({ documentId: sibling.id, amount: otherAmount, date: sibling.receivedAt })
    }
    // Pull the smallest matcher.minAmount configured on any ReviewRoutingRule (approval
    // trip-point), else the smallest active WorkspaceBudget amount, else 1000. The workspace's
    // routing UI is what makes a rule's threshold a "real" approval boundary; a budget is a
    // reasonable fallback.
    const routing = await prisma.reviewRoutingRule.findMany({ where: { workspaceId, isActive: true }, select: { matcher: true } }).catch(() => [])
    const routingThresholds = routing
      .map((r) => (r.matcher as Record<string, unknown> | null)?.minAmount)
      .filter((v): v is number => typeof v === "number" && v > 0)
    const budgets = await prisma.workspaceBudget.findMany({ where: { workspaceId, isActive: true }, select: { amount: true } }).catch(() => [])
    const budgetThresholds = budgets
      .map((b) => decimalToNumber(b.amount))
      .filter((v): v is number => typeof v === "number" && v > 0)
    const allThresholds = [...routingThresholds, ...budgetThresholds]
    const approvalThreshold = allThresholds.length ? Math.min(...allThresholds) : 1000
    return checkSplitInvoices({ candidateAmount: amount, candidateDate: date, siblings: window, approvalThreshold, fieldKeys: { amount: map.total, date: map.date } })
  } catch (error) {
    console.error("[checks] split-invoice lookup failed:", error instanceof Error ? error.message : error)
    return null
  }
}

async function checkDuplicates(workspaceId: string, templateId: string | null, identity: DocumentIdentity, map: CheckFieldMap): Promise<CheckResult[]> {
  const ingestion = await prisma.ingestionItem.findFirst({ where: { workspaceId, documentId: identity.documentId }, select: { status: true } })
  if (ingestion?.status === "duplicate") {
    return [{ checkCode: "duplicate", status: "fail", fields: [map.total ?? "total", map.supplier ?? "supplier", map.invoiceNumber ?? "invoice_number"], message: "This exact file was already ingested into this workspace.", detail: { exact: true } }]
  }
  if (!templateId || !map.supplier || !map.invoiceNumber || !map.total) return []
  const siblings = await prisma.document.findMany({
    where: { workspaceId, templateId, id: { not: identity.documentId }, status: { notIn: ["received", "queued", "processing"] } },
    select: { id: true, reviewedData: true },
    take: 500,
  })
  const others: DocumentIdentity[] = siblings.map((sibling) => {
    const values = (sibling.reviewedData ?? {}) as Record<string, unknown>
    return { documentId: sibling.id, supplier: asString(values[map.supplier as string]), invoiceNumber: asString(values[map.invoiceNumber as string]), total: asNumber(values[map.total as string]), currencyCode: identity.currencyCode }
  })
  const result = findNearDuplicate(identity, others)
  return result ? [result] : []
}

/** A document is a suspicious resubmission when the same supplier + invoice number was already
 * rejected once in this workspace's review history — someone re-sending a bill after being told
 * no, whether by mistake or on purpose, is exactly the pattern a person should see, not silently
 * re-process. */
async function checkSuspiciousResubmission(workspaceId: string, documentId: string, identity: DocumentIdentity): Promise<CheckResult | null> {
  if (!identity.supplier || !identity.invoiceNumber) return null
  // Matching JSON field values case-insensitively per doc type is exactly the per-type
  // mapping problem DOC_TYPE_SPECS.checkFields already solves — reusing it avoids
  // a second, JSON-path dialect of the same logic in raw SQL. The candidate set is capped, not
  // exhaustive: a workspace with an unbounded rejection history is a real edge case, but scanning
  // the 200 most recent rejections is more than enough to catch a resubmission of something
  // recently rejected, which is the case this check exists for.
  const rejectedTasks = await prisma.reviewTask.findMany({
    where: { workspaceId, status: "rejected", documentId: { not: documentId } },
    select: { documentId: true },
    orderBy: { createdAt: "desc" },
    take: 200,
    distinct: ["documentId"],
  })
  if (!rejectedTasks.length) return null

  const rejectedDocuments = await prisma.document.findMany({
    where: { workspaceId, id: { in: rejectedTasks.map((task) => task.documentId) } },
    select: { id: true, reviewedData: true, docType: true, template: { select: { code: true } } },
  })
  const supplier = identity.supplier.trim().toLowerCase()
  const invoiceNumber = identity.invoiceNumber.trim().toLowerCase()
  const match = rejectedDocuments.find((candidate) => {
    const candidateMap = DOC_TYPE_SPECS[resolveDocType(candidate)].checkFields
    if (!candidateMap?.supplier || !candidateMap.invoiceNumber) return false
    const values = (candidate.reviewedData ?? {}) as Record<string, unknown>
    return asString(values[candidateMap.supplier])?.trim().toLowerCase() === supplier && asString(values[candidateMap.invoiceNumber])?.trim().toLowerCase() === invoiceNumber
  })
  if (!match) return null
  return { checkCode: "suspicious_resubmission", status: "warn", fields: [identity.fieldKeys?.supplier ?? "supplier", identity.fieldKeys?.invoiceNumber ?? "invoice_number"], message: "Same supplier and invoice number as a document rejected in a previous review.", detail: { rejectedDocumentId: match.id } }
}

async function siblingStatementPeriods(workspaceId: string, templateId: string | null, documentId: string, accountNumber: string, map: CheckFieldMap) {
  if (!templateId || !map.periodStart || !map.periodEnd || !map.accountNumber) return []
  const siblings = await prisma.document.findMany({
    where: { workspaceId, templateId, status: { notIn: ["received", "queued", "processing"] } },
    select: { id: true, reviewedData: true },
    take: 500,
  })
  return siblings
    .map((sibling) => {
      const values = (sibling.reviewedData ?? {}) as Record<string, unknown>
      if (asString(values[map.accountNumber as string]) !== accountNumber) return null
      const periodStart = asDate(values[map.periodStart as string])
      const periodEnd = asDate(values[map.periodEnd as string])
      return periodStart && periodEnd ? { periodStart, periodEnd } : null
    })
    .filter((period): period is { periodStart: Date; periodEnd: Date } => period !== null)
}
