import { describe, expect, it } from "vitest"
import { signStopToken, verifyStopToken } from "./stop-token"
import { buildSignatureHeader, computeSignature } from "@/lib/webhook-signature"
import config from "@/lib/config"

describe("stop-token", () => {
  it("round-trips a freshly signed token", () => {
    const token = signStopToken("user-1", "ws-1")
    const payload = verifyStopToken(token)
    expect(payload).toEqual({ userId: "user-1", workspaceId: "ws-1", issuedAt: payload!.issuedAt })
  })

  it("rejects a tampered token", () => {
    const token = signStopToken("user-1", "ws-1")
    const [encoded, sig] = token.split(".")
    const tampered = `${Buffer.from("user-2:ws-1:1", "utf8").toString("base64url")}.${sig}`
    expect(verifyStopToken(tampered)).toBeNull()
    expect(verifyStopToken(`${encoded}.${sig.slice(0, -1)}0`)).toBeNull()
  })

  it("rejects an expired token", () => {
    const now = new Date()
    const issued = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000)
    const token = signStopToken("user-1", "ws-1", issued)
    expect(verifyStopToken(token, now)).toBeNull()
  })

  it("does not verify as a webhook signature over the same bytes (domain separation)", () => {
    const token = signStopToken("user-1", "ws-1")
    const [, sig] = token.split(".")
    const rawBody = "user-1:ws-1:0"
    const webhookMac = computeSignature(config.aws.internalWorkerSecret, 0, rawBody)
    expect(sig).not.toBe(webhookMac)
    const header = buildSignatureHeader(config.aws.internalWorkerSecret, 0, rawBody)
    expect(header).not.toContain(sig)
  })

  it("rejects a malformed token", () => {
    expect(verifyStopToken("not-a-token")).toBeNull()
    expect(verifyStopToken("")).toBeNull()
  })
})
