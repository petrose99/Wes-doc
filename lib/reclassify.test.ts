import { describe, expect, it, vi, beforeEach } from "vitest"

const findFirst = vi.fn()
const invoicePaymentFindMany = vi.fn()
const paymentRunItemFindMany = vi.fn()
const getActiveWorkflowStageState = vi.fn()
const getDocumentPaymentStatuses = vi.fn()
const summarizePoConsumption = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    document: { findFirst },
    invoicePayment: { findMany: invoicePaymentFindMany },
    paymentRunItem: { findMany: paymentRunItemFindMany },
  },
}))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))
vi.mock("@/models/review-tasks", () => ({ getActiveWorkflowStageState }))
vi.mock("@/models/ledger-payments", () => ({ getDocumentPaymentStatuses }))
vi.mock("@/models/po-matching", () => ({ summarizePoConsumption }))

const { describeMoveIneligibility } = await import("@/lib/reclassify")

const DOC = { id: "doc-1", filename: "invoice.pdf", reviewedData: {} }

beforeEach(() => {
  vi.clearAllMocks()
  findFirst.mockResolvedValue(DOC)
  invoicePaymentFindMany.mockResolvedValue([])
  paymentRunItemFindMany.mockResolvedValue([])
  getActiveWorkflowStageState.mockResolvedValue(null)
  getDocumentPaymentStatuses.mockResolvedValue(new Map())
  summarizePoConsumption.mockResolvedValue(new Map())
})

describe("describeMoveIneligibility", () => {
  it("blocks a document with a pending approval", async () => {
    getActiveWorkflowStageState.mockResolvedValue({ stage: "manager" })
    const reason = await describeMoveIneligibility("ws-1", "doc-1", "invoice")
    expect(reason).toBe("Can't move invoice.pdf while an approval is pending.")
  })

  it("blocks a Posted document", async () => {
    getDocumentPaymentStatuses.mockResolvedValue(new Map([["doc-1", { paymentStatus: "Posted", paidAmount: 0 }]]))
    const reason = await describeMoveIneligibility("ws-1", "doc-1", "invoice")
    expect(reason).toBe("Can't move invoice.pdf — it's already Posted.")
  })

  it("blocks a purchase order with matched invoices", async () => {
    summarizePoConsumption.mockResolvedValue(new Map([["doc-1", { invoices: [{ id: "inv-1" }] }]]))
    const reason = await describeMoveIneligibility("ws-1", "doc-1", "purchase_order")
    expect(reason).toBe("Unmatch its invoices first.")
  })

  it("returns null when none of the guards apply", async () => {
    const reason = await describeMoveIneligibility("ws-1", "doc-1", "invoice")
    expect(reason).toBeNull()
  })
})
