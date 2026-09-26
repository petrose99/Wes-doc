import { createHmac } from "crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { webhookSecret } = vi.hoisted(() => ({ webhookSecret: { value: "nango_whsec_test" } }))
vi.mock("@/lib/config", () => ({
  default: { integrations: { nango: { get webhookSecret() { return webhookSecret.value }, host: "https://api.nango.dev", secretKey: "sk_test" } } },
}))

const { verifyWebhookSignature, nangoProxyBinary } = await import("@/lib/nango")

beforeEach(() => { webhookSecret.value = "nango_whsec_test" })

const body = JSON.stringify({ type: "auth", operation: "creation", success: true, connectionId: "conn_1" })

function sign(secret: string, raw: string): string {
  return createHmac("sha256", secret).update(raw).digest("hex")
}

describe("verifyWebhookSignature", () => {
  it("accepts a signature computed with the configured secret", () => {
    expect(verifyWebhookSignature(body, sign("nango_whsec_test", body))).toBe(true)
  })

  it("rejects a signature computed with the wrong secret", () => {
    expect(verifyWebhookSignature(body, sign("wrong_secret", body))).toBe(false)
  })

  it("rejects a tampered body", () => {
    const header = sign("nango_whsec_test", body)
    expect(verifyWebhookSignature(body + " ", header)).toBe(false)
  })

  it("rejects a missing header", () => {
    expect(verifyWebhookSignature(body, null)).toBe(false)
  })

  it("fails closed when no webhook secret is configured", () => {
    webhookSecret.value = ""
    expect(verifyWebhookSignature(body, sign("nango_whsec_test", body))).toBe(false)
  })
})

describe("nangoProxyBinary", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("sends the raw buffer as the body with the caller's content-type, defaulting to POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ AttachmentID: "att_1" }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await nangoProxyBinary<{ AttachmentID: string }>(
      "conn_1", "xero", "/Attachments/invoice.pdf", Buffer.from("file-bytes"), "application/pdf",
    )

    expect(result).toEqual({ AttachmentID: "att_1" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.nango.dev/proxy/Attachments/invoice.pdf")
    expect(init.method).toBe("POST")
    expect(Buffer.from(init.body)).toEqual(Buffer.from("file-bytes"))
    expect(init.headers["content-type"]).toBe("application/pdf")
    expect(init.headers["connection-id"]).toBe("conn_1")
    expect(init.headers["provider-config-key"]).toBe("xero")
  })

  it("honours an explicit method (e.g. PUT)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    await nangoProxyBinary("conn_1", "xero", "/x", Buffer.from("b"), "image/jpeg", { method: "PUT" })

    expect(fetchMock.mock.calls[0][1].method).toBe("PUT")
  })

  it("throws the classified error on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "denied" })
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(
      nangoProxyBinary("conn_1", "xero", "/x", Buffer.from("b"), "image/jpeg"),
    ).rejects.toThrow()
  })
})
