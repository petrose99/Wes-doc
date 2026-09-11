/** ZA VAT registration thresholds. The 1 Apr 2026 Budget jumped compulsory registration from
 * R1m to R2.3m and voluntary from R50k to R120k; both rows are kept so a 5-year lookback (per
 * s55 retention + s16(3) late-claim) can resolve the threshold in force at the supply date. */
import type { Rule, ThresholdRow } from "../types"

const SARS_REG_FAQ = "https://www.sars.gov.za/faq/what-is-the-new-threshold-for-vat-registration/"

const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

export const zaCompulsoryRegistration: ThresholdRow[] = [
  {
    id: "za.s23.1.compulsory.pre-2026",
    sourceRef: SARS_REG_FAQ,
    currency: "ZAR",
    amount: 1_000_000,
    effectiveFrom: "1991-09-30",
    effectiveTo: "2026-03-31",
  },
  {
    id: "za.s23.1.compulsory.2026",
    sourceRef:
      "https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/",
    currency: "ZAR",
    amount: 2_300_000,
    effectiveFrom: "2026-04-01",
    effectiveTo: null,
  },
]

export const zaVoluntaryRegistration: ThresholdRow[] = [
  {
    id: "za.s23.3.voluntary.pre-2026",
    sourceRef: SARS_REG_FAQ,
    currency: "ZAR",
    amount: 50_000,
    effectiveFrom: "1991-09-30",
    effectiveTo: "2026-03-31",
  },
  {
    id: "za.s23.3.voluntary.2026",
    sourceRef:
      "https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/",
    currency: "ZAR",
    amount: 120_000,
    effectiveFrom: "2026-04-01",
    effectiveTo: null,
  },
]

/** Pick the row whose window contains `date`; caller supplies the supply date so the answer is
 * stable against a 5-year lookback. */
export function zaThresholdAt(rows: ThresholdRow[], date: string): ThresholdRow | null {
  return rows.find((r) => r.effectiveFrom <= date && (r.effectiveTo === null || date <= r.effectiveTo)) ?? null
}

/** Rule row is more scaffolding than gate-consumed: it fires against a workspace configuration
 * (declared 12-month turnover + a decision date) to flag a workspace that has crossed the
 * compulsory line but is not yet registered. */
export type RegistrationCheck = {
  declaredTurnoverZar: number
  asOfDate: string
  isRegistered: boolean
}

export const zaThresholdRules: Rule<RegistrationCheck>[] = [
  {
    id: "za.s23.1.compulsory.crossed",
    sourceRef: SARS_REG_FAQ,
    apply: (c) => {
      const row = zaThresholdAt(zaCompulsoryRegistration, c.asOfDate)
      if (!row) return ok
      if (c.declaredTurnoverZar > row.amount && !c.isRegistered) {
        return fail(
          "za.s23.1.compulsory.crossed",
          `12-month taxable supplies (R${c.declaredTurnoverZar.toLocaleString("en-ZA")}) exceed the compulsory-registration threshold of R${row.amount.toLocaleString("en-ZA")} (s23(1)) but the workspace is not registered.`,
        )
      }
      return ok
    },
  },
]

export const zaThresholds = {
  compulsoryRegistration: zaCompulsoryRegistration,
  voluntaryRegistration: zaVoluntaryRegistration,
  rules: zaThresholdRules,
}
