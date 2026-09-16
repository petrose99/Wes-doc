// Deliberately NOT a "use server" module, matching models/reminders.ts: cross-workspace by
// nature, only ever invoked from the internal job-drain route or a direct kick, never from a
// per-request caller with a workspaceId to trust.
import React from "react"
import { toWorkflowStageInputs } from "@/lib/approvals/engine"
import { computeApprovalEligibility, stageHasEligibleApprover } from "@/lib/approvals/row-eligibility"
import { listOpenGatesForDocuments } from "@/lib/gates/list"
import { isPaymentConfirmationRequired } from "@/lib/doc-types"
import { isEmailConfigured, resend } from "@/lib/email"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { unscoped } from "@/lib/workspace-scope"
import { ApprovalNoticeEmail, type ApprovalNoticeRow } from "@/components/emails/approval-notice-email"
import { render } from "@react-email/render"

const NOTICE_FLOOR_MS = 60 * 60 * 1000
const NUDGE_AFTER_MS = 48 * 60 * 60 * 1000
const NUDGE_REPEAT_MS = 72 * 60 * 60 * 1000
const NUDGE_CAP = 2

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

type Candidate = {
  taskId: string
  documentId: string
  workspaceId: string
  workspaceName: string
  baseCurrency: string
  timezone: string
  createdById: string | null
  currentStageIndex: number
  stageReachedAt: Date
  approverIds: string[]
  supplier: string | null
  invoiceNumber: string | null
  amount: number | null
  currencyCode: string | null
  documentIdForLink: string
}

/** Eligibility + deciders for every open, workflow-attached, in-flight invoice Approval across
 * every workspace — the sender's own candidate loader, parallel to models/approvals.ts's
 * loadSubmittedApprovals but workspace-agnostic (this sweeps ALL workspaces on a tick) and
 * carrying the extra fields (createdById, approverIds, stageReachedAt) the sender needs that the
 * Approvals-page row type doesn't. */
