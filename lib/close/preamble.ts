/** Deterministic prose summary of a close's computed items (#97). Rendered as the assistant
 * panel's opening message on the close page — built server-side from the stored
 * computedValue payloads, so it costs no model call and never hallucinates a number. Framing
 * follows decision #41: this is a working paper walkthrough, not advice. */

import type { CloseItemState } from "./types"
import type {
  ComputedApAging,
  ComputedBankRecon,
  ComputedCrossBorderReview,
  ComputedUnpostedAccruals,
  ComputedValue,
  ComputedVatWorkpaper,
} from "./compute/types"

export type PreambleClose = {
  periodYear: number
  periodMonth: number
  state: string
}

export type PreambleItem = {
  kind: string
  title: string
  state: CloseItemState | string
  reSignRequired: boolean
  computedValue: ComputedValue | null
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function closePeriodLabel(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? `M${month}`} ${year}`
}

function money(n: number): string {
  return n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

function summarizeBankRecon(v: ComputedBankRecon): string {
  if (v.status === "awaiting-assertion") return "the bank reconciliation is waiting for your asserted closing balance"
  if (v.status === "delta-flagged") {
    return `the bank reconciliation shows a flagged delta of ${money(Math.abs(v.deltaAmount ?? 0))} against a tolerance of ${money(v.tolerance)}`
  }
  return `the bank reconciliation is within tolerance (asserted ${v.assertedBalance !== null ? money(v.assertedBalance) : "—"})`
}

function summarizeApAging(v: ComputedApAging): string {
  const parts = [`AP aging shows ${plural(v.totalOpenCount, "open bill")} totalling ${money(v.totalOpenAmount)}`]
  const { hardBlockingCount, softCount } = v.openExceptions
  if (hardBlockingCount > 0) parts.push(`${plural(hardBlockingCount, "hard-blocking exception")} — these block the lock`)
  else if (softCount > 0) parts.push(`${plural(softCount, "soft exception")} to review`)
  else parts.push("no open exceptions")
  return parts.join(", ")
}

function summarizeAccruals(v: ComputedUnpostedAccruals): string {
  if (v.proposals.length === 0) return "no unposted bills need accruals"
  const hard = v.proposals.filter((p) => p.gateStatus === "hard-blocking").length
  let text = `${plural(v.proposals.length, "unposted bill")} propose accruals of ${money(v.totalAccruals)} (reversing ${v.reversalDate.slice(0, 10)})`
  if (hard > 0) text += `, ${hard} of them accrued despite an open hard gate`
  return text
}

function summarizeVat(v: ComputedVatWorkpaper): string {
  if (!v.packCode) return "the VAT workpaper has no jurisdiction pack selected, so nothing was computed"
  if (v.sheets.length === 0) return `the ${v.packCode} VAT workpaper computed no sheets`
  const bills = v.sheets.reduce((sum, sheet) => sum + sheet.billCount, 0)
  const labels = v.sheets.map((sheet) => sheet.label).join(" + ")
  return `the VAT workpaper (${v.packCode} pack) computed ${labels} over ${plural(bills, "bill")}`
}

function summarizeCrossBorder(v: ComputedCrossBorderReview): string {
  if (v.bills.length === 0) return "the RSA cross-border review found no bills in the window"
  return `the RSA cross-border review lists ${plural(v.bills.length, "bill")} totalling ${money(v.totalGross)} gross to eyeball`
}

function summarizeItem(item: PreambleItem): string | null {
  const v = item.computedValue
  if (!v) return `${item.title} has not been computed yet`
  switch (v.kind) {
    case "bank-recon": return summarizeBankRecon(v)
    case "ap-aging": return summarizeApAging(v)
    case "unposted-bill-accruals": return summarizeAccruals(v)
    case "vat-workpaper": return summarizeVat(v)
    case "cross-border-review": return summarizeCrossBorder(v)
    default: return null
  }
}

/** Build the assistant's opening message for one close. Pure and deterministic — same
 * inputs, same string. */
export function buildClosePreamble(close: PreambleClose, items: PreambleItem[]): string {
  const period = closePeriodLabel(close.periodYear, close.periodMonth)
  const lines: string[] = []

  if (close.state === "locked") {
    lines.push(`Your ${period} close is locked — everything below is the record as signed.`)
  } else {
    lines.push(`Your ${period} close is open. Here's where the checklist stands:`)
  }

  for (const item of items) {
    const summary = summarizeItem(item)
    if (!summary) continue
    const suffix =
      item.state === "signed" ? " (signed)"
      : item.state === "override" ? " (acknowledged via override)"
      : ""
    const reSign = item.reSignRequired ? " — re-sign required after the reopen" : ""
    lines.push(`• ${summary[0].toUpperCase()}${summary.slice(1)}${suffix}${reSign}.`)
  }

  const signable = items.filter((item) => item.state === "pending" || item.reSignRequired).length
  if (close.state === "open") {
    lines.push(
      signable > 0
        ? `${plural(signable, "item")} still need${signable === 1 ? "s" : ""} sign-off before you lock. Ask me about any line — this is a working paper walkthrough, not advice.`
        : "Everything is signed — you can lock the period. Ask me about any line; this is a working paper walkthrough, not advice.",
    )
  }

  return lines.join("\n")
}
