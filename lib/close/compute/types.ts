/** Discriminated-union payloads written into `CloseItem.computedValue` (#96). One arm per
 * CloseItemKind — the dispatcher in `./index.ts` picks the matching computer, its return
 * shape lands verbatim on the row, and the audit event carries the same payload for hash-
 * based idempotency in `writeAuditEvent`.
 *
 * The shapes here are intentionally small and stable: the sign-off UI (#97) and any exports
 * read them by field name, and a payload-shape change would rewrite every historical
 * `computedValue` on next recompute. Extension goes through new nullable fields, never
 * renames. */

import type { CloseItemKind } from "../types"

/** Bank recon: "asserted, soft delta" per #42. v1 has no bank-statement ingestion, so the
 * compute layer produces the shape and marks it awaiting the human's asserted closing
 * balance; the delta check materialises once #97 wires the input. */
export type ComputedBankRecon = {
  kind: "bank-recon"
  /** "awaiting-assertion" while no asserted balance has been recorded; "within-tolerance" /
   * "delta-flagged" once one has and the delta is computed. */
  status: "awaiting-assertion" | "within-tolerance" | "delta-flagged"
  /** User-typed closing balance for the period, in workspace base currency. Null until #97
   * writes it. */
  assertedBalance: number | null
  /** DocuBite-side balance, in workspace base currency. v1 leaves this null (no ledger sync
   * consumer for close on this map yet); reserved so #97 / a follow-up can fill it. */
  computedBalance: number | null
  /** `assertedBalance - computedBalance` when both are present. */
  deltaAmount: number | null
  /** Soft-delta tolerance applied. v1 default: 1.0 workspace-currency unit. */
  tolerance: number
}

/** AP aging + open-exception review. v1 aging buckets bills by `daysOverdue` relative to
 * period end; open exceptions are open Gate rows on workspace documents. */
export type ComputedApAging = {
  kind: "ap-aging"
  /** Aging buckets keyed by upper bound in days (inclusive). "current" = due date >= period
   * end. Amounts are gross, in workspace base currency (v1 does no FX — mixed-currency
   * bills contribute their raw gross; a follow-up ticket may fix that). */
  aging: {
    currentAmount: number
    currentCount: number
    days_1_30_amount: number
    days_1_30_count: number
    days_31_60_amount: number
    days_31_60_count: number
    days_61_90_amount: number
    days_61_90_count: number
    days_90_plus_amount: number
    days_90_plus_count: number
  }
  totalOpenAmount: number
  totalOpenCount: number
  /** Open Gate rows on workspace documents at compute time — the exception-queue snapshot.
   * `hardBlockingCount` is the count of `severity=hard`, `state=blocked` rows, which the
   * lock guard in `lockClose` will reject on. */
  openExceptions: {
    hardBlockingCount: number
    softCount: number
    /** First up-to-50 gate ids in creation order, so the UI can hyperlink without a second
     * query. Truncation is fine — the count is authoritative. */
    gateIds: readonly string[]
  }
}

/** Unposted-bill accruals per #46. One journal draft per candidate bill; VAT suspense line
 * added for ZA / LS (jurisdictions honouring the invoice-held input-VAT rule). Never posts.
 * Reversal auto-drafted for the next period, dated `periodEnd + 1 day`. */
export type ComputedUnpostedAccruals = {
  kind: "unposted-bill-accruals"
  /** ISO date of the period end. */
  periodEnd: string
  /** ISO date of the reversal (periodEnd + 1 day). */
  reversalDate: string
  /** True when the jurisdiction accrues VAT suspense (ZA / LS). Non-VAT jurisdictions
   * (or a workspace with no pack) emit no VAT-suspense line even if a bill has vat > 0. */
  vatSuspense: boolean
  proposals: readonly {
    billId: string
    invoiceDate: string
    supplierName: string
    category: string
    /** Net leg debit — Dr `<category>`. */
    debitNet: number
    /** Optional VAT suspense debit. Present only when `vatSuspense` and the bill has vat. */
    debitVatSuspense: number | null
    /** Combined credit to Accruals control (net + vatSuspense). */
    creditAccruals: number
    /** Passthrough of gate state so the surface can flag "accrued despite hard gate open"
     * per #46 ("regardless of gate state"). */
    gateStatus: "clear" | "soft" | "hard-blocking"
  }[]
  /** Totals over `proposals`. */
  totalNet: number
  totalVatSuspense: number
  totalAccruals: number
}

/** VAT201 / VAT-12 workpaper binding. Delegates to `computeWorkpaper` from the shared
 * substrate, so the numeric shape is exactly what packs #69/#70/#85 produce. When the pack
 * declares `workpaperGroups` (LS bundles two tabs under one close item per #85), the
 * result surfaces every sheet in `sheets`; otherwise a single sheet lands in `sheets[0]`. */
export type ComputedVatWorkpaper = {
  kind: "vat-workpaper"
  /** Pack code the workpaper(s) came from — null for a workspace with no jurisdiction pack
   * picked (v1 openClose still creates the row when `vatPeriodEnd`; the shape lands empty
   * so the UI can render "no pack, no workpaper"). */
  packCode: string | null
  packVersion: string | null
  /** Stable group id (from `lsWorkpaperGroups`); null when the sheets aren't grouped —
   * always null for ZA today. */
  groupId: string | null
  sheets: readonly {
    workpaperId: string
    label: string
    totals: Record<string, number>
    boxes: Record<string, number>
    /** Row count — the actual per-bill rows live in the audit-heavier full compute result
     * cached by the sign-off surface, not on the audit trail. */
    billCount: number
  }[]
}

/** LS RSA-cross-border review row. Lists the bills the SARS/RSL common-border arrangement
 * covers this period so a human eyeballs the invoice conditions before sign-off. */
export type ComputedCrossBorderReview = {
  kind: "cross-border-review"
  windowDays: number
  bills: readonly {
    billId: string
    invoiceDate: string
    supplierName: string
    /** Total gross the arrangement is treating as paying Lesotho import VAT. */
    grossAmount: number
    supplierVatNumber: string | null
  }[]
  totalGross: number
}

export type ComputedValue =
  | ComputedBankRecon
  | ComputedApAging
  | ComputedUnpostedAccruals
  | ComputedVatWorkpaper
  | ComputedCrossBorderReview

export type ComputedForKind<K extends CloseItemKind> = Extract<ComputedValue, { kind: K }>
