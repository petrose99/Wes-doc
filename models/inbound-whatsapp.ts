// Deliberately NOT a "use server" module, matching models/inbound-email.ts: this trusts the
// sender number/media it is handed. app/api/inbound-whatsapp/route.ts does the signature check
// and is the only caller.
//
// #372: a second intake channel beside inbound email, routed by SENDER PHONE NUMBER rather than a
// per-workspace token — one WhatsApp Business number serves every workspace on the deployment.
// Mirrors models/inbound-email.ts's shape (allowlist, intake log, ingest-every-attachment) with
// two deliberate simplifications for this first build step: no intent classification (#372 item 2
// decided every WhatsApp document defaults to Receipts — re-typed on the queue like any other
// intake mistake) and no zip/portal-link/body-to-pdf handling (WhatsApp messages carry at most one
// media attachment; those email-only paths don't apply). Fortify states (duplicate/burst/storage
// cap replies) land in step 4 of docs/wayfinder-reports/226/374.handoff.md, not here.
import { auditEventData, getRequestAuditContext, recordSystemAudit } from "@/lib/audit"
import { downloadWhatsAppMedia } from "@/lib/whatsapp/client"
import { createIngestionItem } from "@/lib/ingestion"
import { isSupportedDocumentBuffer } from "@/models/documents"
import { prisma } from "@/lib/db"
import { ensurePipelineFile, getFileTemplates } from "@/models/files"
import { cache } from "react"

/** E.164-ish normalization: strip everything but a leading "+" and digits, so "+266 6123 4567",
 * "266612345678" (Meta sometimes omits the "+") and "+266-612-34567" all compare equal. Not full
 * E.164 validation — the allowlist add form is where a malformed number gets caught. */
export function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim()
  const hasPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/[^\d]/g, "")
  return (hasPlus ? "+" : "+") + digits
}

/** #372 item 1: a number linked to more than one workspace (a bookkeeper who runs two companies)
 * is ambiguous, not resolved by picking the first match — the route decides what to do with more
 * than one result (today: refuse with a reply asking the sender to say which company; a
 * keyword-reply flow that stores the pending choice is step 4 fortify work, not this step). */
export async function resolveWorkspacesByPhoneNumber(phoneNumber: string) {
  const normalized = normalizePhoneNumber(phoneNumber)
  return prisma.whatsAppAllowedSender.findMany({
    where: { phoneNumber: normalized },
    select: { workspaceId: true, label: true, linkedMemberId: true, workspace: { select: { industry: true } } },
  })
}

export const listAllowedSenders = cache(async (workspaceId: string) => prisma.whatsAppAllowedSender.findMany({
  where: { workspaceId },
  orderBy: { createdAt: "desc" },
}))

/** Mirrors models/inbound-email.ts's listRecentIntakes — see its comment for why this is capped
 * rather than paged. workspaceId null means the message never resolved to a workspace at all
 * (unknown/ambiguous number); those rows are only visible platform-wide, not on any one
 * workspace's Intake log — deliberately, since an unlinked sender isn't this workspace's problem
 * until an admin links it. */
export const listRecentIntakes = cache(async (workspaceId: string, limit = 20) => prisma.whatsAppIntake.findMany({
  where: { workspaceId },
  orderBy: { createdAt: "desc" },
  take: limit,
}))

export async function addAllowedSender(input: { workspaceId: string; phoneNumber: string; label: string; linkedMemberId?: string | null; createdById: string }) {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber)
  if (!/^\+\d{7,15}$/.test(phoneNumber)) throw new Error("phone_number_invalid")
  const label = input.label.trim()
  if (!label) throw new Error("label_required")
  const context = await getRequestAuditContext()
  const [created] = await prisma.$transaction([
    prisma.whatsAppAllowedSender.upsert({
      where: { workspaceId_phoneNumber: { workspaceId: input.workspaceId, phoneNumber } },
      create: { workspaceId: input.workspaceId, phoneNumber, label, linkedMemberId: input.linkedMemberId || null, createdById: input.createdById },
      update: { label, linkedMemberId: input.linkedMemberId || null },
    }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, actorId: input.createdById, type: "whatsapp_allowed_sender.added", detail: { phoneNumber, label } }, context) }),
  ])
  return created
}

