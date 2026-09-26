import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))

const { auditEventLabel } = await import("@/models/audit-events")

describe("auditEventLabel", () => {
  it("labels known event types", () => {
    expect(auditEventLabel("document_field_edited")).toBe("Field edited")
    expect(auditEventLabel("webhook_endpoint_disabled")).toBe("Webhook endpoint disabled")
  })

  it("falls back to a title-cased version of unknown types", () => {
    expect(auditEventLabel("some_future_event")).toBe("Some future event")
  })

  it("says which types a document was moved between (#297)", () => {
    expect(auditEventLabel("document_reclassified", { fromType: "receipt", toType: "invoice" })).toBe(
      "Moved to Invoice (was Receipt)",
    )
    expect(auditEventLabel("document_reclassified", { toType: "invoice" })).toBe("Moved to Invoice")
  })

  it("says why a source-file attach failed, on the Audit tab (#450/#462)", () => {
    expect(auditEventLabel("integration_attach_failed", { errorCode: "attach_oversize" })).toBe(
      "Source file not attached — the file is too large for the ledger to accept",
    )
    expect(auditEventLabel("integration_attach_failed")).toBe("Source file not attached")
    expect(auditEventLabel("integration_attach_succeeded")).toBe("Source file attached")
  })
})
