// #430 dev-only seed: a posted bill on account "Sundry Expenses" plus a SupplierAccountRule that
// currently targets the same account, so changing the rule's account (or the connection Default)
// in the Integrations settings UI triggers `checkAffectedByRuleChangeAction` and opens Screen 1's
// "N bills already posted" dialog. Idempotent per filename.
//   npx tsx --env-file .env scripts/dev/seed-account-correction.ts <workspaceId>
//
// What it creates, in one workspace:
//   • An IntegrationConnection (provider "quickbooks", fake externalTenantId — the provider
//     pre-check (checkQuickBooksBillCorrectable) will fail its real HTTP call against this fake
//     tenant and every row will come back refused ("not_found"); there is no dev mock for the
//     provider client, so the dialog's happy-path ticking can only be verified against a real
//     QuickBooks/Xero sandbox tenant, not in this environment. The refused-row state (all rows
//     disabled, reason shown, bottom-sorted) is still a real, verifiable render state.
//   • A SupplierAccountRule for "Acme Fuel Co" → account "sundry-expenses" (external id).
//   • A reviewed document from Acme Fuel Co, coded with one line on "sundry-expenses", plus a
//     succeeded IntegrationPush against the same connection, so it reads as "posted" — the
//     ledgerFact `findBillsAffectedByAccountChange` requires.
import { prisma } from "@/lib/db"
import { FINANCE_TEMPLATES } from "@/lib/domains/finance"
import { randomUUID } from "crypto"
import type { Prisma } from "@/prisma/client"

const INVOICE_FIELDS = FINANCE_TEMPLATES.find((t) => t.code === "invoice")!.fields

const OLD_ACCOUNT_EXTERNAL_ID = "sundry-expenses"
const OLD_ACCOUNT_NAME = "Sundry Expenses"
const NEW_ACCOUNT_EXTERNAL_ID = "fuel"
const NEW_ACCOUNT_NAME = "Fuel"

async function main() {
  const workspaceId = process.argv[2]
  if (!workspaceId) throw new Error("usage: seed-account-correction.ts <workspaceId>")
  const file = await prisma.documentFile.findFirst({ where: { workspaceId } })
  if (!file) throw new Error("no file in workspace")

  let template = await prisma.documentTemplate.findFirst({ where: { workspaceId, code: "invoice" } })
  if (!template) template = await prisma.documentTemplate.create({ data: { workspaceId, fileId: file.id, code: "invoice", name: "Invoice", documentType: "invoice", isSystem: true, multiRow: true, versions: { create: { version: 1, fields: INVOICE_FIELDS as never } } } })
  const version = await prisma.documentTemplateVersion.findFirst({ where: { templateId: template.id }, orderBy: { version: "desc" } })

  const connection = await prisma.integrationConnection.upsert({
    where: { workspaceId_provider: { workspaceId, provider: "quickbooks" } },
    create: {
      workspaceId, provider: "quickbooks", providerConfigKey: "quickbooks", externalTenantId: "dev-seed-tenant-430",
      tenantName: "Seed Co (dev)", defaultExpenseAccountId: OLD_ACCOUNT_EXTERNAL_ID, defaultExpenseAccountName: OLD_ACCOUNT_NAME,
      defaultExpenseAccountGuessed: false, status: "connected",
    },
    update: { defaultExpenseAccountId: OLD_ACCOUNT_EXTERNAL_ID, defaultExpenseAccountName: OLD_ACCOUNT_NAME, status: "connected" },
  })

  await prisma.supplierAccountRule.upsert({
    where: { connectionId_supplierName: { connectionId: connection.id, supplierName: "Acme Fuel Co" } },
    create: { workspaceId, connectionId: connection.id, supplierName: "Acme Fuel Co", accountExternalId: OLD_ACCOUNT_EXTERNAL_ID, lastUsedAt: new Date() },
    update: { accountExternalId: OLD_ACCOUNT_EXTERNAL_ID, lastUsedAt: new Date() },
  })

  const filename = "acme-fuel-posted-bill.pdf"
  const data = {
    vendor: "Acme Fuel Co", invoice_number: "AF-9001", issue_date: "2026-09-01", due_date: "2026-10-01",
    currency_code: "USD", subtotal: 240, tax_total: 0, total: 240,
    line_items: [{ description: "Diesel — depot refuel", quantity: 1, unit_price: 240, amount: 240 }],
  }
  const codingData = { items: [{ index: 0, account_external_id: OLD_ACCOUNT_EXTERNAL_ID, account_source: "rule" }] }

  let doc = await prisma.document.findFirst({ where: { workspaceId, filename } })
  if (!doc) {
    doc = await prisma.document.create({
      data: {
        id: randomUUID(), workspaceId, fileId: file.id, templateId: template.id, templateVersionId: version?.id ?? null,
        docType: "invoice", source: "seed", status: "reviewed", filename, mimeType: "application/pdf", sizeBytes: 21000,
        sha256: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
        fieldSnapshot: INVOICE_FIELDS as unknown as Prisma.InputJsonValue, reviewedData: data as Prisma.InputJsonValue, rawExtraction: data as Prisma.InputJsonValue,
        codingData: codingData as Prisma.InputJsonValue, baseCurrencyTotal: 240,
        confidence: { fieldConfidence: Object.fromEntries(Object.keys(data).map((k) => [k, 0.95])) } as Prisma.InputJsonValue,
      },
    })
  } else {
    doc = await prisma.document.update({ where: { id: doc.id }, data: { status: "reviewed", reviewedData: data as Prisma.InputJsonValue, codingData: codingData as Prisma.InputJsonValue, baseCurrencyTotal: 240, accountCorrectionDismissedAt: null, accountCorrectionDismissedFromAccountId: null } })
  }

  await prisma.integrationPush.upsert({
    where: { documentId_connectionId: { documentId: doc.id, connectionId: connection.id } },
    create: { workspaceId, connectionId: connection.id, documentId: doc.id, provider: "quickbooks", payload: { seed: true } as Prisma.InputJsonValue, status: "succeeded", externalBillId: "dev-seed-bill-9001", completedAt: new Date() },
    update: { status: "succeeded", externalBillId: "dev-seed-bill-9001", completedAt: new Date() },
  })

  console.log(JSON.stringify({ connectionId: connection.id, documentId: doc.id, oldAccountExternalId: OLD_ACCOUNT_EXTERNAL_ID, oldAccountName: OLD_ACCOUNT_NAME, newAccountExternalId: NEW_ACCOUNT_EXTERNAL_ID, newAccountName: NEW_ACCOUNT_NAME }, null, 2))
}

main().then(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exit(1) })
