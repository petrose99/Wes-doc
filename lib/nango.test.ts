import { createHmac } from "crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { webhookSecret } = vi.hoisted(() => ({ webhookSecret: { value: "nango_whsec_test" } }))
vi.mock("@/lib/config", () => ({
  default: { integrations: { nango: { get webhookSecret() { return webhookSecret.value }, host: "https://api.nango.dev", secretKey: "sk_test" } } },
}))

const { verifyWebhookSignature } = await import("@/lib/nango")

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
