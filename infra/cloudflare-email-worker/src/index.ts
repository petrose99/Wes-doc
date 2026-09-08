import PostalMime from "postal-mime"

/** Cloudflare Email Routing worker for DocuBite's inbound-email intake (WP13).
 *
 * Cloudflare Email Routing hands a worker the raw MIME message (no JSON webhook of its own), so
 * this worker's only job is: parse the MIME with postal-mime, reshape it into the Postmark
 * inbound-webhook JSON shape that app/api/inbound-email/route.ts already parses (see that file's
 * own comment — Postmark is "the recommended provider in the roadmap" and swapping providers was
 * meant to only touch route parsing, not models/inbound-email.ts), and POST it there with the
 * shared bearer secret. The app route does the real validation (token, allowlist, healthcare
 * gate) — this worker does not duplicate any of that.
 */

export interface Env {
  APP_INBOUND_URL: string
  APP_INBOUND_SECRET: string
}

type PostmarkAttachment = { Name: string; ContentType: string; Content: string; ContentID?: string; ContentDisposition?: string }
type PostmarkInboundPayload = { To: string; From: string; Subject?: string; TextBody?: string; HtmlBody?: string; Attachments: PostmarkAttachment[] }

function toBase64(content: string | ArrayBuffer | Uint8Array): string {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content instanceof Uint8Array ? content : new Uint8Array(content)
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (!env.APP_INBOUND_URL || !env.APP_INBOUND_SECRET) {
      message.setReject("inbound email intake is not configured")
      return
    }

    const rawBuffer = await new Response(message.raw).arrayBuffer()
    const parsed = await PostalMime.parse(rawBuffer)

    const payload: PostmarkInboundPayload = {
      // message.to/message.from are the envelope addresses Email Routing itself resolved —
      // more trustworthy than whatever the MIME From/To headers claim.
      To: message.to,
      From: message.from,
      Subject: parsed.subject,
      TextBody: parsed.text,
      HtmlBody: parsed.html ?? undefined,
      Attachments: parsed.attachments.map((attachment) => ({
        Name: attachment.filename || "attachment",
        ContentType: attachment.mimeType || "application/octet-stream",
        Content: toBase64(attachment.content),
        ContentID: attachment.contentId ?? undefined,
        ContentDisposition: attachment.disposition ?? undefined,
      })),
    }

    const response = await fetch(env.APP_INBOUND_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.APP_INBOUND_SECRET}` },
      body: JSON.stringify(payload),
    })

    // Bounce back to the sender for outcomes they can act on (unknown/mistyped address, sender
    // not on the workspace's allowlist); swallow everything else so a transient app-side error
    // doesn't also fail the mail server's own retry/bounce semantics unpredictably.
    if (response.status === 404) {
      message.setReject("unknown recipient — check the inbound address for this workspace")
      return
    }
    if (response.status === 403) {
      message.setReject("sender is not allowed to send documents to this workspace")
      return
    }
  },
}
