import { describe, expect, it } from "vitest"
import { checkStatementLayoutDrift, deriveStatementLayout, evaluateStatementDrift } from "@/lib/checks/statement-layout-drift"

const rows = [{ date: "2026-09-01", description: "Coffee", amount: "12.50", balance: "1000.00" }]

describe("evaluateStatementDrift", () => {
  it("is not applicable when there is no saved layout yet", () => {
    expect(evaluateStatementDrift({ transactions: rows, savedLayout: null }).kind).toBe("not_applicable")
  })

  it("is not drift when zero transactions this period", () => {
    expect(evaluateStatementDrift({ transactions: [], savedLayout: deriveStatementLayout(rows) }).kind).toBe("no_transactions")
  })

  it("is clean when the layout matches", () => {
    expect(evaluateStatementDrift({ transactions: rows, savedLayout: deriveStatementLayout(rows) }).kind).toBe("clean")
  })

  it("flags a removed column as drift", () => {
    const saved = deriveStatementLayout(rows)
    const result = evaluateStatementDrift({ transactions: [{ date: "2026-09-02", amount: "5.00" }], savedLayout: saved })
    expect(result.kind).toBe("drift")
    if (result.kind === "drift") expect(result.changes.join(" ")).toMatch(/removed/)
  })

  it("flags a date format change as drift", () => {
    const saved = deriveStatementLayout(rows)
    const result = evaluateStatementDrift({ transactions: [{ date: "01/09/2026", description: "Coffee", amount: "12.50", balance: "1000.00" }], savedLayout: saved })
    expect(result.kind).toBe("drift")
    if (result.kind === "drift") expect(result.changes.join(" ")).toMatch(/date format/)
  })
})

describe("checkStatementLayoutDrift", () => {
  it("returns null when clean", () => {
    expect(checkStatementLayoutDrift({ transactions: rows, savedLayout: deriveStatementLayout(rows) })).toBeNull()
  })

  it("returns a warn CheckResult on drift", () => {
    const saved = deriveStatementLayout(rows)
    const result = checkStatementLayoutDrift({ transactions: [{ date: "2026-09-02", amount: "5.00" }], savedLayout: saved })
    expect(result?.status).toBe("warn")
    expect(result?.checkCode).toBe("statement_layout_drift")
  })
})
