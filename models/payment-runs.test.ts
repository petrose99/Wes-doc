import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/audit", () => ({ recordSystemAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/models/bills", () => ({ listWorkspaceBills: vi.fn() }))
vi.mock("@/models/company-currency", () => ({ recordCurrencyLock: vi.fn().mockResolvedValue(undefined) }))

const { preparePaymentRun } = await import("@/models/payment-runs")
const { prisma } = await import("@/lib/db")
const { listWorkspaceBills } = await import("@/models/bills")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

function bill(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    documentId: "d1", supplier: "Acme Ltd", supplierId: "s1", total: 100, currencyCode: "ZAR",
    invoiceNumber: "INV-1", cancelledAt: null, approvalStatus: "approved" as const,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.paymentRunItem = { findMany: vi.fn().mockResolvedValue([]) }
  db.supplier = { findMany: vi.fn().mockResolvedValue([{ id: "s1", iban: null, bankDetails: { account: "12345", branchCode: "051" } }]) }
  db.workspace = { findFirst: vi.fn().mockResolvedValue({ name: "Acme Workspace" }) }
  db.paymentRun = {
    create: vi.fn().mockImplementation(({ data }: { data: { itemCount: number } }) =>
      Promise.resolve({ id: "run1", filename: "run.csv", itemCount: data.itemCount })),
  }
})

describe("preparePaymentRun", () => {
  it("includes an approved, payable bill in the run", async () => {
    vi.mocked(listWorkspaceBills).mockResolvedValue({ bills: [bill()], summary: {} as never })
    const result = await preparePaymentRun({ workspaceId: "w1", actorId: "u1", documentIds: ["d1"] })
    expect(result.run.itemCount).toBe(1)
  })

  it("locks the Company currency when the first Payment batch is created (#457)", async () => {
    const { recordCurrencyLock } = await import("@/models/company-currency")
    vi.mocked(listWorkspaceBills).mockResolvedValue({ bills: [bill()], summary: {} as never })
    await preparePaymentRun({ workspaceId: "w1", actorId: "u1", documentIds: ["d1"] })
    expect(recordCurrencyLock).toHaveBeenCalledWith("w1", "payment_batch", null, expect.any(Date))
  })

  // #249: a payment run moves real money, so it can't pay an invoice that hasn't cleared Approval
  // — server-side defense in depth for the same gate the Invoices queue already applies to
  // payableDocumentIds.
  it.each(["not_started", "in_progress", "rejected"] as const)(
    "excludes a bill whose approvalStatus is %s, even if selected",
    async (approvalStatus) => {
      vi.mocked(listWorkspaceBills).mockResolvedValue({ bills: [bill({ approvalStatus })], summary: {} as never })
      await expect(preparePaymentRun({ workspaceId: "w1", actorId: "u1", documentIds: ["d1"] }))
        .rejects.toThrow("no_payable_bills_after_filtering")
    },
  )

  it("still excludes a cancelled bill even if it were somehow marked approved (#220)", async () => {
    vi.mocked(listWorkspaceBills).mockResolvedValue({
      bills: [bill({ cancelledAt: new Date("2026-09-15T00:00:00Z") })],
      summary: {} as never,
    })
    await expect(preparePaymentRun({ workspaceId: "w1", actorId: "u1", documentIds: ["d1"] }))
      .rejects.toThrow("no_payable_bills_after_filtering")
  })

  it("records the not_approved skip reason on the system audit event", async () => {
    const { recordSystemAudit } = await import("@/lib/audit")
    vi.mocked(listWorkspaceBills).mockResolvedValue({
      bills: [bill(), bill({ documentId: "d2", approvalStatus: "not_started" })],
      summary: {} as never,
    })
    await preparePaymentRun({ workspaceId: "w1", actorId: "u1", documentIds: ["d1", "d2"] })
    expect(recordSystemAudit).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ skipped: [{ documentId: "d2", reason: "not_approved" }] }),
    }))
  })
})