export async function removeAllowedSender(input: { workspaceId: string; id: string; actorId: string }) {
  const row = await prisma.whatsAppAllowedSender.findFirst({ where: { id: input.id, workspaceId: input.workspaceId } })
  if (!row) throw new Error("allowed_sender_not_found")
  const context = await getRequestAuditContext()
  await prisma.$transaction([
    prisma.whatsAppAllowedSender.delete({ where: { id: row.id } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, actorId: input.actorId, type: "whatsapp_allowed_sender.removed", detail: { phoneNumber: row.phoneNumber } }, context) }),
  ])
}

/** Same stand-in as ensureEmailTargetFile in models/inbound-email.ts — WhatsApp has no acting
 * user either, so the workspace's earliest owner stands in for the pipeline container's creator. */
async function ensureWhatsAppTargetFile(workspaceId: string) {
  const owner = await prisma.workspaceMember.findFirst({ where: { workspaceId, role: "owner" }, orderBy: { createdAt: "asc" }, select: { userId: true } })
  if (!owner) throw new Error("workspace_has_no_owner")
  return ensurePipelineFile(workspaceId, owner.userId)
}

export type InboundWhatsAppMedia = { mediaId: string; mimeType: string; filename: string }

export type InboundWhatsAppInput = {
  waMessageId: string
  fromNumber: string
  caption?: string | null
  media: InboundWhatsAppMedia[]
}

export type InboundWhatsAppResult = {
  outcome: "ingested" | "no_document"
  accepted: number
  rejected: number
  duplicated: number
  /** The sender/company name for the ack line — from the matched allowlist row's label. */
  label: string
  /** True when the sender is a linked workspace member (Arc A — the ack should name the person
   * and the receipt auto-drafts into their claim); false for an unauthenticated client (Arc B). */
  isMember: boolean
}

/** One inbound WhatsApp message for ONE already-resolved workspace (the route/caller has already
 * picked which workspace this is — see resolveWorkspacesByPhoneNumber). Ingests every media
 * attachment through the exact same pipeline every other channel uses, always against the
 * Receipts worksheet (#372 item 2 — no classification, unlike email). */
export async function processInboundWhatsApp(workspaceId: string, senderLabel: string, isMember: boolean, input: InboundWhatsAppInput): Promise<InboundWhatsAppResult> {
  const recordIntake = (outcome: string, counts: { accepted: number; rejected: number }) =>
    prisma.whatsAppIntake.create({
      data: {
        workspaceId, waMessageId: input.waMessageId, fromNumber: input.fromNumber,
        caption: input.caption?.trim() || null, attachmentCount: input.media.length,
        acceptedCount: counts.accepted, rejectedCount: counts.rejected, outcome,
      },
    }).catch((error) => { console.error("[inbound-whatsapp] failed to record intake:", error instanceof Error ? error.message : error); return null })

  const file = await ensureWhatsAppTargetFile(workspaceId)
  const templates = await getFileTemplates(workspaceId, file.id)
  const template = templates.find((candidate) => candidate.code === "receipt") ?? templates.find((candidate) => candidate.code === "generic") ?? templates[0]
  if (!template) throw new Error("no_template_available")

  let accepted = 0
  let rejected = 0
  let duplicated = 0
  for (const media of input.media) {
    const downloaded = await downloadWhatsAppMedia(media.mediaId)
    if (!downloaded || !downloaded.buffer.length || !isSupportedDocumentBuffer(downloaded.buffer, downloaded.mimeType)) { rejected++; continue }
    const outcome = await createIngestionItem({
      workspaceId, fileId: file.id, templateId: template.id, source: "whatsapp", worksheetAutoAssigned: true,
      sourceWhatsapp: input.fromNumber, filename: media.filename, mimeType: downloaded.mimeType, buffer: downloaded.buffer,
    })
    if (outcome.outcome === "accepted") accepted++
    else if (outcome.outcome === "duplicate") duplicated++
    else rejected++
  }

  const outcome = accepted > 0 ? "ingested" : "no_document"
  await recordIntake(outcome, { accepted, rejected })
  if (accepted === 0 && duplicated === 0) {
    await recordSystemAudit({
      workspaceId, type: "inbound_whatsapp.no_document",
      detail: { from: input.fromNumber, attachmentCount: input.media.length, rejected },
    })
  }
  return { outcome, accepted, rejected, duplicated, label: senderLabel, isMember }
}
