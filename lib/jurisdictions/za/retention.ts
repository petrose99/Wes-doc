/** ZA VAT Act s55 + Tax Administration Act 28 of 2011 s29 — 5-year retention for tax invoices
 * received. The same 5-year clock caps the late-claim window under s16(3) proviso (i). */
import type { RetentionCheck, Rule } from "../types"

const SARS_OBLIGATIONS =
  "https://www.sars.gov.za/types-of-tax/value-added-tax/obligations-of-a-vat-vendor/"

const RETENTION_YEARS = 5
const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

function ageYears(invoiceDate: string, today: string): number {
  const from = new Date(invoiceDate).getTime()
  const to = new Date(today).getTime()
  return (to - from) / (365.25 * 24 * 60 * 60 * 1000)
}

export const zaRetentionRules: Rule<RetentionCheck>[] = [
  {
    id: "za.s55.retention.5y",
    sourceRef: SARS_OBLIGATIONS,
    apply: (c) => {
      const today = c.today ?? new Date().toISOString().slice(0, 10)
      const years = ageYears(c.invoiceDate, today)
      return years <= RETENTION_YEARS
        ? ok
        : fail("za.s55.retention.5y", `Invoice is ${years.toFixed(1)} years old — beyond the 5-year retention window (VAT Act s55; TAA s29).`)
    },
  },
]

export const zaRetention = {
  years: RETENTION_YEARS,
  rules: zaRetentionRules,
}
