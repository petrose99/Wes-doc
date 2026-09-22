import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/models/bills", () => ({ listWorkspaceBills: vi.fn().mockResolvedValue({ bills: [] }) }))
vi.mock("@/models/payer-accounts", () => ({ listPayerAccounts: vi.fn().mockResolvedValue([]) }))

const { listBillPay } = await import("@/models/bill-pay")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

function claim(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "c1", title: "Client lunch", total: 100, currencyCode: "ZAR",
    submitterId: "u1", submittedAt: new Date("2026-09-01"), resolvedAt: new Date("2026-09-02"),
    submitter: { id: "u1", name: "Alex", email: "alex@example.com" },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.supplier = { findMany: vi.fn().mockResolvedValue([]) }
  db.billPayPreference = { findMany: vi.fn().mockResolvedValue([]) }
  db.paymentRunItem = { findMany: vi.fn().mockResolvedValue([]) }
  db.expenseClaim = { findMany: vi.fn().mockResolvedValue([]) }
  db.workspaceMember = { findMany: vi.fn().mockResolvedValue([{ userId: "u1", bankName: "FNB", bankAccountNumber: "12345", bankBranchCode: "250655" }]) }
  db.expenseClaimPayment = { findMany: vi.fn().mockResolvedValue([]) }
})

describe("listBillPay claim rows (#295)", () => {
  it("includes an eligible claim (approved, frozen total, currency, bank details on file)", async () => {
    db.expenseClaim.findMany.mockResolvedValue([claim()])
    const { rows } = await listBillPay({ workspaceId: "w1" })
    const row = rows.find((r) => r.kind === "claim")
    expect(row?.kind === "claim" && row.eligibility).toEqual({ eligible: true })
  })

  it("flags a claim whose submitter has no bank details as needs_bank_details", async () => {
    db.expenseClaim.findMany.mockResolvedValue([claim()])
    db.workspaceMember.findMany.mockResolvedValue([{ userId: "u1", bankName: null, bankAccountNumber: null, bankBranchCode: null }])
    const { rows } = await listBillPay({ workspaceId: "w1", facet: "needs_bank_details" })
    const row = rows.find((r) => r.kind === "claim")
    expect(row?.kind === "claim" && row.eligibility).toEqual({ eligible: false, reason: "needs_bank_details" })
  })

  it("flags a claim whose submitter left the workspace as left_workspace, still under the needs_bank_details facet", async () => {
    db.expenseClaim.findMany.mockResolvedValue([claim()])
    db.workspaceMember.findMany.mockResolvedValue([])
    const { rows } = await listBillPay({ workspaceId: "w1", facet: "needs_bank_details" })
    const row = rows.find((r) => r.kind === "claim")
    expect(row?.kind === "claim" && row.eligibility).toEqual({ eligible: false, reason: "left_workspace" })
  })

  it("flags a claim with no currency as needs_currency, still under the needs_bank_details facet", async () => {
    db.expenseClaim.findMany.mockResolvedValue([claim({ currencyCode: null })])
    const { rows } = await listBillPay({ workspaceId: "w1", facet: "needs_bank_details" })
    const row = rows.find((r) => r.kind === "claim")
    expect(row?.kind === "claim" && row.eligibility).toEqual({ eligible: false, reason: "needs_currency" })
  })

  it("derives Paid once ExpenseClaimPayment sums to the claim total", async () => {
    db.expenseClaim.findMany.mockResolvedValue([claim()])
    db.expenseClaimPayment.findMany.mockResolvedValue([{ claimId: "c1", amount: 100 }])
    const { rows } = await listBillPay({ workspaceId: "w1" })
    const row = rows.find((r) => r.kind === "claim")
    expect(row?.kind === "claim" && row.paidState).toBe("paid")
  })

  it("derives Scheduled while an active PaymentRunItem holds the claim in a pending batch", async () => {
    db.expenseClaim.findMany.mockResolvedValue([claim()])
    db.paymentRunItem.findMany.mockResolvedValue([{ expenseClaimId: "c1", run: { id: "run1", name: "Batch 1", status: "pending_approval" } }])
    const { rows } = await listBillPay({ workspaceId: "w1" })
    const row = rows.find((r) => r.kind === "claim")
    expect(row?.kind === "claim" && row.paidState).toBe("scheduled")
  })
})
