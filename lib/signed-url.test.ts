import { describe, expect, it } from "vitest"
import { DEFAULT_ASSET_TTL_SECONDS, signDocumentAssetUrl, verifyDocumentAssetToken } from "@/lib/signed-url"

const secret = "whsec_" + "x".repeat(32)
const at = 1_700_000_000
const target = { workspaceId: "w1", documentId: "d1", scope: "source" }
const exp = at + DEFAULT_ASSET_TTL_SECONDS
const token = signDocumentAssetUrl(secret, { ...target, exp })

describe("signDocumentAssetUrl / verifyDocumentAssetToken round trip", () => {
  it("verifies a fresh signature", () => {
    expect(verifyDocumentAssetToken(secret, token, target, at)).toMatchObject({ ok: true })
  })
  it("rejects a token past exp", () => {
    expect(verifyDocumentAssetToken(secret, token, target, exp + 1)).toMatchObject({ ok: false, reason: "expired" })
  })
  it("rejects a token signed with a different secret", () => {
    expect(verifyDocumentAssetToken("whsec_other", token, target, at)).toMatchObject({ ok: false, reason: "bad_signature" })
  })
  it("rejects a token addressed at the wrong document", () => {
    expect(verifyDocumentAssetToken(secret, token, { ...target, documentId: "d2" }, at)).toMatchObject({ ok: false, reason: "bad_signature" })
  })
  it("rejects a token replayed with a different scope", () => {
    expect(verifyDocumentAssetToken(secret, token, { ...target, scope: "thumbnail" }, at)).toMatchObject({ ok: false, reason: "wrong_scope" })
  })
  it("rejects a malformed token", () => {
    expect(verifyDocumentAssetToken(secret, "not.a.valid", target, at)).toMatchObject({ ok: false })
  })
})
