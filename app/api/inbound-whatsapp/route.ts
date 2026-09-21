import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { JurisdictionRequiredError, requireWorkspaceJurisdiction } from "@/lib/jurisdictions/require"
import { sendWhatsAppText, verifyWebhookSignature } from "@/lib/whatsapp/client"
import { processInboundWhatsApp, resolveWorkspacesByPhoneNumber } from "@/models/inbound-whatsapp"

/** WhatsApp intake (#372/#374) — shipped dark on purpose, same shape as
 * app/api/inbound-email/route.ts: built and tested, but with no Meta number/webhook actually
 * provisioned until config.whatsapp.enabled is turned on by setting every WHATSAPP_* env var.
 *
 * Meta's Cloud API webhook has two verbs: GET is the one-time subscription handshake (echo back
 * hub.challenge if hub.verify_token matches), POST is every subsequent event delivery, HMAC-SHA256
 * signed over the raw body (#373) rather than a bearer secret — unlike the email route, Meta's own
 * scheme does cover this. */

type WhatsAppMediaPayload = { id: string; mime_type: string; sha256?: string; caption?: string }
type WhatsAppMessage = {
  id: string
  from: string
  type: string
  text?: { body?: string }
  image?: WhatsAppMediaPayload
  document?: WhatsAppMediaPayload & { filename?: string }
}
type WhatsAppWebhookChange = { value?: { messages?: WhatsAppMessage[] } }
type WhatsAppWebhookEntry = { changes?: WhatsAppWebhookChange[] }
type WhatsAppWebhookPayload = { entry?: WhatsAppWebhookEntry[] }

export async function GET(request: Request): Promise<Response> {
  if (!config.whatsapp.enabled) return new Response("not_configured", { status: 503 })
  const url = new URL(request.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")
  if (mode === "subscribe" && token === config.whatsapp.verifyToken && challenge) {
    return new Response(challenge, { status: 200 })
  }
  return new Response("forbidden", { status: 403 })
}

function extractMedia(message: WhatsAppMessage): { mediaId: string; mimeType: string; filename: string; caption: string | null } | null {
  if (message.type === "image" && message.image) {
    return { mediaId: message.image.id, mimeType: message.image.mime_type, filename: `whatsapp-${message.id}.jpg`, caption: message.image.caption?.trim() || null }
  }
  if (message.type === "document" && message.document) {
    return { mediaId: message.document.id, mimeType: message.document.mime_type, filename: message.document.filename || `whatsapp-${message.id}.pdf`, caption: message.document.caption?.trim() || null }
  }
  return null
}

async function replyIfEnabled(to: string, body: string): Promise<void> {
  await sendWhatsAppText(to, body)
}

async function handleMessage(message: WhatsAppMessage): Promise<void> {
  // Idempotency: Meta may redeliver the same message on a slow/failed ack. A message this route
  // has already recorded an intake row for must never be ingested twice.
  const existing = await prisma.whatsAppIntake.findUnique({ where: { waMessageId: message.id }, select: { id: true } })
  if (existing) return

  const matches = await resolveWorkspacesByPhoneNumber(message.from)

  if (matches.length === 0) {
    await prisma.whatsAppIntake.create({
      data: { waMessageId: message.id, fromNumber: message.from, workspaceId: null, outcome: "sender_unknown", attachmentCount: 0, acceptedCount: 0, rejectedCount: 0 },
    }).catch(() => {})
    await replyIfEnabled(message.from, "This number isn't linked to a DocuBite workspace yet — ask your admin to add it.")
    return
  }

  if (matches.length > 1) {
    // #372 item 1: ambiguous routing needs a keyword-reply flow to pick one of several linked
    // workspaces. Storing and resolving that pending choice is step 4 fortify work
    // (docs/wayfinder-reports/226/374.handoff.md) — for this step, refuse cleanly and log it
    // rather than guessing which company the sender meant.
    await prisma.whatsAppIntake.create({
      data: { waMessageId: message.id, fromNumber: message.from, workspaceId: null, outcome: "sender_ambiguous", attachmentCount: 0, acceptedCount: 0, rejectedCount: 0 },
    }).catch(() => {})
    await replyIfEnabled(message.from, "This number is linked to more than one company — ask your admin to confirm which one before sending again.")
    return
  }

  const [match] = matches
  if (match.workspace.industry === "healthcare") {
    // Same clinical refusal as inbound email — see models/inbound-email.ts's note.
    return
  }

  try {
    await requireWorkspaceJurisdiction(match.workspaceId)
  } catch (error) {
    if (error instanceof JurisdictionRequiredError) return
    throw error
  }

  const media = extractMedia(message)
  if (!media) {
    await prisma.whatsAppIntake.create({
      data: { waMessageId: message.id, fromNumber: message.from, workspaceId: match.workspaceId, outcome: "no_document", attachmentCount: 0, acceptedCount: 0, rejectedCount: 0 },
    }).catch(() => {})
    await replyIfEnabled(message.from, "Send the receipt as a photo or PDF and it'll be added.")
    return
  }

  const isMember = Boolean(match.linkedMemberId)
  const result = await processInboundWhatsApp(match.workspaceId, match.label, isMember, {
    waMessageId: message.id, fromNumber: message.from, caption: media.caption,
    media: [{ mediaId: media.mediaId, mimeType: media.mimeType, filename: media.filename }],
  })

  if (result.accepted > 0) {
    const who = isMember ? result.label : `‹${result.label}›`
    const ack = isMember
      ? `Got it — ${result.accepted} receipt${result.accepted === 1 ? "" : "s"} added for ${who}. Reading it now; if anything's unclear we'll say so here.`
      : `Got it — ${result.accepted} receipt${result.accepted === 1 ? "" : "s"} added to ${who}.`
    await replyIfEnabled(message.from, ack)
  } else {
    await replyIfEnabled(message.from, "Couldn't read this slip — send one photo of the whole slip, flat and well lit, and it'll replace this one.")
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!config.whatsapp.enabled) return Response.json({ error: "not_configured" }, { status: 503 })

  // #373: signature must be checked against the exact raw bytes, before JSON parsing.
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")
  if (!verifyWebhookSignature(rawBody, signature)) return Response.json({ error: "invalid_signature" }, { status: 401 })

  const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload
  const messages = (payload.entry ?? []).flatMap((entry) => entry.changes ?? []).flatMap((change) => change.value?.messages ?? [])

  // Meta expects a fast 200 regardless of per-message outcome — a slow/failed response here
  // triggers Meta's own retry-with-backoff, which would otherwise pile up. Failures are recorded
  // per message (WhatsAppIntake rows / audit events), never surfaced as a webhook-level error.
  for (const message of messages) {
    try {
      await handleMessage(message)
    } catch (error) {
      console.error("[inbound-whatsapp] failed to process message:", error instanceof Error ? error.message : error)
    }
  }

  return Response.json({ received: messages.length })
}
