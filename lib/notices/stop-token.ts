import { createHmac, timingSafeEqual } from "crypto"
import config from "@/lib/config"

/** Signs and verifies the "Stop these emails" link token for #271's Approval notice. Same
 * HMAC-SHA256-over-a-secret shape as lib/webhook-signature.ts, but never shares a MAC with it:
 * the purpose tag below is folded into the signed bytes (domain separation), so a webhook
 * signature computed over the same raw string can never verify as a stop token and vice versa.
 * No login, no lookup table — the token itself carries everything needed to act, since the whole
 * point is a one-click, unauthenticated opt-out (Category 2 symmetry with a one-click opt-in). */

const PURPOSE = "approval-notice-stop"
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

function payloadFor(userId: string, workspaceId: string, issuedAt: number): string {
  return `${userId}:${workspaceId}:${issuedAt}`
}

function mac(payload: string): string {
  return createHmac("sha256", config.aws.internalWorkerSecret).update(`${PURPOSE}:${payload}`).digest("hex")
}

export function signStopToken(userId: string, workspaceId: string, now: Date = new Date()): string {
  const payload = payloadFor(userId, workspaceId, now.getTime())
  const encoded = Buffer.from(payload, "utf8").toString("base64url")
  return `${encoded}.${mac(payload)}`
}

export type StopTokenPayload = { userId: string; workspaceId: string; issuedAt: number }

/** Returns the decoded payload when the token is well-formed, unmodified, and not older than
 * MAX_AGE_MS; null otherwise (tampered, malformed, or expired — all the same "not valid" result
 * to the caller, which never needs to distinguish them). */
export function verifyStopToken(token: string, now: Date = new Date()): StopTokenPayload | null {
  const dot = token.indexOf(".")
  if (dot < 0) return null
  const encoded = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  let payload: string
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8")
  } catch {
    return null
  }
  const expected = mac(payload)
  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return null

  const parts = payload.split(":")
  if (parts.length !== 3) return null
  const [userId, workspaceId, issuedAtRaw] = parts
  const issuedAt = Number(issuedAtRaw)
  if (!userId || !workspaceId || !Number.isFinite(issuedAt)) return null
  if (now.getTime() - issuedAt > MAX_AGE_MS) return null
  return { userId, workspaceId, issuedAt }
}
