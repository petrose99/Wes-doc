// Deliberately NOT a "use server" module: server actions live upstream and do the auth.
import { prisma } from "@/lib/db"
import { recordDocumentAudit } from "@/lib/audit"
import { payerAccountLabel } from "@/lib/payments/payer-account-label"

/** #229 Q4 (#251): Payer accounts — Settings › Payments. A label for the uploader, never a
 * credential; the payment file never carries the number. Archiving instead of deleting keeps
 * old batches labelled. */

export type PayerAccountRow = {
  id: string
  name: string
  bankName: string | null
  lastFour: string | null
  currencyCode: string
  isDefault: boolean
  archivedAt: Date | null
}

const SELECT = { id: true, name: true, bankName: true, lastFour: true, currencyCode: true, isDefault: true, archivedAt: true } as const

export async function listPayerAccounts(workspaceId: string, opts: { includeArchived?: boolean } = {}): Promise<PayerAccountRow[]> {
  return prisma.payerAccount.findMany({
    where: { workspaceId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: SELECT,
  })
}

export { payerAccountLabel }

export async function createPayerAccount(input: { workspaceId: string; actorId: string; name: string; bankName: string | null; lastFour: string | null; currencyCode: string; isDefault: boolean }): Promise<PayerAccountRow> {
  const name = input.name.trim()
  if (!name) throw new Error("payer_account_name_required")
  const currencyCode = input.currencyCode.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("payer_account_currency_invalid")
  const lastFour = input.lastFour?.replace(/\D/g, "").slice(-4) || null
  const count = await prisma.payerAccount.count({ where: { workspaceId: input.workspaceId, archivedAt: null } })
  const isDefault = input.isDefault || count === 0
  const account = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.payerAccount.updateMany({ where: { workspaceId: input.workspaceId, isDefault: true }, data: { isDefault: false } })
    return tx.payerAccount.create({
      data: { workspaceId: input.workspaceId, name, bankName: input.bankName?.trim() || null, lastFour, currencyCode, isDefault },
      select: SELECT,
    })
  })
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payer_account_created", detail: { accountId: account.id, name, currencyCode } })
  return account
}

export async function updatePayerAccount(input: { workspaceId: string; actorId: string; accountId: string; name: string; bankName: string | null; lastFour: string | null; currencyCode: string }): Promise<PayerAccountRow> {
  const existing = await prisma.payerAccount.findFirst({ where: { id: input.accountId, workspaceId: input.workspaceId }, select: { id: true } })
  if (!existing) throw new Error("payer_account_not_found")
  const name = input.name.trim()
  if (!name) throw new Error("payer_account_name_required")
  const currencyCode = input.currencyCode.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("payer_account_currency_invalid")
  const account = await prisma.payerAccount.update({
    where: { id: existing.id },
    data: { name, bankName: input.bankName?.trim() || null, lastFour: input.lastFour?.replace(/\D/g, "").slice(-4) || null, currencyCode },
    select: SELECT,
  })
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payer_account_updated", detail: { accountId: account.id } })
  return account
}

export async function setDefaultPayerAccount(input: { workspaceId: string; actorId: string; accountId: string }): Promise<void> {
  const existing = await prisma.payerAccount.findFirst({ where: { id: input.accountId, workspaceId: input.workspaceId, archivedAt: null }, select: { id: true } })
  if (!existing) throw new Error("payer_account_not_found")
  await prisma.$transaction([
    prisma.payerAccount.updateMany({ where: { workspaceId: input.workspaceId, isDefault: true }, data: { isDefault: false } }),
    prisma.payerAccount.update({ where: { id: existing.id }, data: { isDefault: true } }),
  ])
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payer_account_default_set", detail: { accountId: existing.id } })
}

export async function archivePayerAccount(input: { workspaceId: string; actorId: string; accountId: string }): Promise<void> {
  const existing = await prisma.payerAccount.findFirst({ where: { id: input.accountId, workspaceId: input.workspaceId }, select: { id: true, isDefault: true } })
  if (!existing) throw new Error("payer_account_not_found")
  await prisma.payerAccount.update({ where: { id: existing.id }, data: { archivedAt: new Date(), isDefault: false } })
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payer_account_archived", detail: { accountId: existing.id } })
}
