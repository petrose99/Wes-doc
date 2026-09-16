// Deliberately NOT a "use server" module: server actions live upstream and do the auth.
import { prisma } from "@/lib/db"
import { recordDocumentAudit } from "@/lib/audit"
import { parseTemplateFields } from "@/lib/document-templates"
import {
  isFieldWidth, resolveFieldTable,
  type CustomFieldSource, type FieldDefaults, type FieldOverlay, type FieldTable, type FieldTableType, type FieldWidth,
} from "@/lib/configuration/field-table"

/** #231 Q11 (#252): reads and writes behind Admin › Configuration › Fields. The table itself is
 * the pure merge in `lib/configuration/field-table.ts`; this module only fetches its inputs and
 * stores the overlay rows. */

/** The type's template fields: system templates give the defaults (what Required means today
 * before any owner touched the table), non-system templates give the custom fields. */
async function templateFieldsFor(workspaceId: string, docType: FieldTableType): Promise<{ custom: CustomFieldSource[]; defaults: FieldDefaults }> {
  const templates = await prisma.documentTemplate.findMany({
    where: { workspaceId, documentType: docType },
    select: { isSystem: true, versions: { orderBy: { version: "desc" }, take: 1, select: { fields: true } } },
  })
  const custom: CustomFieldSource[] = []
  const defaults: FieldDefaults = {}
  for (const template of templates) {
    const version = template.versions[0]
    if (!version) continue
    let parsed
    try { parsed = parseTemplateFields(version.fields) } catch { continue }
    for (const field of parsed) {
      if (template.isSystem) { if (!(field.key in defaults)) defaults[field.key] = { required: field.required } }
      else custom.push({ key: field.key, label: field.label, required: field.required })
    }
  }
  return { custom, defaults }
}

async function overlayFor(workspaceId: string, docType: FieldTableType): Promise<FieldOverlay[]> {
  const rows = await prisma.workspaceFieldConfig.findMany({ where: { workspaceId, docType }, orderBy: { position: "asc" } })
  return rows.map((row) => ({ fieldKey: row.fieldKey, editable: row.editable, required: row.required, width: isFieldWidth(row.width) ? row.width : "normal", position: row.position }))
}

export async function getFieldTable(workspaceId: string, docType: FieldTableType): Promise<FieldTable> {
  const [{ custom, defaults }, overlay] = await Promise.all([templateFieldsFor(workspaceId, docType), overlayFor(workspaceId, docType)])
  return resolveFieldTable(docType, custom, overlay, defaults)
}

/** True when the workspace has ever saved a table for the type — the queue and pane only pay
 * for the lookup when an owner has actually configured something. */
export async function hasFieldTable(workspaceId: string, docType: FieldTableType): Promise<boolean> {
  return (await prisma.workspaceFieldConfig.count({ where: { workspaceId, docType } })) > 0
}

/** The table if one has been saved, else null — the cheap path for every consumer that is not
 * the Configuration page itself. */
export async function getSavedFieldTable(workspaceId: string, docType: FieldTableType): Promise<FieldTable | null> {
  if (!(await hasFieldTable(workspaceId, docType))) return null
  return getFieldTable(workspaceId, docType)
}

export type FieldTableSave = { key: string; editable: boolean; required: boolean; width: FieldWidth }[]

/** Replaces the type's overlay in one transaction — position is the array index. The save
 * carries `expectedUpdatedAt` so two owners editing at once do not silently overwrite each
 * other (throws `field_table_stale`). */
export async function saveFieldTable(input: { workspaceId: string; actorId: string; docType: FieldTableType; rows: FieldTableSave; expectedUpdatedAt: string | null }): Promise<void> {
  const { workspaceId, docType } = input
  await prisma.$transaction(async (tx) => {
    const latest = await tx.workspaceFieldConfig.findFirst({ where: { workspaceId, docType }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })
    const current = latest?.updatedAt.toISOString() ?? null
    if ((input.expectedUpdatedAt ?? null) !== current) throw new Error("field_table_stale")
    await tx.workspaceFieldConfig.deleteMany({ where: { workspaceId, docType } })
    if (input.rows.length) {
      await tx.workspaceFieldConfig.createMany({
        data: input.rows.map((row, position) => ({ workspaceId, docType, fieldKey: row.key, editable: row.editable, required: row.required, width: row.width, position })),
      })
    }
  })
  await recordDocumentAudit({
    workspaceId, actorId: input.actorId, type: "field_table_saved",
    detail: { docType, fields: input.rows.length, required: input.rows.filter((row) => row.required).map((row) => row.key), hidden: input.rows.filter((row) => row.width === "hidden").map((row) => row.key) },
  })
}

/** The stamp the page hands to the save so a stale table is refused, not overwritten. */
export async function fieldTableStamp(workspaceId: string, docType: FieldTableType): Promise<string | null> {
  const latest = await prisma.workspaceFieldConfig.findFirst({ where: { workspaceId, docType }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })
  return latest?.updatedAt.toISOString() ?? null
}
