/** Pure workpaper computation. Runs every column's `select` against every projected bill,
 * sums non-null contributions per column, and resolves the box map (both `column.box` 1:1 and
 * top-level `boxes[]` multi-column combiners). No I/O, no rendering — the layout layer turns
 * this into a table. */
import type { ComputedWorkpaper, Period, Workpaper, WorkpaperBill } from "./workpaper"

export function computeWorkpaper(
  pack: Workpaper,
  bills: readonly WorkpaperBill[],
  period: Period,
): ComputedWorkpaper {
  const rows: ComputedWorkpaper["rows"] = []
  const totals: Record<string, number> = {}
  for (const column of pack.columns) totals[column.id] = 0

  for (const bill of bills) {
    const values: Record<string, number | null> = {}
    for (const column of pack.columns) {
      const raw = column.select(bill, period)
      // Guard against NaN / non-finite values — a broken select should not poison the total.
      const clean = raw !== null && Number.isFinite(raw) ? raw : null
      values[column.id] = clean
      if (clean !== null) totals[column.id] += clean
    }
    rows.push({ billId: bill.id, values })
  }

  const boxes: Record<string, number> = {}
  // 1:1 mapping: any column carrying a `box` writes that box's value = column total.
  for (const column of pack.columns) {
    if (column.box) boxes[column.box] = (boxes[column.box] ?? 0) + totals[column.id]
  }
  // Multi-column combiners override / augment the 1:1 case. Later wins on the same key —
  // a pack that declares both a `column.box` and a top-level `boxes[key]` for the same key is
  // saying "the combiner is authoritative", which is what packs like ZA VAT201 box 18 want.
  if (pack.boxes) {
    for (const [boxKey, combiner] of Object.entries(pack.boxes)) {
      boxes[boxKey] = combiner(totals)
    }
  }

  return { rows, totals, boxes }
}
