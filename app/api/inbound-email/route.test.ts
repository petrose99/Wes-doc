import { beforeEach, describe, expect, it, vi } from "vitest"

const { inboundEmail } = vi.hoisted(() => ({ inboundEmail: { enabled: true, secret: "test-secret", domain: "inbound.docubite.test" } }))
vi.mock("@/lib/config", () => ({ default: { get inboundEmail() { return inboundEmail } } }))
vi.mock("@/models/inbound-email", () => ({ resolveWorkspaceByInboundToken: vi.fn(), processInboundEmail: vi.fn() }))
// #49: the route now guards on workspace jurisdiction via lib/jurisdictions/require, which imports
// @/lib/db (unmocked here). Stub the module so existing route tests see the happy path; the
// dedicated jurisdiction-required test below flips it to throw.
class MockJurisdictionRequiredError extends Error {
  readonly code = "JURISDICTION_REQUIRED"
  constructor(readonly workspaceId: string) { super("jurisdiction_required"); this.name = "JurisdictionRequiredError" }
}
vi.mock("@/lib/jurisdictions/require", () => ({
  JurisdictionRequiredError: MockJurisdictionRequiredError,
  requireWorkspaceJurisdiction: vi.fn().mockResolvedValue({ jurisdictionCode: "ZA", jurisdictionPackVersion: "za-v0-2026-09" }),
}))

const { POST } = await import("@/app/api/inbound-email/route")
const { resolveWorkspaceByInboundToken, processInboundEmail } = await import("@/models/inbound-email")
const { requireWorkspaceJurisdiction } = await import("@/lib/jurisdictions/require")

/** A recorded-shape Postmark inbound webhook fixture — the format this route is built and tested
 * against per the roadmap, ahead of any real provider being wired up. */
function postmarkFixture(overrides: Record<string, unknown> = {}) {
  return {
    To: "Inbox <abc123token@inbound.docubite.test>",
    From: "Jamie Owner <owner@example.com>",
    Subject: "Invoice attached",
    Attachments: [{ Name: "invoice.pdf", ContentType: "application/pdf", Content: Buffer.from("%PDF-1.4\n").toString("base64") }],
    ...overrides,
  }
}

function request(body: unknown, headers: Record<string, string> = { authorization: "Bearer test-secret" }) {
  return new Request("https://app.test/api/inbound-email", { method: "POST", headers, body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  inboundEmail.enabled = true
  inboundEmail.secret = "test-secret"
})

describe("POST /api/inbound-email", () => {
  it("refuses everything when the feature is not configured", async () => {
    inboundEmail.enabled = false
    const response = await POST(request(postmarkFixture()))
    expect(response.status).toBe(503)
    expect(resolveWorkspaceByInboundToken).not.toHaveBeenCalled()
  })

  it("refuses a request with no bearer secret", async () => {
    const response = await POST(request(postmarkFixture(), {}))
    expect(response.status).toBe(401)
  })

  it("refuses a request with the wrong bearer secret", async () => {
    const response = await POST(request(postmarkFixture(), { authorization: "Bearer wrong" }))
    expect(response.status).toBe(401)
  })

  it("refuses a malformed payload missing To/From", async () => {
    const response = await POST(request({ Attachments: [] }))
    expect(response.status).toBe(400)
  })

  it("refuses an unknown recipient token", async () => {
    vi.mocked(resolveWorkspaceByInboundToken).mockResolvedValue(null)
    const response = await POST(request(postmarkFixture()))
    expect(response.status).toBe(404)
    expect(resolveWorkspaceByInboundToken).toHaveBeenCalledWith("abc123token")
  })

  it("refuses a clinical workspace even with a valid token", async () => {
    vi.mocked(resolveWorkspaceByInboundToken).mockResolvedValue({ id: "w1", industry: "healthcare" } as never)
    const response = await POST(request(postmarkFixture()))
    expect(response.status).toBe(403)
    expect(processInboundEmail).not.toHaveBeenCalled()
  })

  it("returns 403 when the model refuses the sender", async () => {
    vi.mocked(resolveWorkspaceByInboundToken).mockResolvedValue({ id: "w1", industry: "finance" } as never)
    vi.mocked(processInboundEmail).mockRejectedValue(new Error("sender_not_allowed"))
    const response = await POST(request(postmarkFixture()))
    expect(response.status).toBe(403)
  })

  it("processes a valid recorded-shape payload end to end", async () => {
    vi.mocked(resolveWorkspaceByInboundToken).mockResolvedValue({ id: "w1", industry: "finance" } as never)
    vi.mocked(processInboundEmail).mockResolvedValue({ accepted: 1, rejected: 0 })

    const response = await POST(request(postmarkFixture()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ accepted: 1, rejected: 0 })
    expect(vi.mocked(processInboundEmail).mock.calls[0][0]).toEqual({
      workspaceId: "w1", from: "owner@example.com",
      subject: "Invoice attached", textBody: null, htmlBody: null,
      attachments: [expect.objectContaining({ filename: "invoice.pdf", contentType: "application/pdf", base64Content: Buffer.from("%PDF-1.4\n").toString("base64") })],
    })
  })

  it("extracts a bare (non-bracketed) To/From address the same way", async () => {
    vi.mocked(resolveWorkspaceByInboundToken).mockResolvedValue({ id: "w1", industry: "finance" } as never)
    vi.mocked(processInboundEmail).mockResolvedValue({ accepted: 0, rejected: 0 })

    await POST(request(postmarkFixture({ To: "abc123token@inbound.docubite.test", From: "owner@example.com" })))

    expect(resolveWorkspaceByInboundToken).toHaveBeenCalledWith("abc123token")
    expect(vi.mocked(processInboundEmail).mock.calls[0][0].from).toBe("owner@example.com")
  })

  it("drops an attachment missing a name, type, or content rather than crashing", async () => {
    vi.mocked(resolveWorkspaceByInboundToken).mockResolvedValue({ id: "w1", industry: "finance" } as never)
    vi.mocked(processInboundEmail).mockResolvedValue({ accepted: 0, rejected: 0 })

    await POST(request(postmarkFixture({ Attachments: [{ Name: "invoice.pdf" }] })))

    expect(vi.mocked(processInboundEmail).mock.calls[0][0].attachments).toEqual([])
  })

  // #49: refuses inbound when the workspace has picked no jurisdiction, before processInboundEmail
  // ever runs. Same rule as the upload action and the v1 API — see lib/jurisdictions/require.ts.
  it("returns 409 jurisdiction_required when the workspace has no jurisdiction", async () => {
    vi.mocked(resolveWorkspaceByInboundToken).mockResolvedValue({ id: "w1", industry: "finance" } as never)
    vi.mocked(requireWorkspaceJurisdiction).mockRejectedValueOnce(new MockJurisdictionRequiredError("w1"))

    const response = await POST(request(postmarkFixture()))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: "jurisdiction_required" })
    expect(processInboundEmail).not.toHaveBeenCalled()
  })
})
