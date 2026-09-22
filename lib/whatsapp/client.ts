// Thin wrapper around Meta's WhatsApp Business Cloud API (Graph API). Deliberately NOT a
// "use server" module, matching every other lib/*.ts integration client here.
import config from "@/lib/config"
import crypto from "crypto"

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0"

/** #373: Meta HMAC-SHA256-signs the raw request body with the app secret, sent as
 * `X-Hub-Signature-256: sha256=<hex>`. Must be checked against the exact raw bytes, before JSON
 * parsing — the caller (the route) is responsible for reading the body as text first. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false
  const expected = crypto.createHmac("sha256", config.whatsapp.appSecret).update(rawBody, "utf8").digest("hex")
  const provided = signatureHeader.slice("sha256=".length)
  if (expected.length !== provided.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))
}

/** #373: media URLs expire 5 minutes after issue, so this must be called near-synchronously on
 * webhook receipt — never queued for later. Two calls: resolve the media id to a short-lived
 * download URL, then fetch the bytes from it (both need the access token, the second as a bearer
 * header per Meta's docs). */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const metaResponse = await fetch(`${GRAPH_API_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` },
  })
  if (!metaResponse.ok) return null
  const meta = await metaResponse.json().catch(() => null) as { url?: string; mime_type?: string } | null
  if (!meta?.url) return null

  const mediaResponse = await fetch(meta.url, { headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` } })
  if (!mediaResponse.ok) return null
  const arrayBuffer = await mediaResponse.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), mimeType: meta.mime_type || mediaResponse.headers.get("content-type") || "application/octet-stream" }
}

/** #372: one free-form reply per inbound message, inside the 24h customer-service window
 * (unbilled per #373). Never throws — a failed ack must not fail intake; the caller logs. */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  if (!config.whatsapp.enabled) return
  try {
    await fetch(`${GRAPH_API_BASE}/${config.whatsapp.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.whatsapp.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    })
  } catch (error) {
    console.error("[whatsapp] failed to send reply:", error instanceof Error ? error.message : error)
  }
}
