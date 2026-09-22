import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/config", () => ({ default: { app: { baseURL: "https://app.test" } } }))

const verifyWebhookSignature = vi.fn().mockReturnValue(true)
const getConnectionConfig = vi.fn().mockResolvedValue({})
vi.mock("@/lib/nango", () => ({
  verifyWebhookSignature: (...args: unknown[]) => verifyWebhookSignature(...args),
  getConnectionConfig: (...args: unknown[]) => getConnectionConfig(...args),
}))

const sendReminderEmail = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/email", () => ({ sendReminderEmail: (...args: unknown[]) => sendReminderEmail(...args) }))

const createIntegrationConnectionFromNango = vi.fn().mockResolvedValue({})
const markIntegrationConnectionNeedsReconnect = vi.fn().mockResolvedValue(null)
vi.mock("@/models/integrations", () => ({
  createIntegrationConnectionFromNango: (...args: unknown[]) => createIntegrationConnectionFromNango(...args),
  markIntegrationConnectionNeedsReconnect: (...args: unknown[]) => markIntegrationConnectionNeedsReconnect(...args),
}))

const resolveOwnerRecipients = vi.fn().mockResolvedValue(["owner@x.com"])
vi.mock("@/models/reminders", () => ({ resolveOwnerRecipients: (...args: unknown[]) => resolveOwnerRecipients(...args) }))

const { POST } = await import("@/app/api/webhooks/nango/route")

function webhookRequest(body: unknown) {
  return new Request("https://app.test/api/webhooks/nango", {
    method: "POST",
    headers: { "x-nango-signature": "sig" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyWebhookSignature.mockReturnValue(true)
  getConnectionConfig.mockResolvedValue({})
  markIntegrationConnectionNeedsReconnect.mockResolvedValue(null)
  resolveOwnerRecipients.mockResolvedValue(["owner@x.com"])
})

describe("POST /api/webhooks/nango", () => {
  it("rejects a bad signature", async () => {
    verifyWebhookSignature.mockReturnValue(false)
    const response = await POST(webhookRequest({ type: "auth" }))
    expect(response.status).toBe(403)
    expect(createIntegrationConnectionFromNango).not.toHaveBeenCalled()
  })

  it("ignores non-auth webhook types", async () => {
    const response = await POST(webhookRequest({ type: "sync" }))
    expect(response.status).toBe(200)
    expect(createIntegrationConnectionFromNango).not.toHaveBeenCalled()
  })

  it("creates the connection on a successful creation, reading the tenant off connection_config", async () => {
    getConnectionConfig.mockResolvedValue({ realmId: "realm-1", tenantName: "Acme" })
    const response = await POST(webhookRequest({
      type: "auth", operation: "creation", success: true,
      connectionId: "conn-1", providerConfigKey: "quickbooks",
      endUser: { endUserId: "ws-1" },
    }))
    expect(response.status).toBe(200)
    expect(createIntegrationConnectionFromNango).toHaveBeenCalledWith({
      connectionId: "conn-1", workspaceId: "ws-1", provider: "quickbooks", providerConfigKey: "quickbooks",
      externalTenantId: "realm-1", tenantName: "Acme", createdById: null,
    })
  })

  it("skips the connection_config lookup for sage, which has no tenant field", async () => {
    await POST(webhookRequest({
      type: "auth", operation: "creation", success: true,
      connectionId: "conn-2", providerConfigKey: "sage",
      endUser: { endUserId: "ws-1" },
    }))
    expect(getConnectionConfig).not.toHaveBeenCalled()
    expect(createIntegrationConnectionFromNango).toHaveBeenCalledWith(expect.objectContaining({ externalTenantId: null, tenantName: null }))
  })

  it("rejects a creation with no endUserId", async () => {
    const response = await POST(webhookRequest({
      type: "auth", operation: "creation", success: true,
      connectionId: "conn-3", providerConfigKey: "quickbooks", endUser: {},
    }))
    expect(response.status).toBe(400)
    expect(createIntegrationConnectionFromNango).not.toHaveBeenCalled()
  })

  it("flips the row to needs_reconnect on a failed refresh and emails owners once on the new break", async () => {
    markIntegrationConnectionNeedsReconnect.mockResolvedValue({ isNewBreak: true, workspaceId: "ws-1" })
    const response = await POST(webhookRequest({
      type: "auth", operation: "refresh", success: false,
      connectionId: "conn-1", providerConfigKey: "quickbooks",
    }))
    expect(response.status).toBe(200)
    expect(markIntegrationConnectionNeedsReconnect).toHaveBeenCalledWith("conn-1")
    expect(sendReminderEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@x.com", subject: expect.stringContaining("reconnect") }))
  })

  it("does not re-email on a redelivered failure webhook (not a new break)", async () => {
    markIntegrationConnectionNeedsReconnect.mockResolvedValue({ isNewBreak: false, workspaceId: "ws-1" })
    await POST(webhookRequest({
      type: "auth", operation: "refresh", success: false,
      connectionId: "conn-1", providerConfigKey: "quickbooks",
    }))
    expect(sendReminderEmail).not.toHaveBeenCalled()
  })

  it("does nothing on a successful refresh of an already-connected row", async () => {
    const response = await POST(webhookRequest({
      type: "auth", operation: "refresh", success: true,
      connectionId: "conn-1", providerConfigKey: "quickbooks",
    }))
    expect(response.status).toBe(200)
    expect(createIntegrationConnectionFromNango).not.toHaveBeenCalled()
    expect(markIntegrationConnectionNeedsReconnect).not.toHaveBeenCalled()
  })

  it("rejects an unknown providerConfigKey", async () => {
    const response = await POST(webhookRequest({
      type: "auth", operation: "creation", success: true,
      connectionId: "conn-4", providerConfigKey: "bigcapital", endUser: { endUserId: "ws-1" },
    }))
    expect(response.status).toBe(400)
  })
})
