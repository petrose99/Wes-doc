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

// #372 fortify: DocuBite's own ceiling on one sender's album, not a Meta platform limit (#373)
// confirmed no such limit exists. Kept small and local — nothing else in the codebase reads it.
const MAX_MESSAGES_PER_BATCH = 20

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

// #372 fortify: one outcome per message, WITHOUT sending a reply — POST groups messages by sender
// (an album arrives as several messages in one webhook delivery) and decides the reply per group,
// not per message, so an 8-photo album gets one "Got it — 8 receipts…" instead of eight.
type MessageOutcome =
  | { kind: "already_processed" | "healthcare" }
  | { kind: "unknown" | "ambiguous" | "jurisdiction_missing" | "duplicate_only" | "storage_full" | "no_document" }
  | { kind: "no_media"; mediaType: "text" | "unsupported" }
  | { kind: "ingested"; accepted: number; label: string; isMember: boolean }

async function handleMessage(message: WhatsAppMessage): Promise<MessageOutcome> {
  // Idempotency: Meta may redeliver the same message on a slow/failed ack. A message this route
  // has already recorded an intake row for must never be ingested twice.
  const existing = await prisma.whatsAppIntake.findUnique({ where: { waMessageId: message.id }, select: { id: true } })
  if (existing) return { kind: "already_processed" }

  const matches = await resolveWorkspacesByPhoneNumber(message.from)

  if (matches.length === 0) {
    await prisma.whatsAppIntake.create({
      data: { waMessageId: message.id, fromNumber: message.from, workspaceId: null, outcome: "sender_unknown", attachmentCount: 0, acceptedCount: 0, rejectedCount: 0 },
    }).catch(() => {})
    return { kind: "unknown" }
  }

  if (matches.length > 1) {
    // #372 item 1: ambiguous routing needs a keyword-reply flow to pick one of several linked
    // workspaces. Storing and resolving that pending choice is step 4 fortify work
    // (docs/wayfinder-reports/226/374.handoff.md) — for this step, refuse cleanly and log it
    // rather than guessing which company the sender meant.
    await prisma.whatsAppIntake.create({
      data: { waMessageId: message.id, fromNumber: message.from, workspaceId: null, outcome: "sender_ambiguous", attachmentCount: 0, acceptedCount: 0, rejectedCount: 0 },
    }).catch(() => {})
    return { kind: "ambiguous" }
  }

  const [match] = matches
  if (match.workspace.industry === "healthcare") {
    // Same clinical refusal as inbound email — see models/inbound-email.ts's note.
    return { kind: "healthcare" }
  }

  try {
    await requireWorkspaceJurisdiction(match.workspaceId)
  } catch (error) {
    if (!(error instanceof JurisdictionRequiredError)) throw error
    await prisma.whatsAppIntake.create({
      data: { waMessageId: message.id, fromNumber: message.from, workspaceId: match.workspaceId, outcome: "jurisdiction_missing", attachmentCount: 0, acceptedCount: 0, rejectedCount: 0 },
    }).catch(() => {})
    return { kind: "jurisdiction_missing" }
  }

  const media = extractMedia(message)
  if (!media) {
    const mediaType: "text" | "unsupported" = message.type === "text" ? "text" : "unsupported"
    await prisma.whatsAppIntake.create({
      data: { waMessageId: message.id, fromNumber: message.from, workspaceId: match.workspaceId, outcome: "no_document", attachmentCount: 0, acceptedCount: 0, rejectedCount: 0 },
    }).catch(() => {})
    return { kind: "no_media", mediaType }
  }

  const isMember = Boolean(match.linkedMemberId)
  const result = await processInboundWhatsApp(match.workspaceId, match.label, isMember, {
    waMessageId: message.id, fromNumber: message.from, caption: media.caption,
    media: [{ mediaId: media.mediaId, mimeType: media.mimeType, filename: media.filename }],
  })

  if (result.outcome === "ingested") return { kind: "ingested", accepted: result.accepted, label: result.label, isMember }
  if (result.outcome === "duplicate_only") return { kind: "duplicate_only" }
  if (result.outcome === "storage_full") return { kind: "storage_full" }
  return { kind: "no_document" }
}

