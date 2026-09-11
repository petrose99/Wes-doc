/** LS VAT registration thresholds. Compulsory registration threshold is Gazette-set (s.17(2));
 * the current M2m figure jumped from M850k (secondary sources give the effective date as 25 Apr
 * 2025). Both rows are kept so a lookback resolves the threshold in force at the supply date.
 *
 * Voluntary registration is Commissioner's discretion (s.17(5)) — no gazetted floor — so we
 * record a single row at amount 0 to say "no fixed threshold". Auctioneers register regardless
 * (s.17(6)); that carve-out is not modelled here — it's a workspace-configuration decision
 * upstream of the registration-crossed rule. */
import type { Rule, ThresholdRow } from "../types"
import { RSL_VAT_OVERVIEW } from "./invoice-validity"

const fail = (ruleId: string, message: string) => ({ ok: false as const, ruleId, message })
const ok = { ok: true as const }

export const lsCompulsoryRegistration: ThresholdRow[] = [
  {
    id: "ls.s17.2.compulsory.pre-2025",
    sourceRef: RSL_VAT_OVERVIEW,
    currency: "LSL",
    amount: 850_000,
    effectiveFrom: "2001-07-01",
    effectiveTo: "2025-04-24",
  },
  {
    id: "ls.s17.2.compulsory.2025",
    sourceRef: RSL_VAT_OVERVIEW,
    currency: "LSL",
    amount: 2_000_000,
    effectiveFrom: "2025-04-25",
    effectiveTo: null,
  },
]

export const lsVoluntaryRegistration: ThresholdRow[] = [
  {
    id: "ls.s17.5.voluntary",
    sourceRef: RSL_VAT_OVERVIEW,
    currency: "LSL",
    amount: 0,
    effectiveFrom: "2001-07-01",
    effectiveTo: null,
  },
]

export function lsThresholdAt(rows: ThresholdRow[], date: string): ThresholdRow | null {
  return rows.find((r) => r.effectiveFrom <= date && (r.effectiveTo === null || date <= r.effectiveTo)) ?? null
}

export type RegistrationCheck = {
  declaredTurnoverLsl: number
  asOfDate: string
  isRegistered: boolean
}

export const lsThresholdRules: Rule<RegistrationCheck>[] = [
  {
    id: "ls.s17.1.compulsory.crossed",
    sourceRef: RSL_VAT_OVERVIEW,
    apply: (c) => {
      const row = lsThresholdAt(lsCompulsoryRegistration, c.asOfDate)
      if (!row) return ok
      if (c.declaredTurnoverLsl > row.amount && !c.isRegistered) {
        return fail(
          "ls.s17.1.compulsory.crossed",
          `12-month taxable supplies (M${c.declaredTurnoverLsl.toLocaleString("en-ZA")}) exceed the compulsory-registration threshold of M${row.amount.toLocaleString("en-ZA")} (s.17(1)) but the workspace is not registered.`,
        )
      }
      return ok
    },
  },
]

export const lsThresholds = {
  compulsoryRegistration: lsCompulsoryRegistration,
  voluntaryRegistration: lsVoluntaryRegistration,
  rules: lsThresholdRules,
}
