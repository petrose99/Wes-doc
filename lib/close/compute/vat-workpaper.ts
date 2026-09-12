/** VAT-workpaper binding (#96). Delegates to the shared `computeWorkpaper` substrate over
 * whichever `Workpaper`s the pack registered. LS carries a `WorkpaperGroup` (#85: VAT-12 has
 * a reconciliation tab AND a return-form tab bundled under one close item) so the compute
 * layer surfaces every sheet in `sheets[]` rather than one; consumers key off `groupId` to
 * decide tab presentation. */

import type { JurisdictionPack } from "@/lib/jurisdictions"
import { computeWorkpaper } from "@/lib/jurisdictions/_shared/compute-workpaper"
import type { Period } from "@/lib/jurisdictions/_shared/workpaper"
import { lsWorkpaperGroups } from "@/lib/jurisdictions/ls/workpapers"
import type { CloseCandidateBill } from "./bills"
import type { ComputedVatWorkpaper } from "./types"

export type ComputeVatWorkpaperInput = {
  pack: JurisdictionPack | null
  bills: readonly CloseCandidateBill[]
  period: Period
}

export function computeVatWorkpaper(input: ComputeVatWorkpaperInput): ComputedVatWorkpaper {
  const pack = input.pack
  const workpapers = pack?.workpapers ?? []

  // Grouping: only LS today. If a pack ever declares its own workpaper-group list, this pass
  // reads from there instead — one group per pack is fine, matches the sign-off surface.
  const group = pack?.code === "LS"
    ? lsWorkpaperGroups.find((g) => g.workpaperIds.every((wpid) => workpapers.some((w) => w.id === wpid))) ?? null
    : null

  const idsInOrder: readonly string[] = group
    ? group.workpaperIds
    : workpapers.map((w) => w.id)

  const projectedBills = input.bills.map((c) => c.bill)

  const sheets = idsInOrder.flatMap((wpid) => {
    const wp = workpapers.find((w) => w.id === wpid)
    if (!wp) return []
    const result = computeWorkpaper(wp, projectedBills, input.period)
    return [{
      workpaperId: wp.id,
      label: wp.label,
      totals: result.totals,
      boxes: result.boxes,
      billCount: result.rows.length,
    }]
  })

  return {
    kind: "vat-workpaper",
    packCode: pack?.code ?? null,
    packVersion: pack?.packVersion ?? null,
    groupId: group?.id ?? null,
    sheets,
  }
}
