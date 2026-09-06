import { DEFAULT_DOCUMENT_TEMPLATES, parseTemplateFields } from "@/lib/document-templates"
import { prisma } from "@/lib/db"

/** One-off backfill (A2.2): adds a new template version carrying `payment_iban` to every system
 * Invoice template created before the field existed — the bank-detail-change freeze
 * (lib/checks/bank-details.ts) has nothing to compare until invoices extract the remittance IBAN.
 * Safe to re-run — it skips any template whose current version already has the field. Same shape
 * as backfill-invoice-shipping-total.ts. */
async function main() {
  const invoiceDefault = DEFAULT_DOCUMENT_TEMPLATES.find((template) => template.code === "invoice")
  if (!invoiceDefault) throw new Error("invoice_default_template_missing")
  const fields = parseTemplateFields(invoiceDefault.fields)

  const templates = await prisma.documentTemplate.findMany({
    where: { code: "invoice", isSystem: true },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  })

  let updated = 0
  for (const template of templates) {
    const current = template.versions[0]
    if (!current) continue
    const currentFields = parseTemplateFields(current.fields)
    if (currentFields.some((field) => field.key === "payment_iban")) continue

    await prisma.$transaction([
      prisma.documentTemplate.update({ where: { id: template.id }, data: { currentVersion: { increment: 1 } } }),
      prisma.documentTemplateVersion.create({ data: { templateId: template.id, version: template.currentVersion + 1, fields, prompt: current.prompt } }),
    ])
    updated++
  }

  console.info(`Backfilled payment_iban onto ${updated} of ${templates.length} invoice template(s).`)
}

main()
  .catch((error) => {
    console.error("Backfill failed", error instanceof Error ? error.message : "unknown_error")
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
