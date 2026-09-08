import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/ingestion", () => ({ createIngestionItem: vi.fn() }))
vi.mock("@/models/files", () => ({ ensurePipelineFile: vi.fn(), getFileTemplates: vi.fn() }))
vi.mock("@/models/workspaces", () => ({ getWorkspaceMembers: vi.fn() }))

const { addAllowedSender, ensureInboundEmailToken, isSenderAllowed, matchesAllowPattern, processInboundEmail, removeAllowedSender } = await import("@/models/inbound-email")
const { prisma } = await import("@/lib/db")
const { createIngestionItem } = await import("@/lib/ingestion")
const { ensurePipelineFile, getFileTemplates } = await import("@/models/files")
const { getWorkspaceMembers } = await import("@/models/workspaces")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

const PDF_BASE64 = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(16, 0x20)]).toString("base64")

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.inboundEmailAllowedSender = { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), findFirst: vi.fn(), delete: vi.fn() }
  db.inboundEmailIntake = { create: vi.fn().mockResolvedValue({}) }
  db.documentAuditEvent = { create: vi.fn().mockResolvedValue({}) }
  db.productEvent = { create: vi.fn().mockResolvedValue({}) }
  db.$transaction = vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[]))
})

describe("ensureInboundEmailToken", () => {
  it("refuses a clinical workspace outright", async () => {
    db.workspace = { findUniqueOrThrow: vi.fn().mockResolvedValue({ inboundEmailToken: null, industry: "healthcare" }) }
    await expect(ensureInboundEmailToken("w1")).rejects.toThrow("inbound_email_disabled_for_clinical")
  })

  it("returns the existing token without generating a new one", async () => {
    db.workspace = { findUniqueOrThrow: vi.fn().mockResolvedValue({ inboundEmailToken: "existing-token", industry: "finance" }), update: vi.fn() }
    const token = await ensureInboundEmailToken("w1")
    expect(token).toBe("existing-token")
    expect(db.workspace.update).not.toHaveBeenCalled()
  })

  it("generates and persists a token when none exists", async () => {
    db.workspace = { findUniqueOrThrow: vi.fn().mockResolvedValue({ inboundEmailToken: null, industry: "finance" }), update: vi.fn() }
    const token = await ensureInboundEmailToken("w1")
    expect(token).toEqual(expect.any(String))
    expect(token.length).toBeGreaterThan(10)
    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "w1" }, data: { inboundEmailToken: token } })
  })
})

describe("matchesAllowPattern", () => {
  it("matches an exact email, case-insensitively", () => {
    expect(matchesAllowPattern("Bookkeeper@Firm.com", "bookkeeper@firm.com")).toBe(true)
    expect(matchesAllowPattern("bookkeeper@firm.com", "other@firm.com")).toBe(false)
  })

  it("matches a domain pattern only against the exact domain, not a subdomain", () => {
    expect(matchesAllowPattern("@corp.com", "x@corp.com")).toBe(true)
    expect(matchesAllowPattern("@corp.com", "x@sub.corp.com")).toBe(false)
  })
})

describe("isSenderAllowed", () => {
  beforeEach(() => { db.inboundEmailAllowedSender = { findMany: vi.fn().mockResolvedValue([]) } })

  it("allows a workspace member's address, case-insensitively", async () => {
    vi.mocked(getWorkspaceMembers).mockResolvedValue([{ user: { email: "Owner@Example.com" } }] as never)
    expect(await isSenderAllowed("w1", "owner@example.com")).toBe(true)
  })

  it("refuses a non-member, non-allowlisted address", async () => {
    vi.mocked(getWorkspaceMembers).mockResolvedValue([{ user: { email: "owner@example.com" } }] as never)
    expect(await isSenderAllowed("w1", "stranger@example.com")).toBe(false)
  })

  it("allows an address matching an allowlist entry", async () => {
    vi.mocked(getWorkspaceMembers).mockResolvedValue([])
    db.inboundEmailAllowedSender.findMany.mockResolvedValue([{ pattern: "@bookkeepers.com" }])
    expect(await isSenderAllowed("w1", "anyone@bookkeepers.com")).toBe(true)
  })

  it("refuses a blank address", async () => {
    expect(await isSenderAllowed("w1", "   ")).toBe(false)
  })
})

