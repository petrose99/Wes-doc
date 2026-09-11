/** Shared workpaper substrate — decision #47 fixed the shape, this file holds the types every
 * jurisdiction pack plugs into. Packs register concrete `Workpaper` objects on their default
 * export via the `workpapers?` slot on `JurisdictionPack`; downstream code resolves them through
 * `resolveWorkpapersForJurisdiction`.
 *
 * #47's shape decisions in one place:
 *   - Column selector is a plain TS function returning contributing amount or `null`; no DSL.
 *   - Column config sits in a new pack topic file `workpapers.ts` (not folded into `filings.ts`).
 *   - Rate lines materialise as separate columns rather than a `RateLine` primitive.
 *   - `box?` sits on the column; top-level `boxes` map handles multi-column boxes only.
 *   - RSA-cross-border-style slices are just columns with `role: 'crossCutting'`, not a subtotal
 *     primitive — identical `select` shape, renderer draws the band. */
import type { JurisdictionCode, JurisdictionPack } from "../types"

/** Reference URL to a primary source (SARS / HMRC / LRA / IRS `.gov`). Kept as a string alias
 * rather than a branded type so pack authors can drop URLs straight in — the CI guard on
 * per-pack prompts already enforces the host allow-list at repo scope. */
export type SourceRef = string

/** A workpaper is always evaluated over a period. Kept minimal — the shared code needs the
 * date bounds and the workspace's base currency; pack-specific date maths (LS's 90-day RSA
 * cross-border window) reads `endDate` off this. Everything else about a period (opened by
 * whom, sign-off state) lives on the Close model, not here. */
export type Period = {
  /** Opaque id; pack code owns its shape (e.g. "ZA-2026-M03"). Shared code never parses it. */
  id: string
  startDate: Date
  endDate: Date
  /** Workspace base currency. Referenced by columns that need to reconcile mixed-currency bills
   * — not converted here; the projection layer is responsible for any conversion. */
  workspaceBaseCurrency: string
}

/** Canonical, column-friendly view of a bill. `projectWorkpaperBill` produces this once per bill
 * per run so every column reads the same field names and derivation is centralised (#47 Q6/Q7).
 * Fields that a bill can genuinely lack (missing supplier country, unknown tax rate) stay
 * nullable; columns handle null by returning `null` from their `select`. */
export type WorkpaperBill = {
  id: string
  invoiceDate: Date
  receivedAt: Date
  currency: string
  net: number
  vat: number
  gross: number
  /** 0 / 10 / 15 etc — the standard rate on the bill, not a jurisdiction table lookup. */
  taxRate: number
  /** From bill coding; anything not 'capital' is treated as 'expense' for the isCapital derivation. */
  category: "capital" | "expense"
  supplier: {
    id: string | null
    /** ISO-3166 alpha-2, uppercase. */
    country: string | null
    vatNumber: string | null
    name: string
  }
  /** Derived from `supplier.country !== workspaceCountry` at projection time. */
  isImport: boolean
  /** Derived from `category === 'capital'` at projection time. */
  isCapital: boolean
  fieldConfidence: number | null
  codingConfidence: number | null
}

/** A single column on a workpaper. `select` returns the contributing amount for this bill (net,
 * vat, or a derived slice) or `null` to omit the bill from this column entirely. `null` and `0`
 * are meaningfully different: `null` means "this bill has nothing to say about this column",
 * `0` means "this bill contributes zero" (a zero-rated bill for a VAT column). */
export type WorkpaperColumn = {
  id: string
  label: string
  sourceRef: SourceRef
  select: (bill: WorkpaperBill, period: Period) => number | null
  /** 'primary' = a main tabular column; 'crossCutting' = a highlighted slice (LS's RSA cross-
   * border). The renderer draws a divider between the two groups; both compute identically. */
  role?: "primary" | "crossCutting"
  /** Form box code this column feeds (e.g. VAT201 "14A"). Multi-column boxes go on the
   * top-level `boxes` map instead. */
  box?: string
}

/** A workpaper is one column config + optional multi-column box combiners. `outputVatAsserted:
 * true` is a v1 marker (#47 Q8) — the workpaper carries a single user-typed cell for output VAT;
 * a future pluggable source graduates from the fog patch, not this shape. */
export type Workpaper = {
  /** Stable id used by the close checklist to reference this workpaper (e.g. "ZA_VAT201"). */
  id: string
  /** Human-readable heading for the sheet. */
  label: string
  sourceRef: SourceRef
  cadence: "monthly" | "bimonthly"
  columns: readonly WorkpaperColumn[]
  /** For form boxes that combine multiple columns. `sums` is keyed by column id and holds every
   * primary + crossCutting column's total; the combiner returns the box value. Boxes that map
   * 1:1 to a column just set `box?` on the column instead. */
  boxes?: Readonly<Record<string, (sums: Record<string, number>) => number>>
  /** v1 marker: output-VAT row is user-typed on the sheet, not computed from bills (#47 Q8). */
  outputVatAsserted: true
}

/** Result of running `computeWorkpaper`. Kept as a plain object so any UI (Univer, table view,
 * export) reads the same shape.
 *
 * `rows` are one-per-bill, `values[columnId]` is `null` (not 0) when the column's `select`
 * returned `null` — the layout layer draws a blank cell in that case, not a zero.
 * `totals` are the arithmetic sum over non-null contributions per column id. `boxes` resolves
 * both the 1:1 case (`column.box === boxKey`) and the multi-column case (top-level combiner). */
export type ComputedWorkpaper = {
  rows: Array<{
    billId: string
    values: Record<string, number | null>
  }>
  totals: Record<string, number>
  boxes: Record<string, number>
}

/** Extend `JurisdictionPack` with a `workpapers?: readonly Workpaper[]` slot. This is the only
 * cross-file surface change #68 lands — every downstream pack (#69 ZA, #70 LS) simply drops its
 * workpapers into that slot; empty until they do. */
export function resolveWorkpapersForJurisdiction(pack: JurisdictionPack | null): readonly Workpaper[] {
  return pack?.workpapers ?? []
}

/** Resolve one workpaper by pack and id. Returns null when the pack isn't registered, has no
 * workpapers, or none matches the id — the caller (close checklist) treats all three the same:
 * no sheet to draft. */
export function resolveWorkpaperById(
  pack: JurisdictionPack | null,
  workpaperId: string,
): Workpaper | null {
  const list = resolveWorkpapersForJurisdiction(pack)
  return list.find((wp) => wp.id === workpaperId) ?? null
}

export type { JurisdictionCode }
