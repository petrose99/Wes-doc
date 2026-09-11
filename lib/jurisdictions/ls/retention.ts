/** LS VAT Act s.48 — records must be kept in Lesotho, in Sesotho or English, "for as long as
 * they remain material in the administration of this Act" (s.48(3)). No fixed year count in the
 * Act; RSL's practical guidance ("Tax Guide on Keeping Records and Accounts – VAT 104") is
 * commonly summarised as five years. We adopt 5 as the ceiling for automatic retention checks,
 * mirroring ZA's 5-year rule and giving the workpaper a concrete window. */
import type { RetentionCheck, Rule } from "../types"
import { RSL_VAT_OVERVIEW } from "./invoice-validity"

const RETENTION_YEARS = 5
const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

function ageYears(invoiceDate: string, today: string): number {
  const from = new Date(invoiceDate).getTime()
  const to = new Date(today).getTime()
  return (to - from) / (365.25 * 24 * 60 * 60 * 1000)
}

export const lsRetentionRules: Rule<RetentionCheck>[] = [
  {
    id: "ls.s48.retention.5y",
    sourceRef: RSL_VAT_OVERVIEW,
    apply: (c) => {
      const today = c.today ?? new Date().toISOString().slice(0, 10)
      const years = ageYears(c.invoiceDate, today)
      return years <= RETENTION_YEARS
        ? ok
        : fail(
            "ls.s48.retention.5y",
            `Invoice is ${years.toFixed(1)} years old — beyond the 5-year retention window (VAT Act s.48; RSL VAT 104 practice).`,
          )
    },
  },
]

export const lsRetention = {
  years: RETENTION_YEARS,
  rules: lsRetentionRules,
}
