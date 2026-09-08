// Deliberately NOT a "use server" module, matching every other models/*.ts helper here: this
// trusts the token/sender it is handed. app/api/inbound-email/route.ts does the signature check
// and is the only caller.
import { track } from "@/lib/analytics"
import { auditEventData, getRequestAuditContext, recordSystemAudit } from "@/lib/audit"
import { classifyIntent, extractOriginalSender, shouldSkipAttachment, type EmailIntent } from "@/lib/inbound/filter"
import { fetchPortalPdfs } from "@/lib/inbound/portal-links"
import { htmlToText, looksInvoiceLike, renderEmailBodyPdf } from "@/lib/inbound/html-to-pdf"
import { createIngestionItem } from "@/lib/ingestion"
import { expandZipBuffer } from "@/lib/zip-ingestion"
import { isSupportedDocumentBuffer } from "@/models/documents"
import { EXTENSION_MIME_TYPES } from "@/lib/zip-ingestion"
import { prisma } from "@/lib/db"
import { ensurePipelineFile, getFileTemplates } from "@/models/files"
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

/** An emailed document belongs in the same container the Extraction page's own upload button
 * targets, not a channel-specific file of its own. The pipeline list is workspace-wide either way
 * (models/documents.ts::listWorkspaceDocuments is not filtered by fileId), so this is not about
 * whether the document is *visible* there — it's about which worksheets it can be extracted
 * against. The pipeline container carries the full finance set (invoice, receipt, bank statement,
 * purchase order, remittance advice, supplier statement); a file seeded with only
 * DEFAULT_DOCUMENT_TEMPLATES cannot offer those, which is what used to force every emailed
 * invoice through the "generic" worksheet.
 *
 * ensurePipelineFile needs a userId for the create path, and email has no acting user, so the
 * workspace's earliest owner stands in — the same stand-in the old per-channel file used. */
async function ensureEmailTargetFile(workspaceId: string) {
  const owner = await prisma.workspaceMember.findFirst({ where: { workspaceId, role: "owner" }, orderBy: { createdAt: "asc" }, select: { userId: true } })
  if (!owner) throw new Error("workspace_has_no_owner")
  return ensurePipelineFile(workspaceId, owner.userId)
}

/** The *provisional* worksheet for a mail, from its subject line. Provisional because a document
 * must have a template the moment it is created, long before anything has read it — so this is a
 * guess from the one signal available at that point. The subject is a weak signal ("Invoice
 * attached" on a vehicle order), so it is deliberately not the last word: the document is marked
 * worksheetAutoAssigned, and lib/document-processing.ts re-points it once the classifier has read
 * the actual content. This only has to be a decent starting point.
 *
 * Only the unambiguous intents map: "statement" deliberately does not, because classifyIntent's
 * keywords for it span both bank and supplier statements. */
const INTENT_TEMPLATE_CODE: Partial<Record<EmailIntent, string>> = {
  invoice: "invoice",
  receipt: "receipt",
  remittance: "remittance_advice",
}

function inferMimeType(filename: string): string | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? ""
  return EXTENSION_MIME_TYPES[extension] ?? null
}

export type InboundEmailAttachment = {
  filename: string
  contentType: string
  base64Content: string
  /** A6.4: raw MIME headers so we can distinguish an inline signature image from a real
   * attachment. Optional — a provider that doesn't surface these still ingests every attachment. */
  contentDisposition?: string | null
  contentId?: string | null
}

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
 * the workspace's pipeline container — the same one the Extraction page uploads into — so an
 * emailed document is indistinguishable from a dragged-in one once it lands, and is extracted
 * against the worksheet its classified intent calls for. See ensureEmailTargetFile.
 *
 * A6.1/A6.2 additions: every processed mail leaves an InboundEmailIntake row (including one that
 * produced zero documents, which previously vanished without a trace — that case also emits an
 * audit event so a person can find out); a mail with no ingestable attachment whose BODY looks
 * like a billing document gets the body rendered to a small PDF and ingested like any file. */
