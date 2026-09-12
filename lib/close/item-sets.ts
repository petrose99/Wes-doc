/** Per-jurisdiction close item-set descriptors (#42). Data only — the descriptors declare
 * what a close checklist contains for a given jurisdiction, and openClose (lib/close/actions.ts)
 * materializes them into CloseItem rows. Item-state computation is #96; the sign-off surface
 * is #97.
 *
 * The v1 sets come straight out of decision #42: bank recon (asserted, soft delta), AP aging
 * plus open-exception review, unposted-bill accruals, VAT workpaper (VAT201 for ZA, VAT-12 for
 * LS), and — LS only — an RSA-cross-border review row for the SARS-RSL common-border
 * arrangement (see lib/jurisdictions/ls/border.ts). */

import type { JurisdictionCode } from "@/lib/jurisdictions"
import type { CloseItemDescriptor } from "./types"

/** Shared prefix of every close checklist. VAT workpaper is optional (only present when the
 * pack declares a `filings` topic); the merger lives in `descriptorsForClose` below. */
const COMMON_ITEMS: readonly CloseItemDescriptor[] = [
  {
    kind: "bank-recon",
    title: "Bank reconciliation",
    required: true,
    softDelta: true,
  },
  {
    kind: "ap-aging",
    title: "AP aging + open-exception review",
    required: true,
    softDelta: false,
  },
  {
    kind: "unposted-bill-accruals",
    title: "Unposted-bill accruals",
    required: true,
    softDelta: false,
  },
] as const

/** Extra items per jurisdiction beyond the common set. Empty entry = common set only. */
const JURISDICTION_EXTRAS: Partial<Record<JurisdictionCode, readonly CloseItemDescriptor[]>> = {
  LS: [
    // Per #42: LS adds an explicit review row for the RSA-cross-border arrangement so a
    // human eyeballs the SARS/RSL invoice conditions each period.
    { kind: "cross-border-review", title: "RSA cross-border review", required: true, softDelta: false },
  ],
}

/** The VAT workpaper row, added when the pack has a `filings` topic AND this month is a
 * VAT-period-end. ZA VAT201 and LS VAT-12 are both monthly today, so it lands every month.
 * A future bi-monthly jurisdiction (or a workspace VAT category with a longer cadence) would
 * flip vatPeriodEnd off on non-return months without changing the descriptor. */
const VAT_WORKPAPER: CloseItemDescriptor = {
  kind: "vat-workpaper",
  title: "VAT workpaper",
  required: true,
  softDelta: false,
}

/** Resolve the descriptors for one close, given the jurisdiction pack code (nullable — a
 * workspace with no jurisdiction pack picked still gets the common set) and whether this
 * month is a VAT period end. The order is stable (common → VAT → jurisdiction extras) so
 * item ordering in the eventual UI stays predictable. */
export function descriptorsForClose(
  code: JurisdictionCode | null,
  vatPeriodEnd: boolean,
): CloseItemDescriptor[] {
  const items: CloseItemDescriptor[] = [...COMMON_ITEMS]
  if (vatPeriodEnd) items.push(VAT_WORKPAPER)
  const extras = code ? JURISDICTION_EXTRAS[code] : undefined
  if (extras) items.push(...extras)
  return items
}