async function loadCandidates(): Promise<Candidate[]> {
  const rows = await unscoped(() => prisma.reviewTask.findMany({
    where: { status: "in_review", workflowId: { not: null }, currentStageIndex: { not: null }, stageReachedAt: { not: null } },
    select: {
      id: true, workspaceId: true, documentId: true, createdById: true, currentStageIndex: true, stageReachedAt: true,
      workflow: { select: { stages: { orderBy: { stageIndex: "asc" } } } },
      document: { select: { reviewedData: true, cancelledAt: true, docType: true, paymentStatus: true, template: { select: { code: true } } } },
      workspace: { select: { name: true, baseCurrency: true, timezone: true } },
    },
  }))
  const live = rows.filter((row) => row.workflow && row.currentStageIndex !== null && row.stageReachedAt && !row.document.cancelledAt && row.document.template?.code === "invoice")
  if (!live.length) return []

  const byWorkspace = new Map<string, typeof live>()
  for (const row of live) {
    const list = byWorkspace.get(row.workspaceId) ?? []
    list.push(row)
    byWorkspace.set(row.workspaceId, list)
  }

  const candidates: Candidate[] = []
  for (const [workspaceId, workspaceRows] of byWorkspace) {
    const documentIds = workspaceRows.map((row) => row.documentId)
    const paymentCandidateIds = workspaceRows.filter((row) => !row.document.paymentStatus && isPaymentConfirmationRequired(row.document)).map((row) => row.documentId)
    const [openGatesByDocument, openEscalations, members, pushed] = await Promise.all([
      listOpenGatesForDocuments(workspaceId, documentIds),
      prisma.documentCheckResult.findMany({
        where: { workspaceId, documentId: { in: documentIds }, status: "escalated", OR: [{ escalationStatus: null }, { escalationStatus: { in: ["open", "in_review"] } }] },
        select: { documentId: true },
      }),
      prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true, role: true } }),
      paymentCandidateIds.length
        ? prisma.integrationPush.findMany({ where: { workspaceId, documentId: { in: paymentCandidateIds }, status: { in: ["pending", "succeeded"] } }, select: { documentId: true } })
        : Promise.resolve([] as { documentId: string }[]),
    ])
    const pushedDocIds = new Set(pushed.map((row) => row.documentId))
    const openExceptionDocIds = new Set(openEscalations.map((row) => row.documentId))
    const memberIds = new Set(members.map((member) => member.userId))
    const hasOwnerMember = members.some((member) => member.role === "owner")

    for (const row of workspaceRows) {
      const stages = toWorkflowStageInputs(row.workflow!.stages)
      const currentStage = stages.find((stage) => stage.stageIndex === row.currentStageIndex)
      if (!currentStage) continue
      const gates = openGatesByDocument.get(row.documentId) ?? []
      const approverStillValid = stageHasEligibleApprover(currentStage, memberIds, hasOwnerMember)
      const eligibility = computeApprovalEligibility({
        hasOpenException: openExceptionDocIds.has(row.documentId),
        hasBlockedHardGate: gates.some((gate) => gate.severity === "hard"),
        approverStillValid,
        paymentUnconfirmed: paymentCandidateIds.includes(row.documentId) && !pushedDocIds.has(row.documentId),
      })
      if (eligibility.status !== "ready") continue

      const values = (row.document.reviewedData ?? {}) as Record<string, unknown>
      const approverIds = currentStage.approverIds ?? []
      candidates.push({
        taskId: row.id,
        documentId: row.documentId,
        workspaceId: row.workspaceId,
        workspaceName: row.workspace.name,
        baseCurrency: row.workspace.baseCurrency,
        timezone: row.workspace.timezone,
        createdById: row.createdById,
        currentStageIndex: row.currentStageIndex!,
        stageReachedAt: row.stageReachedAt!,
        approverIds: approverIds.length ? approverIds : [], // resolved to owners below when empty
        supplier: asString(values.vendor) ?? asString(values.merchant),
        invoiceNumber: asString(values.invoice_number),
        amount: asNumber(values.total) ?? asNumber(values.amount),
        currencyCode: asString(values.currency_code),
        documentIdForLink: row.documentId,
      })
    }
  }
  return candidates
}

type Deciders = { deciders: string[] }

/** Resolves each candidate's actual deciders: the stage's named approvers when any are set,
 * otherwise every current workspace owner — never every member (spec §1.2). */
async function resolveDeciders(candidates: Candidate[]): Promise<Map<string, string[]>> {
  const byWorkspace = new Map<string, Set<string>>()
  for (const candidate of candidates) {
    if (!candidate.approverIds.length) byWorkspace.set(candidate.workspaceId, byWorkspace.get(candidate.workspaceId) ?? new Set())
  }
  const ownersByWorkspace = new Map<string, string[]>()
  await Promise.all([...byWorkspace.keys()].map(async (workspaceId) => {
    const owners = await prisma.workspaceMember.findMany({ where: { workspaceId, role: "owner" }, select: { userId: true } })
    ownersByWorkspace.set(workspaceId, owners.map((owner) => owner.userId))
  }))
  const result = new Map<string, string[]>()
  for (const candidate of candidates) {
    result.set(candidate.taskId, candidate.approverIds.length ? candidate.approverIds : (ownersByWorkspace.get(candidate.workspaceId) ?? []))
  }
  return result
}

type PersonBucket = { reached: Candidate[]; nudge: Candidate[] }

function link(workspaceId: string, documentId: string): string {
  return `${config.app.baseURL}/workspaces/${workspaceId}/approvals/invoices?doc=${documentId}&via=notice`
}
function multiLink(workspaceId: string): string {
  return `${config.app.baseURL}/workspaces/${workspaceId}/approvals/invoices?via=notice`
}

