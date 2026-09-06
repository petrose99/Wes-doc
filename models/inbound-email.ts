// Deliberately NOT a "use server" module, matching every other models/*.ts helper here: this
// trusts the token/sender it is handed. app/api/inbound-email/route.ts does the signature check
// and is the only caller.
import { track } from "@/lib/analytics"
import { auditEventData, getRequestAuditContext, recordSystemAudit } from "@/lib/audit"
import { htmlToText, looksInvoiceLike, renderEmailBodyPdf } from "@/lib/inbound/html-to-pdf"
import { createIngestionItem } from "@/lib/ingestion"
import { isSupportedDocumentBuffer } from "@/models/documents"
import { EXTENSION_MIME_TYPES } from "@/lib/zip-ingestion"
import { prisma } from "@/lib/db"
import { DEFAULT_DOCUMENT_TEMPLATES } from "@/lib/document-templates"
import { createFile, getFileTemplates } from "@/models/files"
import { getWorkspaceMembers } from "@/models/workspaces"
import crypto from "crypto"
import { cache } from "react"

/** Generates (or returns the existing) per-workspace inbound routing token. Refused outright for
 * a healthcare workspace — unencrypted email is not an acceptable channel for ePHI, so there is
 * deliberately no address for one to send to, not just a disabled-looking one. */
export async function ensureInboundEmailToken(workspaceId: string): Promise<string> {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { inboundEmailToken: true, industry: true } })
  if (workspace.industry === "healthcare") throw new Error("inbound_email_disabled_for_clinical")
  if (workspace.inboundEmailToken) return workspace.inboundEmailToken
  const token = crypto.randomBytes(16).toString("base64url")
  await prisma.workspace.update({ where: { id: workspaceId }, data: { inboundEmailToken: token } })
  return token
}

export const resolveWorkspaceByInboundToken = (token: string) => prisma.workspace.findUnique({ where: { inboundEmailToken: token }, select: { id: true, industry: true } })

/** Matches one lowercased sender email against one allowlist pattern: either an exact email, or a
 * "@domain.tld" suffix matching only that exact domain — "@corp.com" must not match
 * "x@sub.corp.com", so this compares the sender's domain for exact equality, not a suffix scan. */
export function matchesAllowPattern(pattern: string, email: string): boolean {
  const normalizedPattern = pattern.trim().toLowerCase()
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedPattern || !normalizedEmail) return false
  if (normalizedPattern.startsWith("@")) {
    const domain = normalizedEmail.split("@")[1]
    return domain === normalizedPattern.slice(1)
  }
  return normalizedEmail === normalizedPattern
}

/** Allowlist: any address already a member of the workspace, OR one matching an explicitly added
 * InboundEmailAllowedSender pattern (a bookkeeper's own inbox, or a whole domain). */
export async function isSenderAllowed(workspaceId: string, senderEmail: string): Promise<boolean> {
  const normalized = senderEmail.trim().toLowerCase()
  if (!normalized) return false
  const members = await getWorkspaceMembers(workspaceId)
  if (members.some((member) => member.user.email.toLowerCase() === normalized)) return true
  const allowed = await prisma.inboundEmailAllowedSender.findMany({ where: { workspaceId }, select: { pattern: true } })
  return allowed.some((row) => matchesAllowPattern(row.pattern, normalized))
}

export const listAllowedSenders = cache(async (workspaceId: string) => prisma.inboundEmailAllowedSender.findMany({
  where: { workspaceId },
  orderBy: { createdAt: "desc" },
}))

export async function addAllowedSender(input: { workspaceId: string; pattern: string; createdById: string }) {
  const pattern = input.pattern.trim().toLowerCase()
  if (!pattern) throw new Error("pattern_required")
  const isDomainPattern = /^@[^\s@]+\.[^\s@]+$/.test(pattern)
  const isEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pattern)
  if (!isDomainPattern && !isEmailPattern) throw new Error("pattern_invalid")
  const context = await getRequestAuditContext()
  const [created] = await prisma.$transaction([
    prisma.inboundEmailAllowedSender.upsert({
      where: { workspaceId_pattern: { workspaceId: input.workspaceId, pattern } },
      create: { workspaceId: input.workspaceId, pattern, createdById: input.createdById },
      update: {},
    }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, actorId: input.createdById, type: "inbound_email_allowed_sender.added", detail: { pattern } }, context) }),
  ])
  return created
}

export async function removeAllowedSender(input: { workspaceId: string; id: string; actorId: string }) {
  const row = await prisma.inboundEmailAllowedSender.findFirst({ where: { id: input.id, workspaceId: input.workspaceId } })
  if (!row) throw new Error("allowed_sender_not_found")
  const context = await getRequestAuditContext()
  await prisma.$transaction([
    prisma.inboundEmailAllowedSender.delete({ where: { id: row.id } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, actorId: input.actorId, type: "inbound_email_allowed_sender.removed", detail: { pattern: row.pattern } }, context) }),
  ])
}