const REPLY_LINES: Partial<Record<MessageOutcome["kind"], string>> = {
  unknown: "This number isn't linked to a DocuBite workspace yet — ask your admin to add it.",
  ambiguous: "This number is linked to more than one company — ask your admin to confirm which one before sending again.",
  jurisdiction_missing: "Couldn't add this — the workspace isn't set up yet. Your admin has been notified.",
  duplicate_only: "Looks like you already sent this one — kept the first.",
  storage_full: "Couldn't add this — the workspace is full. Your admin has been notified.",
  no_document: "Couldn't read this slip — send one photo of the whole slip, flat and well lit, and it'll replace this one.",
}

export async function POST(request: Request): Promise<Response> {
  if (!config.whatsapp.enabled) return Response.json({ error: "not_configured" }, { status: 503 })

  // #373: signature must be checked against the exact raw bytes, before JSON parsing.
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")
  if (!verifyWebhookSignature(rawBody, signature)) return Response.json({ error: "invalid_signature" }, { status: 401 })

  const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload
  const messages = (payload.entry ?? []).flatMap((entry) => entry.changes ?? []).flatMap((change) => change.value?.messages ?? [])

  // #372 fortify — album of N images: Meta delivers each image of one album as its own message,
  // usually in the same webhook POST. Grouping by sender before replying turns that into one ack
  // with a count instead of N separate pings.
  const bySender = new Map<string, WhatsAppMessage[]>()
  for (const message of messages) {
    const group = bySender.get(message.from) ?? []
    group.push(message)
    bySender.set(message.from, group)
  }

  for (const [from, group] of bySender) {
    // #372 fortify — burst cap: DocuBite's own ceiling (#373: no such limit from Meta), not a
    // duplicate check — messages past the cap are left unprocessed rather than ingested, so
    // Meta's own redelivery-on-timeout can still pick them up later if the sender doesn't resend.
    const capped = group.slice(0, MAX_MESSAGES_PER_BATCH)
    const overCap = group.length > MAX_MESSAGES_PER_BATCH

    let ingestedTotal = 0
    let ingestedLabel = ""
    let ingestedIsMember = false
    const otherLines = new Set<string>()

    for (const message of capped) {
      try {
        const outcome = await handleMessage(message)
        if (outcome.kind === "ingested") {
          ingestedTotal += outcome.accepted
          ingestedLabel = outcome.label
          ingestedIsMember = outcome.isMember
        } else if (outcome.kind === "no_media") {
          otherLines.add(outcome.mediaType === "text"
            ? "Send the receipt as a photo or PDF and it'll be added."
            : "Only photos and PDFs can be added here.")
        } else {
          const line = REPLY_LINES[outcome.kind]
          if (line) otherLines.add(line)
        }
      } catch (error) {
        console.error("[inbound-whatsapp] failed to process message:", error instanceof Error ? error.message : error)
      }
    }

    for (const line of otherLines) await replyIfEnabled(from, line)

    if (ingestedTotal > 0) {
      const who = ingestedIsMember ? ingestedLabel : `‹${ingestedLabel}›`
      const ack = ingestedIsMember
        ? `Got it — ${ingestedTotal} receipt${ingestedTotal === 1 ? "" : "s"} added for ${who}. Reading it now; if anything's unclear we'll say so here.`
        : `Got it — ${ingestedTotal} receipt${ingestedTotal === 1 ? "" : "s"} added to ${who}.`
      await replyIfEnabled(from, ack)
    }

    if (overCap) await replyIfEnabled(from, `Added ${ingestedTotal}; send the rest in a moment.`)
  }

  return Response.json({ received: messages.length })
}
