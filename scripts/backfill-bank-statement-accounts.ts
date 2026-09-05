import { parseTemplateFields } from "@/lib/document-templates"
import { FINANCE_OPTIONAL_TEMPLATES } from "@/lib/domains/finance"
import { prisma } from "@/lib/db"

/** One-off backfill: adds `account_ref` to transactions and `accounts` array to every
 * bank_statement template. The bank_statement template seeds as isSystem: false (it's an
 * optional domain-pack template), so no isSystem filter. */
async function main() {
  const statementDefault = FINANCE_OPTIONAL_TEMPLATES.find((template) => template.code === "bank_statement")
  if (!statementDefault) throw new Error("bank_statement_default_template_missing")
  const fields = parseTemplateFields(statementDefault.fields)

  const templates = await prisma.documentTemplate.findMany({
    where: { code: "bank_statement" },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  })

  let updated = 0
  for (const template of templates) {
    const current = template.versions[0]
    if (!current) continue
    const currentFields = parseTemplateFields(current.fields)
    if (currentFields.some((field) => field.key === "accounts")) continue

    await prisma.$transaction([
      prisma.documentTemplate.update({ where: { id: template.id }, data: { currentVersion: { increment: 1 } } }),
      prisma.documentTemplateVersion.create({ data: { templateId: template.id, version: template.currentVersion + 1, fields, prompt: current.prompt } }),
    ])
    updated++
  }

  console.info(`Backfilled accounts onto ${updated} of ${templates.length} bank_statement template(s).`)
}

main()
  .catch((error) => {
    console.error("Backfill failed", error instanceof Error ? error.message : "unknown_error")
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
