// Deliberately NOT a "use server" module, matching every other models/*.ts helper in this
// package: this trusts the documentId/workspaceId it is handed. Called from the worker
// (lib/document-processing.ts), which has already authorised the document by construction.
import { track } from "@/lib/analytics"
import { recordSystemAudit } from "@/lib/audit"
import { checkInvoiceArithmetic } from "@/lib/checks/arithmetic"
import { checkLineItemArithmetic } from "@/lib/checks/line-item-arithmetic"
import { checkAmountAnomaly } from "@/lib/checks/amount-anomaly"
import { checkBankDetails } from "@/lib/checks/bank-details"
import { checkPdfForensics, readPdfForensicSignals } from "@/lib/checks/pdf-forensics"
import { checkTextLayerDivergence } from "@/lib/checks/text-layer-divergence"
import { extractPdfTextLayer } from "@/lib/pdf/text-layer"
import { checkSplitInvoices } from "@/lib/checks/split-invoices"
import { checkVendorOnboarding } from "@/lib/checks/vendor-onboarding"
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
import { emitAccountsPayableEvent } from "@/lib/webhooks"
import { kickWebhookDrain } from "@/lib/webhook-delivery"
import { getTaxProfile } from "@/models/tax-profiles"
import { DOC_TYPE_SPECS, resolveDocType, type CheckFieldMap } from "@/lib/doc-types"
import { Prisma } from "@/prisma/client"

/** Only these two default to "fail" — every other check defaults to "warn" (the roadmap's own
 * call): a wrong total or a knowingly-reingested file are not judgment calls, everything else
 * (a statement's own rounding, a rate mismatch, a plausible near-dupe) is worth a look, not a
 * block. "duplicate" is fail only for its exact-match branch — see runDeterministicChecks. */
const FAIL_BY_DEFAULT = new Set(["invoice_arithmetic", "bank_detail_change"])

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
      select: { id: true, templateId: true, reviewedData: true, mimeType: true, ocrText: true, docType: true, template: { select: { code: true } } },
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
  } catch (error) {
    console.error("[checks] failed to run deterministic checks:", error instanceof Error ? error.message : error)
  }
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
