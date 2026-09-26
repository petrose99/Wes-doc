// #462 dev-only seed: seven reviewed/posted bills exercising every AttachTrailing state (source-
// file attach follows the ledger pill in StatusLine's trailing slot, #450/#462 spec) plus the
// ledger pill's two under-covered tones (posting, failed) and the Owner back-fill count on the
// Integrations page. Idempotent per filename / connection provider.
//   npx tsx --env-file .env scripts/dev/seed-462.ts <workspaceId>
//
// What it creates, in one workspace:
//   • An IntegrationConnection (provider "quickbooks", connected).
//   • Seven documents, each with a succeeded IntegrationPush against that connection (so
//     ledger reads "posted") and an IntegrationAttachment in one of:
//       462-attach-none        no attachment row at all → "Source file not attached", Retry
//       462-attach-succeeded   status succeeded          → "Source file attached"
//       462-attach-pending     status pending             → "Attaching source file…"
//       462-attach-reconnect   pending + connection needs_reconnect → waits-for-reconnect + link
//       462-attach-transient   failed, no permanent code  → "…didn't respond", Retry
//       462-attach-permanent   failed, attach_oversize    → describeAttachError sentence, no Retry
//   • 462-pill-posting / 462-pill-failed: two more documents with a pending / failed
//     IntegrationPush (no succeeded push) so the ledger pill itself renders "Posting…" / "Post
//     failed" — StatePills' two under-covered tones (row-cells.tsx LEDGER_PILL_TONE).
//   • A second connection (provider "xero", connected) with no attaches yet, so
//     countBackfillableAttachmentsAction finds >0 posted-but-unattached bills for the Owner
//     back-fill control (462-attach-none above is unattached and posted).
import { prisma } from "@/lib/db"
import { FINANCE_TEMPLATES } from "@/lib/domains/finance"
import { randomUUID } from "crypto"
import type { Prisma } from "@/prisma/client"

const INVOICE_FIELDS = FINANCE_TEMPLATES.find((t) => t.code === "invoice")!.fields