export async function processInboundEmail(input: InboundEmailInput): Promise<{ accepted: number; rejected: number; duplicated: number }> {
  const bodyText = (input.textBody?.trim() || (input.htmlBody ? htmlToText(input.htmlBody) : "")).trim()
  const bodyPreview = bodyText ? bodyText.slice(0, BODY_PREVIEW_MAX) : null
  // A6.5: if this is a forwarded email, prefer the original sender for allowlist checking and
  // supplier attribution. The bookkeeper forwarding it isn't the vendor.
  const originalSender = extractOriginalSender(bodyText)
  const effectiveFrom = originalSender ?? input.from
  const recordIntake = (outcome: string, counts: { accepted: number; rejected: number }) =>
    prisma.inboundEmailIntake.create({
      data: {
        workspaceId: input.workspaceId, fromAddress: effectiveFrom.trim().toLowerCase(),
        subject: input.subject?.trim() || null, bodyPreview,
        attachmentCount: input.attachments.length, acceptedCount: counts.accepted, rejectedCount: counts.rejected,
        outcome,
      },
    }).catch((error) => { console.error("[inbound-email] failed to record intake:", error instanceof Error ? error.message : error); return null })

  // Allowlist check runs against the ORIGINAL sender for a forwarded chain, so a bookkeeper's
  // forward of a stranger's invoice is still refused.
  if (!(await isSenderAllowed(input.workspaceId, effectiveFrom))) {
    await recordIntake("sender_rejected", { accepted: 0, rejected: input.attachments.length })
    throw new Error("sender_not_allowed")
  }

  // A6.3: classify the mail up front. A "noise" mail skips the OCR/LLM cost entirely (it
  // still gets an intake row so the workspace can see what happened). Classified before the
  // worksheet is chosen, since it's what decides which one.
  const intent = classifyIntent(input.subject, bodyText)

  const file = await ensureEmailTargetFile(input.workspaceId)
  const templates = await getFileTemplates(input.workspaceId, file.id)
  const generic = templates.find((candidate) => candidate.code === "generic")
  const intended = INTENT_TEMPLATE_CODE[intent]
  // Falls back rather than failing when the mapped worksheet is missing: a workspace whose
  // pipeline container predates the finance top-up in ensurePipelineFile may not have every
  // code yet, and extracting as generic beats refusing the mail outright.
  const template = (intended ? templates.find((candidate) => candidate.code === intended) : undefined) ?? generic ?? templates[0]
  if (!template) throw new Error("no_template_available")

  let accepted = 0
  let rejected = 0
  // Counted apart from `accepted`, which it used to be folded into. createIngestionItem returns
  // "duplicate" when these exact bytes already produced a document in this file, and lumping that
  // in made a re-sent attachment indistinguishable from a fresh one: the intake row read
  // "ingested", the sender got no bounce, and nothing new ever appeared in the pipeline. That is
  // the single most confusing thing this channel can do, because re-sending is the natural thing
  // to try when a mail seems not to have arrived.
  let duplicated = 0
  const attachmentsToProcess = intent === "noise"
    ? []
    : input.attachments.filter((attachment) => !shouldSkipAttachment({
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: Math.floor((attachment.base64Content.length * 3) / 4),
        contentDisposition: attachment.contentDisposition ?? null,
        contentId: attachment.contentId ?? null,
      }))
  for (const attachment of attachmentsToProcess) {
    const buffer = Buffer.from(attachment.base64Content, "base64")
    // A6.6: unpack zip attachments and ingest every supported entry.
    if (attachment.filename.toLowerCase().endsWith(".zip")) {
      try {
        const expansion = expandZipBuffer(buffer)
        for (const entry of expansion.entries) {
          const outcome = await createIngestionItem({ workspaceId: input.workspaceId, fileId: file.id, templateId: template.id, source: "email", worksheetAutoAssigned: true, filename: entry.filename, mimeType: entry.mimeType, buffer: entry.buffer })
          if (outcome.outcome === "accepted") accepted++
          else if (outcome.outcome === "duplicate") duplicated++
          else rejected++
        }
        rejected += expansion.skipped.length
        continue
      } catch (error) {
        console.error("[inbound-email] zip expand failed:", error instanceof Error ? error.message : error)
        rejected++
        continue
      }
    }
    const mimeType = inferMimeType(attachment.filename)
    if (!mimeType || !buffer.length || !isSupportedDocumentBuffer(buffer, mimeType)) { rejected++; continue }
    const outcome = await createIngestionItem({ workspaceId: input.workspaceId, fileId: file.id, templateId: template.id, source: "email", worksheetAutoAssigned: true, filename: attachment.filename, mimeType, buffer })
    if (outcome.outcome === "accepted") accepted++
          else if (outcome.outcome === "duplicate") duplicated++
    else rejected++
  }

  // A6.8: no attachment worked, but the body carries a direct https .pdf link — fetch it
  // through the SSRF-safe channel and ingest. Only unauthenticated direct-PDF portals; a
  // supplier that gates behind a login is out of scope for this pass.
  if (accepted === 0 && intent !== "noise") {
    const portals = await fetchPortalPdfs(bodyText)
    for (const portal of portals) {
      const outcome = await createIngestionItem({ workspaceId: input.workspaceId, fileId: file.id, templateId: template.id, source: "email", worksheetAutoAssigned: true, filename: portal.filename, mimeType: "application/pdf", buffer: portal.buffer })
      if (outcome.outcome === "accepted") accepted++
          else if (outcome.outcome === "duplicate") duplicated++
      else rejected++
    }
  }

  // A6.2: nothing ingestable attached, but the body itself reads like a billing document — render
  // it to a PDF and send it down the same pipeline. Never lets a render problem fail the mail.
  if (accepted === 0 && bodyText && looksInvoiceLike(input.subject, bodyText)) {
    try {
      const buffer = renderEmailBodyPdf({ subject: input.subject ?? null, from: input.from, bodyText })
      const filename = `${(input.subject?.trim() || "email-body").replace(/[^\w.-]+/g, "-").slice(0, 60)}.pdf`
      const outcome = await createIngestionItem({ workspaceId: input.workspaceId, fileId: file.id, templateId: template.id, source: "email", worksheetAutoAssigned: true, filename, mimeType: "application/pdf", buffer })
      if (outcome.outcome === "accepted") accepted++
          else if (outcome.outcome === "duplicate") duplicated++
    } catch (error) {
      console.error("[inbound-email] body-to-pdf ingestion failed:", error instanceof Error ? error.message : error)
    }
  }

  // "duplicate" ranks between the two: nothing new arrived, but nothing went wrong either, so it
  // is neither an ingestion to celebrate nor a silent-zero to raise an audit event about.
  const outcome = accepted > 0 ? "ingested" : duplicated > 0 ? "duplicate" : "no_document"
  await recordIntake(outcome, { accepted, rejected })
  if (accepted === 0 && duplicated === 0) {
    // A6.1: the silent-zero case someone should hear about — auditable and countable, keyed to
    // the workspace (there is no document to hang a ReviewTask on). recordSystemAudit never
    // throws and needs no request context.
    await recordSystemAudit({
      workspaceId: input.workspaceId, type: "inbound_email.no_document",
      detail: { from: input.from, subject: input.subject ?? null, attachmentCount: input.attachments.length, rejected, bodyPreview },
    })
    await track("inbound_email_no_document", { attachmentCount: input.attachments.length, rejected }, { workspaceId: input.workspaceId })
  }
  // `duplicated` rides along so the route's JSON — and anything reading a provider's delivery log
  // — can tell "we already had this" from "nothing was taken". Still a 200 either way: a
  // duplicate is a successful outcome for the sender and must not bounce.
  return { accepted, rejected, duplicated }
}
