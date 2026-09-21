// Deliberately NOT a "use server" module, matching the other models/*.ts helpers — trusts the
// workspaceId it is handed.
import { prisma } from "@/lib/db"
import { resolveSupplier } from "@/lib/suppliers/alias"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"
import { supplierThreshold, SUPPLIER_TRUST_STREAK } from "@/lib/readiness/supplier-thresholds"
import { formatTerms } from "@/lib/payments/terms"
import { SUPPLIER_FIELD_BY_TEMPLATE } from "@/lib/automation/rules"
import { decimalToNumber } from "@/lib/money"

const RECENT_INVOICES_CAP = 5
/** Bounded window to scan for a supplier match before slicing to the cap — see the function
 * doc comment for why this isn't a literal SQL LIMIT. */
const RECENT_INVOICES_SCAN = 200

export type SupplierTrustStanding = { state: "auto" | "idle" | "waiting"; label: string }

export type RecentInvoiceRow = {
  documentId: string
  date: string | null
  number: string | null
  amount: number | null
  currency: string | null
  statusLabel: string
}

export type SupplierSummary =
  | { matched: false }
  | {
      matched: true
      supplierId: string
      name: string
      trust: SupplierTrustStanding
      paymentTerms: string
      bankAccountFact: string | null
      recentInvoices: RecentInvoiceRow[]
    }

/** Scoped read for the Bill form's supplier card (#362, #355 Q6) — the two Admin › Suppliers
 * facts the card shows (trust standing, payment terms — O1/O2 only; coding rules and full
 * history stay in Admin, #354) plus up to 5 recent invoices, capped server-side.
 *
 * `Document` carries no `supplierId` column (only `SupplierAlias` and `bank_match_memory` do —
 * confirmed against schema.prisma at spec time), so "recent invoices" resolves the supplier's
 * alias set and matches the extracted supplier-field value against it — the same pattern
 * `loadVendorCodingHistory` (models/vendor-history.ts) already uses for a different projection:
 * over-fetch a bounded window ordered by recency, filter and sort in code by the row's own
 * extracted date, then slice to the cap before returning. */
export async function getSupplierSummaryForDocument(
  workspaceId: string,
  supplierName: string | null,
  templateCode: string | null,
): Promise<SupplierSummary> {
  const resolution = await resolveSupplier(workspaceId, supplierName)
  if (!resolution.supplierId) return { matched: false }

  const [supplier, aliases, config] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: resolution.supplierId },
      select: {
        id: true, canonicalName: true, paymentTermsDays: true, earlyPaymentDiscountPercent: true,
        earlyPaymentDiscountDays: true, iban: true, bankDetails: true, touchlessSeen: true, consecutiveClean: true,
      },
    }),
    prisma.supplierAlias.findMany({ where: { supplierId: resolution.supplierId }, select: { aliasNormalized: true } }),
    prisma.workspaceAutomationConfig.findUnique({ where: { workspaceId }, select: { minConfidence: true } }),
  ])
  if (!supplier) return { matched: false }

  // Mirrors getSupplierTrust's own arithmetic (lib/analytics/workspace-analytics.ts) rather than
  // re-deriving it — that function takes a workspace-wide `limit` with no per-supplier filter, so
  // it can't be reused directly here; the underlying primitive (supplierThreshold) can.
  const { coldStart } = supplierThreshold({
    workspaceMinConfidence: config?.minConfidence ?? 0.85,
    touchlessSeen: supplier.touchlessSeen,
    consecutiveClean: supplier.consecutiveClean,
  })
  const trust: SupplierTrustStanding = coldStart
    ? { state: "waiting", label: "Still new" }
    : supplier.consecutiveClean >= SUPPLIER_TRUST_STREAK
      ? { state: "auto", label: "Trusted" }
      : { state: "idle", label: "Building trust" }

  const details = (supplier.bankDetails ?? {}) as Record<string, unknown>
  const account = typeof details.account === "string" ? details.account : typeof details.iban === "string" ? details.iban : supplier.iban
  const bankAccountFact = account || null

  const paymentTerms = formatTerms({
    netDays: supplier.paymentTermsDays,
    discountPercent: decimalToNumber(supplier.earlyPaymentDiscountPercent),
    discountDays: supplier.earlyPaymentDiscountDays,
  })

  const recentInvoices = templateCode
    ? await loadRecentInvoices(workspaceId, templateCode, resolution.canonicalName, aliases.map((a: { aliasNormalized: string }) => a.aliasNormalized))
    : []

  return { matched: true, supplierId: supplier.id, name: supplier.canonicalName, trust, paymentTerms, bankAccountFact, recentInvoices }
}

async function loadRecentInvoices(
  workspaceId: string,
  templateCode: string,
  canonicalName: string | null,
  aliasNormalizedNames: string[],
): Promise<RecentInvoiceRow[]> {
  const supplierField = SUPPLIER_FIELD_BY_TEMPLATE[templateCode]
  if (!supplierField) return []
  const acceptedKeys = new Set([canonicalName ? normalizeSupplierName(canonicalName) : null, ...aliasNormalizedNames].filter((k): k is string => !!k))
  if (acceptedKeys.size === 0) return []

  const rows = await prisma.document.findMany({
    where: { workspaceId, template: { code: templateCode } },
    select: { id: true, reviewedData: true, status: true, archivedAt: true },
    orderBy: { updatedAt: "desc" },
    take: RECENT_INVOICES_SCAN,
  })

  const matched: RecentInvoiceRow[] = []
  for (const row of rows) {
    const values = (row.reviewedData ?? {}) as Record<string, unknown>
    const supplierValue = typeof values[supplierField] === "string" ? (values[supplierField] as string) : null
    if (!supplierValue || !acceptedKeys.has(normalizeSupplierName(supplierValue))) continue
    matched.push({
      documentId: row.id,
      date: readString(values, ["date", "invoice_date"]),
      number: readString(values, ["invoice_number", "number"]),
      amount: readNumber(values, ["total", "amount"]),
      currency: readString(values, ["currency"]),
      // Intentionally not the full processingState() machine (models/documents/processing-
      // state.ts): that needs a ReviewTask/check/exception join per row, which is disproportionate
      // for a capped historical list. This is the same raw-status-word pattern already used by
      // components/queue/document-queue.tsx's own StatusPill, kept local since it's a data-layer
      // label, not a component.
      statusLabel: recentInvoiceStatusLabel(row.status, !!row.archivedAt),
    })
  }
  matched.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
  return matched.slice(0, RECENT_INVOICES_CAP)
}

function recentInvoiceStatusLabel(status: string, archived: boolean): string {
  if (archived) return "Archived"
  if (status === "reviewed") return "Reviewed"
  if (status === "failed") return "Failed"
  if (status === "queued") return "Queued"
  return "Needs review"
}

function readString(values: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = values[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return null
}

function readNumber(values: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = values[key]
    if (typeof value === "number") return value
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value)
  }
  return null
}
