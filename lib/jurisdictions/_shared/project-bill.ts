/** Bill projection (#47 Q6/Q7): a bill lives in the DB as `Document.reviewedData` (a JSON
 * snapshot of the reviewed field values) with `Document.fieldSnapshot` as the pre-review
 * fallback. Both are permissively-typed on the DB side because they mirror whatever the
 * template dictated at extraction time.
 *
 * `projectWorkpaperBill` normalises the pair into `WorkpaperBill` — a canonical, well-typed view
 * every workpaper column reads. It does no I/O, does no rate lookups, and does no FX. Missing
 * essentials (invoice date, or gross AND net+vat both absent) return `null`: the caller drops
 * that bill from the workpaper rather than surfacing a partial row. */
import type { WorkpaperBill } from "./workpaper"

/** Permissive input shape covering both `reviewedData` and `fieldSnapshot`. Fields the caller
 * doesn't have are simply left off; the projection prefers `reviewedData` and reaches for
 * `fieldSnapshot` field-by-field on a null. */
export type BillSnapshotInput = {
  id?: string | null
  invoiceDate?: string | Date | null
  receivedAt?: string | Date | null
  currency?: string | null
  net?: number | null
  vat?: number | null
  gross?: number | null
  taxRate?: number | null
  category?: string | null
  supplier?: {
    id?: string | null
    country?: string | null
    vatNumber?: string | null
    name?: string | null
  } | null
  fieldConfidence?: number | null
  codingConfidence?: number | null
}

/** Workspace context the projection needs. Only the country is used (for the `isImport`
 * derivation, #47 Q7); other workspace state is not part of this pure function's contract. */
export type WorkspaceContext = {
  /** ISO-3166 alpha-2, uppercase — the workspace's home country. `isImport` on the projected
   * bill is true iff the supplier's country is set and differs from this. Missing supplier
   * country yields `isImport: false` — the pack-level import rules (LS RSA cross-border) apply
   * their own stricter check anyway, so a false negative here is safe. */
  country: string
}

/** Project a bill snapshot pair into `WorkpaperBill`. Returns null when the essentials are
 * missing (no invoice date, or no gross AND no net-and-vat pair).
 *
 * Both inputs are optional — pass `null` for one to project from the other alone. Passing both
 * lets each field independently prefer `reviewedData`. */
export function projectWorkpaperBill(
  reviewedData: BillSnapshotInput | null,
  fieldSnapshot: BillSnapshotInput | null,
  workspace: WorkspaceContext,
  billId: string,
): WorkpaperBill | null {
  const pick = <K extends keyof BillSnapshotInput>(key: K): BillSnapshotInput[K] => {
    const r = reviewedData?.[key]
    if (r !== undefined && r !== null) return r
    return fieldSnapshot?.[key] ?? null
  }

  const invoiceDateRaw = pick("invoiceDate")
  const invoiceDate = toDate(invoiceDateRaw)
  if (!invoiceDate) return null

  const receivedAt = toDate(pick("receivedAt")) ?? invoiceDate

  const currency = (pick("currency") ?? "") as string
  const netRaw = pick("net") as number | null
  const vatRaw = pick("vat") as number | null
  const grossRaw = pick("gross") as number | null

  const { net, vat, gross } = reconcileMoney(netRaw, vatRaw, grossRaw)
  if (net === null && vat === null && gross === null) return null

  const taxRate = normaliseRate(pick("taxRate") as number | null, net, vat)

  const rawCategory = (pick("category") ?? "expense") as string
  const category: WorkpaperBill["category"] = rawCategory === "capital" ? "capital" : "expense"

  const supplierIn = (reviewedData?.supplier ?? fieldSnapshot?.supplier ?? null)
  const supplierCountry = normaliseCountry(supplierIn?.country ?? null)
  const supplier: WorkpaperBill["supplier"] = {
    id: supplierIn?.id ?? null,
    country: supplierCountry,
    vatNumber: supplierIn?.vatNumber ?? null,
    name: supplierIn?.name ?? "",
  }

  const workspaceCountry = normaliseCountry(workspace.country) ?? ""
  const isImport = supplierCountry !== null && supplierCountry !== workspaceCountry
  const isCapital = category === "capital"

  return {
    id: billId,
    invoiceDate,
    receivedAt,
    currency,
    net: net ?? 0,
    vat: vat ?? 0,
    gross: gross ?? (net ?? 0) + (vat ?? 0),
    taxRate,
    category,
    supplier,
    isImport,
    isCapital,
    fieldConfidence: (pick("fieldConfidence") as number | null) ?? null,
    codingConfidence: (pick("codingConfidence") as number | null) ?? null,
  }
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (v == null) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

/** Fill in whichever leg of net/vat/gross is missing when the other two are present. Silent on
 * outright inconsistency (net + vat !== gross) — the workpaper is not the place to reject a
 * bill; the invoice-validity gate is. */
function reconcileMoney(
  net: number | null,
  vat: number | null,
  gross: number | null,
): { net: number | null; vat: number | null; gross: number | null } {
  const hasNet = net !== null
  const hasVat = vat !== null
  const hasGross = gross !== null
  if (hasNet && hasVat && !hasGross) return { net, vat, gross: net + vat }
  if (hasNet && hasGross && !hasVat) return { net, vat: gross - net, gross }
  if (hasVat && hasGross && !hasNet) return { net: gross - vat, vat, gross }
  return { net, vat, gross }
}

/** When taxRate isn't explicit, infer from net/vat. Returns 0 for zero-VAT bills, the inferred
 * whole-percent rate otherwise; falls back to 0 when net is 0 or missing (can't divide). */
function normaliseRate(rate: number | null, net: number | null, vat: number | null): number {
  if (rate !== null && !isNaN(rate)) return rate
  if (net && vat !== null && net !== 0) {
    const inferred = Math.round((vat / net) * 100)
    return Number.isFinite(inferred) ? inferred : 0
  }
  return 0
}

function normaliseCountry(c: string | null): string | null {
  if (!c) return null
  const t = c.trim().toUpperCase()
  return t.length === 2 ? t : null
}
