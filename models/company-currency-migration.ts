// One-off move of every company onto a supported Company currency (ADR 0013, #457 spec §2, §9.7).
// Run by scripts/migrate-company-currency.ts; cross-workspace by nature, like models/reminders.ts.
import { adminPaths } from "@/lib/admin/paths"
import { recordSystemAudit } from "@/lib/audit"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { sendReminderEmail } from "@/lib/email"
import { applyFxToDocument } from "@/lib/fx/apply-to-document"
import { isAllowedPair } from "@/lib/geo/company-currency"
import { unscoped } from "@/lib/workspace-scope"
import { getCurrencyLock, recordCurrencyLock, unposted, type CurrencyLockCause } from "@/models/company-currency"

type Target = { country: string; baseCurrency: string }
type Lock = { cause: CurrencyLockCause; provider: string | null; at: Date }
export type SupportListEntry = { workspaceId: string; name: string; country: string; baseCurrency: string } & Lock
export type MigrationResult = {
  migrated: { workspaceId: string; name: string; from: string; to: string; count: number | null }[]
  supportList: SupportListEntry[]
  noticesSent: number
}

/** Where an unsupported pair goes: Lesotho keeps its country and gets LSL; South Africa, and any
 * other country (the Personal fallback, #446 decision 1), becomes South Africa/ZAR. */
export function migrationTarget(country: string, baseCurrency: string): Target | null {
  if (isAllowedPair(country, baseCurrency)) return null
  return country === "LS" ? { country: "LS", baseCurrency: "LSL" } : { country: "ZA", baseCurrency: "ZAR" }
}

/** The lock a company would have had if the columns had existed: its earliest succeeded push or
 * Payment batch, whichever came first. */
async function lockEvidence(workspaceId: string): Promise<Lock | null> {
  const [push, run] = await Promise.all([
    prisma.integrationPush.findFirst({
      where: { workspaceId, status: "succeeded" },
      orderBy: { completedAt: "asc" },
      select: { provider: true, completedAt: true, createdAt: true, document: { select: { docType: true } } },
    }),
    prisma.paymentRun.findFirst({ where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ])
  const pushAt = push ? (push.completedAt ?? push.createdAt) : null
  if (push && pushAt && (!run || pushAt <= run.createdAt)) {
    return { cause: push.document.docType === "bank_statement" ? "bank_statement" : "bill", provider: push.provider, at: pushAt }
  }
  return run ? { cause: "payment_batch", provider: null, at: run.createdAt } : null
}

/** Moves one unlocked company under its row lock; null when a push locked it meanwhile. The audit
 * row lands in the same transaction as the change and carries `noticePending` when an approval
 * limit exists, so a crash before the email is recovered by the next run's notice pass. */
async function migrateOne(workspaceId: string, from: string, target: Target): Promise<number | null> {
  const documentIds = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`
    if ((await getCurrencyLock(workspaceId, tx)).locked) return null
    const documents = await tx.document.findMany({ where: unposted(workspaceId), select: { id: true } })
    const limits = await tx.approvalWorkflowStage.count({ where: { workspaceId, minAmount: { not: null } } })
    await tx.workspace.update({ where: { id: workspaceId }, data: target })
    await recordSystemAudit({
      workspaceId,
      type: "company_currency_migrated",
      detail: { from, to: target.baseCurrency, count: documents.length, noticePending: limits > 0 },
    }, tx)
    return documents.map((d) => d.id)
  })
  if (!documentIds) return null
  for (const id of documentIds) await applyFxToDocument(id)
  return documentIds.length
}

type NoticeDetail = { from: string; to: string; noticePending: boolean }

/** Every pending notice goes to each Owner of its company; the flag clears only when all sends
 * went out, so a failed send is retried by the next run. */
async function sendPendingNotices(): Promise<number> {
  // Cross-workspace scan of the flag; each send below is scoped to one workspace.
  const pending = await unscoped(() => prisma.documentAuditEvent.findMany({
    where: { type: "company_currency_migrated", detail: { path: ["noticePending"], equals: true } },
    select: { id: true, workspaceId: true, detail: true },
  }))
  let sent = 0
  for (const event of pending) {
    const detail = event.detail as NoticeDetail
    const owners = await prisma.workspaceMember.findMany({ where: { workspaceId: event.workspaceId, role: "owner" }, select: { user: { select: { email: true } } } })
    const line = `Currency changed to ${detail.to}`
    try {
      for (const { user } of owners) {
        await sendReminderEmail({
          to: user.email,
          subject: line,
          heading: line,
          body: `${line}. Check your approval limits; they were set in ${detail.from}.`,
          actionUrl: `${config.app.baseURL}${adminPaths(event.workspaceId).approvalFlows}`,
          actionLabel: "Open approval flows",
        })
      }
    } catch (error) {
      console.error(`[company-currency] notice for ${event.workspaceId} not sent:`, error instanceof Error ? error.message : error)
      continue
    }
    await prisma.documentAuditEvent.update({ where: { id: event.id }, data: { detail: { ...detail, noticePending: false } } })
    sent++
  }
  return sent
}

/** Backfills the recorded lock for every company, moves each unlocked company on an unsupported
 * pair to its target, lists each locked one for support (never touched), then sends the pending
 * Owner notices. Idempotent: a migrated company is on an allowed pair and is skipped next run. */
export async function migrateCompanyCurrencies({ dryRun = false } = {}): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: [], supportList: [], noticesSent: 0 }
  const workspaces = await unscoped(() => prisma.workspace.findMany({ select: { id: true, name: true, country: true, baseCurrency: true } }))
  for (const w of workspaces) {
    const recorded = await getCurrencyLock(w.id)
    const evidence = recorded.locked ? null : await lockEvidence(w.id)
    if (evidence && !dryRun) await recordCurrencyLock(w.id, evidence.cause, evidence.provider, evidence.at)
    const lock: Lock | null = recorded.locked ? recorded : evidence

    const target = migrationTarget(w.country, w.baseCurrency)
    if (!target) continue
    const entry = { workspaceId: w.id, name: w.name }
    if (lock) {
      result.supportList.push({ ...entry, country: w.country, baseCurrency: w.baseCurrency, cause: lock.cause, provider: lock.provider, at: lock.at })
      continue
    }
    const count = dryRun ? null : await migrateOne(w.id, w.baseCurrency, target)
    if (count === null && !dryRun) continue // locked by a push since the read above; next run lists it
    result.migrated.push({ ...entry, from: w.baseCurrency, to: target.baseCurrency, count })
  }
  if (!dryRun) result.noticesSent = await sendPendingNotices()
  return result
}