async function main() {
  const workspaceId = process.argv[2]
  if (!workspaceId) throw new Error("usage: seed-462.ts <workspaceId>")
  const file = await prisma.documentFile.findFirst({ where: { workspaceId } })
  if (!file) throw new Error("no file in workspace")

  let template = await prisma.documentTemplate.findFirst({ where: { workspaceId, code: "invoice" } })
  if (!template) template = await prisma.documentTemplate.create({ data: { workspaceId, fileId: file.id, code: "invoice", name: "Invoice", documentType: "invoice", isSystem: true, multiRow: true, versions: { create: { version: 1, fields: INVOICE_FIELDS as never } } } })
  const version = await prisma.documentTemplateVersion.findFirst({ where: { templateId: template.id }, orderBy: { version: "desc" } })

  const connection = await prisma.integrationConnection.upsert({
    where: { workspaceId_provider: { workspaceId, provider: "quickbooks" } },
    create: {
      workspaceId, provider: "quickbooks", providerConfigKey: "quickbooks", externalTenantId: "dev-seed-tenant-462",
      tenantName: "Seed Co (dev)", defaultExpenseAccountId: "sundry-expenses", defaultExpenseAccountName: "Sundry Expenses",
      defaultExpenseAccountGuessed: false, status: "connected",
    },
    update: { status: "connected" },
  })
  await prisma.integrationConnection.upsert({
    where: { workspaceId_provider: { workspaceId, provider: "xero" } },
    create: {
      workspaceId, provider: "xero", providerConfigKey: "xero", externalTenantId: "dev-seed-tenant-462-xero",
      tenantName: "Seed Co (dev, Xero)", defaultExpenseAccountGuessed: true, status: "connected",
    },
    update: { status: "connected" },
  })

  const ensureDoc = async (filename: string, vendor: string, number: string, total: number) => {
    const data = {
      vendor, invoice_number: number, issue_date: "2026-09-01", due_date: "2026-10-01",
      currency_code: "ZAR", subtotal: total, tax_total: 0, total,
      line_items: [{ description: "Services", quantity: 1, unit_price: total, amount: total }],
    }
    const existing = await prisma.document.findFirst({ where: { workspaceId, filename } })
    if (existing) {
      return prisma.document.update({ where: { id: existing.id }, data: { status: "reviewed", reviewedData: data as Prisma.InputJsonValue, rawExtraction: data as Prisma.InputJsonValue } })
    }
    return prisma.document.create({
      data: {
        id: randomUUID(), workspaceId, fileId: file.id, templateId: template!.id, templateVersionId: version?.id ?? null,
        docType: "invoice", source: "seed", status: "reviewed", filename, mimeType: "application/pdf", sizeBytes: 21000,
        sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
        fieldSnapshot: INVOICE_FIELDS as unknown as Prisma.InputJsonValue, reviewedData: data as Prisma.InputJsonValue, rawExtraction: data as Prisma.InputJsonValue,
        baseCurrencyTotal: total,
        confidence: { fieldConfidence: Object.fromEntries(Object.keys(data).map((k) => [k, 0.95])) } as Prisma.InputJsonValue,
      },
    })
  }

  const ensurePush = async (documentId: string, status: string, errorCode: string | null) =>
    prisma.integrationPush.upsert({
      where: { documentId_connectionId: { documentId, connectionId: connection.id } },
      create: {
        workspaceId, connectionId: connection.id, documentId, provider: "quickbooks",
        payload: { seed: true } as Prisma.InputJsonValue, status,
        externalBillId: status === "succeeded" ? `dev-seed-${documentId.slice(0, 8)}` : null,
        errorCode, completedAt: status === "succeeded" ? new Date() : null,
      },
      update: { status, errorCode, completedAt: status === "succeeded" ? new Date() : null },
    })

  const ensureAttachment = async (pushId: string, documentId: string, status: string, errorCode: string | null) => {
    await prisma.integrationAttachment.upsert({
      where: { pushId },
      create: { workspaceId, pushId, connectionId: connection.id, documentId, provider: "quickbooks", fileName: "source.pdf", status, errorCode, attempts: errorCode ? 5 : 1 },
      update: { status, errorCode, attempts: errorCode ? 5 : 1 },
    })
  }

  // Seven AttachTrailing states, all posted (succeeded push).
  const none = await ensureDoc("462-attach-none.pdf", "Attach None Ltd", "AN-001", 100)
  const nonePush = await ensurePush(none.id, "succeeded", null)
  await prisma.integrationAttachment.deleteMany({ where: { workspaceId, pushId: nonePush.id } }) // ensure absent

  const succeeded = await ensureDoc("462-attach-succeeded.pdf", "Attach Succeeded Ltd", "AS-001", 100)
  const succeededPush = await ensurePush(succeeded.id, "succeeded", null)
  await ensureAttachment(succeededPush.id, succeeded.id, "succeeded", null)

  const pendingDoc = await ensureDoc("462-attach-pending.pdf", "Attach Pending Ltd", "AP-001", 100)
  const pendingPush = await ensurePush(pendingDoc.id, "succeeded", null)
  await ensureAttachment(pendingPush.id, pendingDoc.id, "pending", null)

  const reconnectDoc = await ensureDoc("462-attach-reconnect.pdf", "Attach Reconnect Ltd", "AR-001", 100)
  const reconnectPush = await ensurePush(reconnectDoc.id, "succeeded", null)
  await ensureAttachment(reconnectPush.id, reconnectDoc.id, "pending", null)

  const transientDoc = await ensureDoc("462-attach-transient.pdf", "Attach Transient Ltd", "AT-001", 100)
  const transientPush = await ensurePush(transientDoc.id, "succeeded", null)
  await ensureAttachment(transientPush.id, transientDoc.id, "failed", "attach_upload_failed")

  const permanentDoc = await ensureDoc("462-attach-permanent.pdf", "Attach Permanent Ltd", "AZ-001", 100)
  const permanentPush = await ensurePush(permanentDoc.id, "succeeded", null)
  await ensureAttachment(permanentPush.id, permanentDoc.id, "failed", "attach_oversize")

  // Two ledger-pill tones: posting (pending push) and failed (failed push), no attachment.
  const postingDoc = await ensureDoc("462-pill-posting.pdf", "Pill Posting Ltd", "PP-001", 100)
  await ensurePush(postingDoc.id, "pending", null)

  const failedDoc = await ensureDoc("462-pill-failed.pdf", "Pill Failed Ltd", "PF-001", 100)
  await ensurePush(failedDoc.id, "failed", "post_provider_error")

  // A second connection, marked needs_reconnect, for the AttachTrailing "waits for reconnect"
  // state's reconnect target and Owner link.
  const xeroConn = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider: "xero" } })
  if (xeroConn) await prisma.integrationConnection.update({ where: { id: xeroConn.id }, data: { status: "needs_reconnect" } })
  // Point the reconnect document's attachment at a connection needing reconnect by using the
  // xero connection's status on the *quickbooks* connection instead — the component reads
  // attachment.connection.status directly, so retarget the reconnect attach row's connectionId.
  if (xeroConn) {
    await prisma.integrationAttachment.update({ where: { pushId: reconnectPush.id }, data: { connectionId: xeroConn.id } })
  }

  console.log(JSON.stringify({
    workspaceId,
    documents: {
      "attach-none": none.id, "attach-succeeded": succeeded.id, "attach-pending": pendingDoc.id,
      "attach-reconnect": reconnectDoc.id, "attach-transient": transientDoc.id, "attach-permanent": permanentDoc.id,
      "pill-posting": postingDoc.id, "pill-failed": failedDoc.id,
    },
  }, null, 2))
}

main().then(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exit(1) })
