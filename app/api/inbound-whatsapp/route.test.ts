import { beforeEach, describe, expect, it, vi } from "vitest"

const { whatsapp } = vi.hoisted(() => ({ whatsapp: { enabled: true, verifyToken: "verify-me" } }))
vi.mock("@/lib/config", () => ({ default: { get whatsapp() { return whatsapp } } }))

const intakeCreate = vi.fn().mockResolvedValue({})
const intakeFindUnique = vi.fn().mockResolvedValue(null)
vi.mock("@/lib/db", () => ({ prisma: { whatsAppIntake: { create: (...args: unknown[]) => intakeCreate(...args), findUnique: (...args: unknown[]) => intakeFindUnique(...args) } } }))

class MockJurisdictionRequiredError extends Error {
  readonly code = "JURISDICTION_REQUIRED"
  constructor(readonly workspaceId: string) { super("jurisdiction_required"); this.name = "JurisdictionRequiredError" }
}
const requireWorkspaceJurisdiction = vi.fn().mockResolvedValue({ jurisdictionCode: "ZA" })
vi.mock("@/lib/jurisdictions/require", () => ({
  JurisdictionRequiredError: MockJurisdictionRequiredError,
  requireWorkspaceJurisdiction: (...args: unknown[]) => requireWorkspaceJurisdiction(...args),
}))

const verifyWebhookSignature = vi.fn().mockReturnValue(true)
const sendWhatsAppText = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/whatsapp/client", () => ({
  verifyWebhookSignature: (...args: unknown[]) => verifyWebhookSignature(...args),
  sendWhatsAppText: (...args: unknown[]) => sendWhatsAppText(...args),
}))

const resolveWorkspacesByPhoneNumber = vi.fn()
const processInboundWhatsApp = vi.fn()
vi.mock("@/models/inbound-whatsapp", () => ({
  resolveWorkspacesByPhoneNumber: (...args: unknown[]) => resolveWorkspacesByPhoneNumber(...args),
  processInboundWhatsApp: (...args: unknown[]) => processInboundWhatsApp(...args),
}))

const { POST } = await import("@/app/api/inbound-whatsapp/route")

function webhookRequest(messages: unknown[]) {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages } }] }] })
  return new Request("https://app.test/api/inbound-whatsapp", { method: "POST", headers: { "x-hub-signature-256": "sha256=test" }, body })
}

function imageMessage(id: string, from = "+26661234567") {
  return { id, from, type: "image", image: { id: `media-${id}`, mime_type: "image/jpeg" } }
}

beforeEach(() => {
  vi.clearAllMocks()
  whatsapp.enabled = true
  verifyWebhookSignature.mockReturnValue(true)
  intakeFindUnique.mockResolvedValue(null)
  requireWorkspaceJurisdiction.mockResolvedValue({ jurisdictionCode: "ZA" })
})