async function ensureEmailIntakeFile(workspaceId: string) {
  const existing = await prisma.documentFile.findFirst({ where: { workspaceId, name: "Email intake" } })
  if (existing) return existing
  const owner = await prisma.workspaceMember.findFirst({ where: { workspaceId, role: "owner" }, orderBy: { createdAt: "asc" }, select: { userId: true } })
  if (!owner) throw new Error("workspace_has_no_owner")
  return createFile({ workspaceId, userId: owner.userId, name: "Email intake", templates: DEFAULT_DOCUMENT_TEMPLATES })
}

function inferMimeType(filename: string): string | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? ""
  return EXTENSION_MIME_TYPES[extension] ?? null
}

export type InboundEmailAttachment = { filename: string; contentType: string; base64Content: string }

export type InboundEmailInput = {
  workspaceId: string
  from: string
  attachments: InboundEmailAttachment[]
  subject?: string | null
  textBody?: string | null
  htmlBody?: string | null
}

const BODY_PREVIEW_MAX = 500

/** One inbound email, already authenticated by the route (signature + token resolved to a
 * workspace) — this is the business logic: is the sender allowed, and if so, ingest every
 * attachment through the exact same pipeline every other intake channel uses. Attachments land in
 * a dedicated "Email intake" file (auto-created, mirroring ensureDictationFile's pattern) rather
 * than a file the sender has no way to specify.
 *
 * A6.1/A6.2 additions: every processed mail leaves an InboundEmailIntake row (including one that
 * produced zero documents, which previously vanished without a trace — that case also emits an
 * audit event so a person can find out); a mail with no ingestable attachment whose BODY looks
 * like a billing document gets the body rendered to a small PDF and ingested like any file. */
export async function processInboundEmail(input: InboundEmailInput): Promise<{ accepted: number; rejected: number }> {
  const bodyText = (input.textBody?.trim() || (input.htmlBody ? htmlToText(input.htmlBody) : "")).trim()
  const bodyPreview = bodyText ? bodyText.slice(0, BODY_PREVIEW_MAX) : null
  const recordIntake = (outcome: string, counts: { accepted: number; rejected: number }) =>
    prisma.inboundEmailIntake.create({
      data: {
        workspaceId: input.workspaceId, fromAddress: input.from.trim().toLowerCase(),
        subject: input.subject?.trim() || null, bodyPreview,
        attachmentCount: input.attachments.length, acceptedCount: counts.accepted, rejectedCount: counts.rejected,
        outcome,
      },
    }).catch((error) => { console.error("[inbound-email] failed to record intake:", error instanceof Error ? error.message : error); return null })

  if (!(await isSenderAllowed(input.workspaceId, input.from))) {
    await recordIntake("sender_rejected", { accepted: 0, rejected: input.attachments.length })
    throw new Error("sender_not_allowed")
  }

  const file = await ensureEmailIntakeFile(input.workspaceId)
  const templates = await getFileTemplates(input.workspaceId, file.id)
  const template = templates.find((candidate) => candidate.code === "generic") ?? templates[0]
  if (!template) throw new Error("no_template_available")

  let accepted = 0
  let rejected = 0
  for (const attachment of input.attachments) {
    const buffer = Buffer.from(attachment.base64Content, "base64")
    const mimeType = inferMimeType(attachment.filename)
    if (!mimeType || !buffer.length || !isSupportedDocumentBuffer(buffer, mimeType)) { rejected++; continue }
    const outcome = await createIngestionItem({ workspaceId: input.workspaceId, fileId: file.id, templateId: template.id, source: "email", filename: attachment.filename, mimeType, buffer })
    if (outcome.outcome === "accepted" || outcome.outcome === "duplicate") accepted++
    else rejected++
  }

  // A6.2: nothing ingestable attached, but the body itself reads like a billing document — render
  // it to a PDF and send it down the same pipeline. Never lets a render problem fail the mail.
  if (accepted === 0 && bodyText && looksInvoiceLike(input.subject, bodyText)) {
    try {
      const buffer = renderEmailBodyPdf({ subject: input.subject ?? null, from: input.from, bodyText })
      const filename = `${(input.subject?.trim() || "email-body").replace(/[^\w.-]+/g, "-").slice(0, 60)}.pdf`
      const outcome = await createIngestionItem({ workspaceId: input.workspaceId, fileId: file.id, templateId: template.id, source: "email", filename, mimeType: "application/pdf", buffer })
      if (outcome.outcome === "accepted" || outcome.outcome === "duplicate") accepted++
    } catch (error) {
      console.error("[inbound-email] body-to-pdf ingestion failed:", error instanceof Error ? error.message : error)
    }
  }

  await recordIntake(accepted > 0 ? "ingested" : "no_document", { accepted, rejected })
  if (accepted === 0) {
    // A6.1: the silent-zero case someone should hear about — auditable and countable, keyed to
    // the workspace (there is no document to hang a ReviewTask on). recordSystemAudit never
    // throws and needs no request context.
    await recordSystemAudit({
      workspaceId: input.workspaceId, type: "inbound_email.no_document",
      detail: { from: input.from, subject: input.subject ?? null, attachmentCount: input.attachments.length, rejected, bodyPreview },
    })
    await track("inbound_email_no_document", { attachmentCount: input.attachments.length, rejected }, { workspaceId: input.workspaceId })
  }
  return { accepted, rejected }
}
