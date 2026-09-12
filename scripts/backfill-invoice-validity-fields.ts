import { DEFAULT_DOCUMENT_TEMPLATES, parseTemplateFields } from "@/lib/document-templates"
import { prisma } from "@/lib/db"
import { unscoped } from "@/lib/workspace-scope"

/** One-off backfill: adds a new template version carrying `has_tax_invoice_wording`,
 * `supplier_address`/`merchant_address`, `recipient_name`, `recipient_address`, and
 * `recipient_vat_number` (plus `subtotal` on receipt) to every system Invoice/Receipt template
 * created before these fields existed.
 *
 * Without them, `lib/gates/jurisdiction-validity.ts`'s `extractInvoiceLike` reads keys that
 * extraction never populated — so every ZA/LS s20/s24.8 rule that touches supplier address,
 * recipient identity, or tax-invoice wording fails, and the jurisdiction-validity hard gate
 * blocks every single invoice/receipt above the no-invoice threshold regardless of content.
 * Caught by hand-verifying the sample invoice corpus against the real pipeline, not by any
 * existing test — the gate's own unit tests hand-construct fixtures carrying exactly these
 * fields, so the mismatch between the tested gate and the real extraction schema never surfaced.
 *
 * Same shape as backfill-invoice-shipping-total.ts. Safe to re-run — skips any template whose
 * current version already has `has_tax_invoice_wording`. */
async function main() {
  const codes = ["invoice", "receipt"] as const
  let totalUpdated = 0
  let totalTemplates = 0

  for (const code of codes) {
    const defaultTemplate = DEFAULT_DOCUMENT_TEMPLATES.find((template) => template.code === code)
    if (!defaultTemplate) throw new Error(`${code}_default_template_missing`)
    const fields = parseTemplateFields(defaultTemplate.fields)

    // documentTemplate.findMany scoped by { code, isSystem: true } deliberately spans every
    // workspace's system template — that's the whole point of a backfill. Wrapped in unscoped()
    // per lib/workspace-scope.ts's own escape hatch, matching the job-worker/webhook-drain
    // precedent for cross-workspace queries the guard's docstring names directly.
    const templates = await unscoped(() => prisma.documentTemplate.findMany({
      where: { code, isSystem: true },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    }))
    totalTemplates += templates.length

    let updated = 0
    for (const template of templates) {
      const current = template.versions[0]
      if (!current) continue
      const currentFields = parseTemplateFields(current.fields)
      if (currentFields.some((field) => field.key === "has_tax_invoice_wording")) continue

      await prisma.$transaction([
        prisma.documentTemplate.update({ where: { id: template.id }, data: { currentVersion: { increment: 1 } } }),
        prisma.documentTemplateVersion.create({ data: { templateId: template.id, version: template.currentVersion + 1, fields, prompt: current.prompt } }),
      ])
      updated++
    }
    totalUpdated += updated
    console.info(`Backfilled invoice-validity fields onto ${updated} of ${templates.length} ${code} template(s).`)
  }

  console.info(`Done. ${totalUpdated} of ${totalTemplates} template(s) updated.`)
}

main()
  .catch((error) => {
    console.error("Backfill failed", error instanceof Error ? error.message : "unknown_error")
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
