/** A9.8: short-lived signed URLs for document source. Anywhere the app hands out a URL to a
 * client (an <a href> in an email, an <img> src in a chat, a source-viewer iframe) that URL
 * must self-expire so a copy-pasted link goes dark quickly and can never be enumerated for
 * cross-tenant access. This is a pure signer over the existing storage key + an expiry — the
 * document/source route reads url search params, verifies the HMAC, and blocks anything past
 * `exp`. */
import { createHmac, timingSafeEqual } from "crypto"

/** Bytes signed under the workspace's session-scoped signing key, base64url-encoded. */
export type SignedTokenComponents = {
  workspaceId: string
  documentId: string
  /** Unix seconds after which the token is refused. */
  exp: number
  /** Free-form scope (e.g. "source", "thumbnail"), so a source link cannot be replayed as a
   * different asset type. */
  scope: string
}

const HASH = "sha256"

function payload(t: SignedTokenComponents): string {
  return `${t.scope}|${t.workspaceId}|${t.documentId}|${t.exp}`
}

function b64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function b64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4)
  return Buffer.from(padded, "base64")
}

export function signDocumentAssetUrl(secret: string, t: SignedTokenComponents): string {
  const mac = createHmac(HASH, secret).update(payload(t)).digest()
  return `${t.exp}.${t.scope}.${b64url(mac)}`
}

export type VerifyOutcome =
  | { ok: true; scope: string }
  | { ok: false; reason: "malformed" | "expired" | "bad_signature" | "wrong_scope" }

export function verifyDocumentAssetToken(secret: string, token: string, expected: { workspaceId: string; documentId: string; scope: string }, now: number): VerifyOutcome {
  const parts = token.split(".")
  if (parts.length !== 3) return { ok: false, reason: "malformed" }
  const [expStr, scope, macB64] = parts
  const exp = Number(expStr)
  if (!Number.isFinite(exp)) return { ok: false, reason: "malformed" }
  if (scope !== expected.scope) return { ok: false, reason: "wrong_scope" }
  if (now >= exp) return { ok: false, reason: "expired" }
  const expected_mac = createHmac(HASH, secret).update(payload({ scope, exp, workspaceId: expected.workspaceId, documentId: expected.documentId })).digest()
  const supplied = b64urlDecode(macB64)
  if (supplied.length !== expected_mac.length) return { ok: false, reason: "bad_signature" }
  return timingSafeEqual(supplied, expected_mac) ? { ok: true, scope } : { ok: false, reason: "bad_signature" }
}

/** Default expiry window for a source link — five minutes is enough for a page to render and
 * long enough that a slow network doesn't fight the user, but short enough that a URL leaked
 * onto a screen recording is dead by the time the recording is published. */
export const DEFAULT_ASSET_TTL_SECONDS = 300