describe("addAllowedSender", () => {
  it("rejects an empty pattern", async () => {
    await expect(addAllowedSender({ workspaceId: "w1", pattern: "  ", createdById: "u1" })).rejects.toThrow("pattern_required")
  })

  it("rejects a pattern that is neither an email nor an @domain", async () => {
    await expect(addAllowedSender({ workspaceId: "w1", pattern: "not-valid", createdById: "u1" })).rejects.toThrow("pattern_invalid")
  })

  it("upserts a lowercased pattern and writes an audit event", async () => {
    db.inboundEmailAllowedSender.upsert.mockResolvedValue({ id: "s1", pattern: "bookkeeper@firm.com" })
    const row = await addAllowedSender({ workspaceId: "w1", pattern: "Bookkeeper@Firm.com", createdById: "u1" })
    expect(row).toEqual({ id: "s1", pattern: "bookkeeper@firm.com" })
    expect(db.inboundEmailAllowedSender.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId_pattern: { workspaceId: "w1", pattern: "bookkeeper@firm.com" } },
    }))
    expect(db.documentAuditEvent.create).toHaveBeenCalled()
  })

  it("accepts a domain pattern", async () => {
    db.inboundEmailAllowedSender.upsert.mockResolvedValue({ id: "s1", pattern: "@firm.com" })
    await expect(addAllowedSender({ workspaceId: "w1", pattern: "@firm.com", createdById: "u1" })).resolves.toBeTruthy()
  })
})

describe("removeAllowedSender", () => {
  it("throws when the sender does not belong to this workspace", async () => {
    db.inboundEmailAllowedSender.findFirst.mockResolvedValue(null)
    await expect(removeAllowedSender({ workspaceId: "w1", id: "s1", actorId: "u1" })).rejects.toThrow("allowed_sender_not_found")
  })

  it("deletes the row and writes an audit event", async () => {
    db.inboundEmailAllowedSender.findFirst.mockResolvedValue({ id: "s1", pattern: "x@firm.com" })
    await removeAllowedSender({ workspaceId: "w1", id: "s1", actorId: "u1" })
    expect(db.inboundEmailAllowedSender.delete).toHaveBeenCalledWith({ where: { id: "s1" } })
    expect(db.documentAuditEvent.create).toHaveBeenCalled()
  })
})