describe("POST /api/inbound-whatsapp", () => {
  it("refuses everything when the feature is not configured", async () => {
    whatsapp.enabled = false
    const response = await POST(webhookRequest([imageMessage("m1")]))
    expect(response.status).toBe(503)
  })

  it("refuses an unsigned or wrongly signed payload", async () => {
    verifyWebhookSignature.mockReturnValue(false)
    const response = await POST(webhookRequest([imageMessage("m1")]))
    expect(response.status).toBe(401)
  })

  it("replies once and stores nothing for an unknown number", async () => {
    resolveWorkspacesByPhoneNumber.mockResolvedValue([])
    await POST(webhookRequest([imageMessage("m1")]))
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1)
    expect(sendWhatsAppText).toHaveBeenCalledWith("+26661234567", expect.stringContaining("isn't linked"))
    expect(processInboundWhatsApp).not.toHaveBeenCalled()
  })

  it("refuses cleanly when a number is linked to more than one workspace", async () => {
    resolveWorkspacesByPhoneNumber.mockResolvedValue([
      { workspaceId: "ws-1", label: "A", linkedMemberId: null, workspace: { industry: "generic" } },
      { workspaceId: "ws-2", label: "B", linkedMemberId: null, workspace: { industry: "generic" } },
    ])
    await POST(webhookRequest([imageMessage("m1")]))
    expect(sendWhatsAppText).toHaveBeenCalledWith("+26661234567", expect.stringContaining("more than one company"))
    expect(processInboundWhatsApp).not.toHaveBeenCalled()
  })

  it("tells the sender the workspace isn't set up when jurisdiction is missing", async () => {
    resolveWorkspacesByPhoneNumber.mockResolvedValue([{ workspaceId: "ws-1", label: "A", linkedMemberId: null, workspace: { industry: "generic" } }])
    requireWorkspaceJurisdiction.mockRejectedValue(new MockJurisdictionRequiredError("ws-1"))
    await POST(webhookRequest([imageMessage("m1")]))
    expect(sendWhatsAppText).toHaveBeenCalledWith("+26661234567", expect.stringContaining("isn't set up yet"))
    expect(processInboundWhatsApp).not.toHaveBeenCalled()
  })

  it("sends one ack with the total count for an album of images", async () => {
    resolveWorkspacesByPhoneNumber.mockResolvedValue([{ workspaceId: "ws-1", label: "Katse Office Supply", linkedMemberId: null, workspace: { industry: "generic" } }])
    processInboundWhatsApp.mockResolvedValue({ outcome: "ingested", accepted: 1, rejected: 0, duplicated: 0, label: "Katse Office Supply", isMember: false })
    await POST(webhookRequest([imageMessage("m1"), imageMessage("m2"), imageMessage("m3")]))
    expect(processInboundWhatsApp).toHaveBeenCalledTimes(3)
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1)
    expect(sendWhatsAppText).toHaveBeenCalledWith("+26661234567", expect.stringContaining("3 receipts added to"))
  })

  it("replies with the duplicate line when every attachment matched an existing hash", async () => {
    resolveWorkspacesByPhoneNumber.mockResolvedValue([{ workspaceId: "ws-1", label: "A", linkedMemberId: null, workspace: { industry: "generic" } }])
    processInboundWhatsApp.mockResolvedValue({ outcome: "duplicate_only", accepted: 0, rejected: 0, duplicated: 1, label: "A", isMember: false })
    await POST(webhookRequest([imageMessage("m1")]))
    expect(sendWhatsAppText).toHaveBeenCalledWith("+26661234567", expect.stringContaining("kept the first"))
  })

  it("replies with the storage-full line when the workspace cap rejects every attachment", async () => {
    resolveWorkspacesByPhoneNumber.mockResolvedValue([{ workspaceId: "ws-1", label: "A", linkedMemberId: null, workspace: { industry: "generic" } }])
    processInboundWhatsApp.mockResolvedValue({ outcome: "storage_full", accepted: 0, rejected: 1, duplicated: 0, label: "A", isMember: false })
    await POST(webhookRequest([imageMessage("m1")]))
    expect(sendWhatsAppText).toHaveBeenCalledWith("+26661234567", expect.stringContaining("workspace is full"))
  })

  it("tells the sender only photos and PDFs are accepted for an unsupported media type", async () => {
    resolveWorkspacesByPhoneNumber.mockResolvedValue([{ workspaceId: "ws-1", label: "A", linkedMemberId: null, workspace: { industry: "generic" } }])
    await POST(webhookRequest([{ id: "m1", from: "+26661234567", type: "sticker" }]))
    expect(sendWhatsAppText).toHaveBeenCalledWith("+26661234567", expect.stringContaining("Only photos and PDFs"))
  })

  it("caps a burst at the per-batch ceiling and asks for the rest later", async () => {
    resolveWorkspacesByPhoneNumber.mockResolvedValue([{ workspaceId: "ws-1", label: "A", linkedMemberId: null, workspace: { industry: "generic" } }])
    processInboundWhatsApp.mockResolvedValue({ outcome: "ingested", accepted: 1, rejected: 0, duplicated: 0, label: "A", isMember: false })
    const messages = Array.from({ length: 25 }, (_, i) => imageMessage(`m${i}`))
    await POST(webhookRequest(messages))
    expect(processInboundWhatsApp).toHaveBeenCalledTimes(20)
    expect(sendWhatsAppText).toHaveBeenCalledWith("+26661234567", expect.stringContaining("send the rest in a moment"))
  })
})