function subjectAndHeading(rows: { kind: "reached" | "nudge" }[], workspaceName: string): { subject: string; heading: string } {
  const reached = rows.filter((row) => row.kind === "reached")
  const nudges = rows.filter((row) => row.kind === "nudge")
  if (reached.length) {
    if (reached.length === 1) return { subject: `Invoice needs your approval — ${workspaceName}`, heading: "An invoice needs your approval" }
    return { subject: `${reached.length} invoices need your approval — ${workspaceName}`, heading: `${reached.length} invoices need your approval` }
  }
  if (nudges.length === 1) return { subject: `Still waiting: 1 invoice — ${workspaceName}`, heading: "Still waiting on you: 1 invoice" }
  return { subject: `Still waiting: ${nudges.length} invoices — ${workspaceName}`, heading: `Still waiting on you: ${nudges.length} invoices` }
}

async function sendOne(opts: {
  to: string; workspaceId: string; workspaceName: string; rows: ApprovalNoticeRow[]; stopToken: string
}): Promise<boolean> {
  const { subject, heading } = subjectAndHeading(opts.rows, opts.workspaceName)
  const stopUrl = `${config.app.baseURL}/notices/stop?t=${opts.stopToken}`
  const openUrl = opts.rows.length === 1 ? opts.rows[0].url : multiLink(opts.workspaceId)
  const props = { heading, rows: opts.rows, workspaceName: opts.workspaceName, openUrl, stopUrl, footerVariant: "approver" as const }
  const html = React.createElement(ApprovalNoticeEmail, props)
  try {
    await resend.emails.send({
      from: config.email.from, to: opts.to, subject, react: html,
      text: await render(html, { plainText: true }),
      headers: { "List-Unsubscribe": `<${stopUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    })
    return true
  } catch (error) {
    console.warn(`[approval-notices] send failed for ${opts.to}:`, error instanceof Error ? error.message : error)
    return false
  }
}

/** The Approval-notice sender (#271): coalesces every "reached" and "still waiting" invoice into
 * one mail per (person, workspace), per drain hit. See spec.md §1 for the full policy; this is
 * its implementation. Never throws — a candidate's or a person's failure is logged and skipped,
 * the rest of the sweep continues. */
export async function sendApprovalNotices(now: Date = new Date()): Promise<{ sent: number } | { skipped: "email-not-configured" }> {
  if (!isEmailConfigured()) return { skipped: "email-not-configured" }

  const candidates = await loadCandidates()
  if (!candidates.length) return { sent: 0 }
  const decidersByTask = await resolveDeciders(candidates)

  const taskIds = candidates.map((candidate) => candidate.taskId)
  const allDeciderIds = [...new Set([...decidersByTask.values()].flat())]
  const [existingNotices, deciderUsers] = await Promise.all([
    unscoped(() => prisma.approvalNotice.findMany({ where: { reviewTaskId: { in: taskIds }, userId: { in: allDeciderIds } }, select: { reviewTaskId: true, userId: true, kind: true, sentAt: true, stageReachedAt: true } })),
    unscoped(() => prisma.user.findMany({ where: { id: { in: allDeciderIds } }, select: { id: true, email: true, emailVerified: true, approvalNoticeEmails: true } })),
  ])
  const usersById = new Map(deciderUsers.map((user) => [user.id, user]))

  // Per (workspace, decider) membership check — resolveDeciders already scoped owners to current
  // members, but a named approver in a stage can have left the workspace since the stage was set.
  const workspaceIds = [...new Set(candidates.map((candidate) => candidate.workspaceId))]
  const memberships = await prisma.workspaceMember.findMany({ where: { workspaceId: { in: workspaceIds }, userId: { in: allDeciderIds } }, select: { workspaceId: true, userId: true, noticeLastSentAt: true } })
  const membershipByKey = new Map(memberships.map((member) => [`${member.workspaceId}:${member.userId}`, member]))

  const buckets = new Map<string, PersonBucket>() // key = `${workspaceId}:${userId}`
  for (const candidate of candidates) {
    const deciders = decidersByTask.get(candidate.taskId) ?? []
    for (const userId of deciders) {
      if (userId === candidate.createdById) continue
      const membership = membershipByKey.get(`${candidate.workspaceId}:${userId}`)
      if (!membership) continue // no longer a member
      const user = usersById.get(userId)
      if (!user || !user.approvalNoticeEmails || !user.emailVerified) continue

      const key = `${candidate.workspaceId}:${userId}`
      const notices = existingNotices.filter((notice) => notice.reviewTaskId === candidate.taskId && notice.userId === userId && notice.stageReachedAt.getTime() === candidate.stageReachedAt.getTime())
      const reached = notices.find((notice) => notice.kind === "reached")
      const bucket = buckets.get(key) ?? { reached: [], nudge: [] }
      if (!reached) {
        bucket.reached.push(candidate)
      } else {
        const nudges = notices.filter((notice) => notice.kind === "nudge")
        const dueForNudge = now.getTime() - reached.sentAt.getTime() >= NUDGE_AFTER_MS
        const lastNudge = nudges.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0]
        const repeatOk = !lastNudge || now.getTime() - lastNudge.sentAt.getTime() >= NUDGE_REPEAT_MS
        if (dueForNudge && repeatOk && nudges.length < NUDGE_CAP) bucket.nudge.push(candidate)
      }
      buckets.set(key, bucket)
    }
  }

  let sent = 0
  for (const [key, bucket] of buckets) {
    if (!bucket.reached.length && !bucket.nudge.length) continue
    const [workspaceId, userId] = key.split(":")
    const membership = membershipByKey.get(key)!
    if (membership.noticeLastSentAt && now.getTime() - membership.noticeLastSentAt.getTime() < NOTICE_FLOOR_MS) continue
    const user = usersById.get(userId)!
    const workspaceName = (bucket.reached[0] ?? bucket.nudge[0]).workspaceName
    const daysWaiting = (candidate: Candidate) => Math.floor((now.getTime() - candidate.stageReachedAt.getTime()) / (24 * 60 * 60 * 1000))
    const rows: ApprovalNoticeRow[] = [
      ...bucket.reached.map((candidate) => ({ kind: "reached" as const, supplier: candidate.supplier, invoiceNumber: candidate.invoiceNumber, amount: candidate.amount, currency: candidate.currencyCode ?? candidate.baseCurrency, url: link(candidate.workspaceId, candidate.documentIdForLink), waitingDays: daysWaiting(candidate) })),
      ...bucket.nudge.map((candidate) => ({ kind: "nudge" as const, supplier: candidate.supplier, invoiceNumber: candidate.invoiceNumber, amount: candidate.amount, currency: candidate.currencyCode ?? candidate.baseCurrency, url: link(candidate.workspaceId, candidate.documentIdForLink), waitingDays: daysWaiting(candidate) })),
    ]
    const { signStopToken } = await import("@/lib/notices/stop-token")
    const stopToken = signStopToken(userId, workspaceId, now)
    const ok = await sendOne({ to: user.email, workspaceId, workspaceName, rows, stopToken })
    if (!ok) continue

    const inserts = [
      ...bucket.reached.map((candidate) => ({ reviewTaskId: candidate.taskId, userId, workspaceId, kind: "reached", sentAt: now, stageIndex: candidate.currentStageIndex, stageReachedAt: candidate.stageReachedAt })),
      ...bucket.nudge.map((candidate) => ({ reviewTaskId: candidate.taskId, userId, workspaceId, kind: "nudge", sentAt: now, stageIndex: candidate.currentStageIndex, stageReachedAt: candidate.stageReachedAt })),
    ]
    await unscoped(() => prisma.$transaction([
      ...inserts.map((data) => prisma.approvalNotice.create({ data })),
      prisma.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { noticeLastSentAt: now } }),
    ]))
    sent++
  }
  return { sent }
}

/** #271 spec §1.9: a reply to one human decision, not coalesced with anything else — sent
 * directly from models/review-tasks.ts's sendReviewTaskBackForReview, obeys no floor and never
 * stamps noticeLastSentAt (a send-back must not delay the starter's next reached notice). */
export async function sendSentBackNotice(input: {
  workspaceId: string; workspaceName: string; taskId: string; documentId: string; createdById: string | null
  actorId: string; actorName: string; reason: string; supplier: string | null; invoiceNumber: string | null; amount: number | null; currency: string | null
}): Promise<void> {
  if (!isEmailConfigured()) return
  if (!input.createdById || input.createdById === input.actorId) return
  const [membership, user] = await Promise.all([
    prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.createdById } } }),
    prisma.user.findUnique({ where: { id: input.createdById }, select: { email: true, emailVerified: true, approvalNoticeEmails: true } }),
  ])
  if (!membership || !user || !user.approvalNoticeEmails || !user.emailVerified) return

  const row: ApprovalNoticeRow = { kind: "sent_back", supplier: input.supplier, invoiceNumber: input.invoiceNumber, amount: input.amount, currency: input.currency ?? "USD", url: link(input.workspaceId, input.documentId), waitingDays: 0 }
  const { signStopToken } = await import("@/lib/notices/stop-token")
  const stopToken = signStopToken(input.createdById, input.workspaceId)
  const stopUrl = `${config.app.baseURL}/notices/stop?t=${stopToken}`
  const heading = `${input.actorName} sent ${input.supplier ?? "an invoice"} back for review`
  const props = { heading, rows: [row], workspaceName: input.workspaceName, openUrl: row.url, stopUrl, footerVariant: "starter" as const, reason: input.reason }
  const html = React.createElement(ApprovalNoticeEmail, props)
  try {
    await resend.emails.send({
      from: config.email.from, to: user.email, subject: `Sent back for review: ${input.supplier ?? "an invoice"} — ${input.workspaceName}`, react: html,
      text: await render(html, { plainText: true }),
      headers: { "List-Unsubscribe": `<${stopUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    })
  } catch (error) {
    console.warn(`[approval-notices] sent-back email failed for ${user.email}:`, error instanceof Error ? error.message : error)
  }
}

/** Convenience for `sendReviewTaskBackForReview`: loads the facts `sendSentBackNotice` needs
 * (workspace name, actor name, the document's reviewed supplier/number/amount) so the review-task
 * model only hands over ids. Never throws — a failed notice must not fail the send-back. */
export async function notifySentBack(input: { workspaceId: string; documentId: string; taskId: string; createdById: string | null; actorId: string; reason: string }): Promise<void> {
  try {
    if (!isEmailConfigured()) return
    if (!input.createdById || input.createdById === input.actorId) return
    const [workspace, actor, document] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: input.actorId }, select: { name: true, email: true } }),
      prisma.document.findUnique({ where: { id: input.documentId }, select: { reviewedData: true } }),
    ])
    if (!workspace) return
    const values = (document?.reviewedData ?? {}) as Record<string, unknown>
    await sendSentBackNotice({
      workspaceId: input.workspaceId, workspaceName: workspace.name, taskId: input.taskId, documentId: input.documentId,
      createdById: input.createdById, actorId: input.actorId, actorName: actor?.name?.trim() || actor?.email || "Someone", reason: input.reason,
      supplier: asString(values.vendor) ?? asString(values.merchant), invoiceNumber: asString(values.invoice_number),
      amount: asNumber(values.total) ?? asNumber(values.amount), currency: asString(values.currency_code),
    })
  } catch (error) {
    console.warn("[approval-notices] sent-back notice failed:", error instanceof Error ? error.message : error)
  }
}