describe("processInboundEmail", () => {
  const attachment = { filename: "invoice.pdf", contentType: "application/pdf", base64Content: PDF_BASE64 }

  beforeEach(() => {
    vi.mocked(getWorkspaceMembers).mockResolvedValue([{ user: { email: "owner@example.com" } }] as never)
    db.workspaceMember = { findFirst: vi.fn().mockResolvedValue({ userId: "owner-1" }) }
    vi.mocked(ensurePipelineFile).mockResolvedValue({ id: "f1" } as never)
    vi.mocked(getFileTemplates).mockResolvedValue([{ id: "t1", code: "generic" }] as never)
  })

  it("refuses a sender who is not a workspace member, before touching any file", async () => {
    await expect(processInboundEmail({ workspaceId: "w1", from: "stranger@example.com", attachments: [attachment] })).rejects.toThrow("sender_not_allowed")
    expect(ensurePipelineFile).not.toHaveBeenCalled()
  })

  /** The channel-specific "Email intake" file is gone: an emailed document goes to the same
   * container the Extraction page uploads into, so it is extractable against the full finance
   * worksheet set rather than only DEFAULT_DOCUMENT_TEMPLATES. */
  it("routes into the workspace's pipeline container, standing in the earliest owner", async () => {
    vi.mocked(createIngestionItem).mockResolvedValue({ outcome: "accepted" } as never)

    await processInboundEmail({ workspaceId: "w1", from: "owner@example.com", attachments: [attachment] })

    expect(ensurePipelineFile).toHaveBeenCalledWith("w1", "owner-1")
    expect(createIngestionItem).toHaveBeenCalledWith(expect.objectContaining({ fileId: "f1", source: "email" }))
  })

  it("refuses the mail when the workspace has no owner to stand in for", async () => {
    db.workspaceMember = { findFirst: vi.fn().mockResolvedValue(null) }
    await expect(processInboundEmail({ workspaceId: "w1", from: "owner@example.com", attachments: [attachment] })).rejects.toThrow("workspace_has_no_owner")
  })

  it("extracts against the worksheet the subject's intent calls for", async () => {
    vi.mocked(getFileTemplates).mockResolvedValue([{ id: "t1", code: "generic" }, { id: "t2", code: "invoice" }] as never)
    vi.mocked(createIngestionItem).mockResolvedValue({ outcome: "accepted" } as never)

    await processInboundEmail({ workspaceId: "w1", from: "owner@example.com", subject: "Tax invoice 4021 attached", attachments: [attachment] })

    expect(createIngestionItem).toHaveBeenCalledWith(expect.objectContaining({ templateId: "t2" }))
  })

  /** "statement" is deliberately unmapped — its keywords span bank and supplier statements — and
   * an intent with no worksheet in the container must fall back rather than refuse the mail. */
  it("falls back to the generic worksheet for an unmapped or missing intent", async () => {
    vi.mocked(getFileTemplates).mockResolvedValue([{ id: "t1", code: "generic" }, { id: "t2", code: "invoice" }] as never)
    vi.mocked(createIngestionItem).mockResolvedValue({ outcome: "accepted" } as never)

    await processInboundEmail({ workspaceId: "w1", from: "owner@example.com", subject: "Monthly statement of account", attachments: [attachment] })

    expect(createIngestionItem).toHaveBeenCalledWith(expect.objectContaining({ templateId: "t1" }))
  })

  it("rejects an attachment whose content doesn't match its claimed type", async () => {
    const fake = { filename: "invoice.pdf", contentType: "application/pdf", base64Content: Buffer.from("not a pdf").toString("base64") }
    const result = await processInboundEmail({ workspaceId: "w1", from: "owner@example.com", attachments: [fake] })
    expect(result).toEqual({ accepted: 0, rejected: 1 })
    expect(createIngestionItem).not.toHaveBeenCalled()
  })

  it("rejects an attachment with an unrecognised extension", async () => {
    const unknown = { filename: "notes.txt", contentType: "text/plain", base64Content: Buffer.from("hello").toString("base64") }
    const result = await processInboundEmail({ workspaceId: "w1", from: "owner@example.com", attachments: [unknown] })
    expect(result).toEqual({ accepted: 0, rejected: 1 })
  })

  it("counts an accepted and a duplicate outcome as accepted, and a rejected outcome as rejected", async () => {
    vi.mocked(createIngestionItem)
      .mockResolvedValueOnce({ outcome: "accepted" } as never)
      .mockResolvedValueOnce({ outcome: "duplicate" } as never)
      .mockResolvedValueOnce({ outcome: "rejected" } as never)

    const result = await processInboundEmail({ workspaceId: "w1", from: "owner@example.com", attachments: [attachment, attachment, attachment] })

    expect(result).toEqual({ accepted: 2, rejected: 1 })
  })

  it("tags every ingested attachment with source \"email\"", async () => {
    vi.mocked(createIngestionItem).mockResolvedValue({ outcome: "accepted" } as never)
    await processInboundEmail({ workspaceId: "w1", from: "owner@example.com", attachments: [attachment] })
    expect(vi.mocked(createIngestionItem).mock.calls[0][0].source).toBe("email")
  })

  // A6.1: every processed mail leaves an intake row; a zero-document one also audits.
  it("records an intake row with outcome ingested when something was accepted", async () => {
    vi.mocked(createIngestionItem).mockResolvedValue({ outcome: "accepted" } as never)
    await processInboundEmail({ workspaceId: "w1", from: "owner@example.com", subject: "Inv", attachments: [attachment] })
    expect(db.inboundEmailIntake.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workspaceId: "w1", fromAddress: "owner@example.com", subject: "Inv", outcome: "ingested", acceptedCount: 1 }),
    })
  })

  it("records a no_document intake and an audit event when a mail yields nothing", async () => {
    const result = await processInboundEmail({ workspaceId: "w1", from: "owner@example.com", subject: "FYI", textBody: "see you at lunch", attachments: [] })
    expect(result).toEqual({ accepted: 0, rejected: 0 })
    expect(db.inboundEmailIntake.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "no_document", bodyPreview: "see you at lunch" }),
    })
    expect(db.documentAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "inbound_email.no_document" }),
    }))
  })

  it("records a sender_rejected intake before refusing a disallowed sender", async () => {
    await expect(processInboundEmail({ workspaceId: "w1", from: "stranger@example.com", attachments: [attachment] })).rejects.toThrow("sender_not_allowed")
    expect(db.inboundEmailIntake.create).toHaveBeenCalledWith({ data: expect.objectContaining({ outcome: "sender_rejected" }) })
  })

  // A6.2: an invoice-shaped BODY with no usable attachment gets rendered to a PDF and ingested.
  it("ingests an invoice-like body as a rendered PDF when no attachment was accepted", async () => {
    vi.mocked(createIngestionItem).mockResolvedValue({ outcome: "accepted" } as never)
    const result = await processInboundEmail({
      workspaceId: "w1", from: "owner@example.com", subject: "Invoice #77",
      htmlBody: "<p>Amount due: $120.00</p>", attachments: [],
    })
    expect(result.accepted).toBe(1)
    const call = vi.mocked(createIngestionItem).mock.calls[0][0]
    expect(call.mimeType).toBe("application/pdf")
    expect(call.filename).toMatch(/\.pdf$/)
    expect(call.buffer.toString("latin1").startsWith("%PDF-")).toBe(true)
    expect(db.inboundEmailIntake.create).toHaveBeenCalledWith({ data: expect.objectContaining({ outcome: "ingested" }) })
  })

  it("does not render a body that does not look like a billing document", async () => {
    const result = await processInboundEmail({ workspaceId: "w1", from: "owner@example.com", subject: "Hello", textBody: "lunch tomorrow?", attachments: [] })
    expect(result.accepted).toBe(0)
    expect(createIngestionItem).not.toHaveBeenCalled()
  })
})
