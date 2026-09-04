import { flattenedItemRows } from "@/lib/document-export"
import type { DocumentFieldDefinition } from "@/lib/document-templates"

/** One spreadsheet column: a template field, or one column of the line-item table expanded out
 * when the worksheet is in multi-row mode. */
export type SheetColumn = {
  id: string
  label: string
  type: string
  /** The template field this column reads, which for an item column is the array field. */
  fieldKey: string
  /** Set only for item columns: the key inside each array entry. */
  itemKey: string | null
}

/** One spreadsheet row. A single-row worksheet produces one per document; a multi-row one
 * produces one per line item, with the document's scalar fields repeated down each. */
export type SheetRow = {
  documentId: string
  filename: string
  itemIndex: number | null
  values: Record<string, unknown>
  fieldConfidence: Record<string, number>
  missingRequired: string[]
  /** Dictated values the recording does not support — no confidence score and no pinnable moment
   * in the audio. Rendered red, like a missing required field: the risk is a fabricated value, not
   * an uncertain reading. Absent on documents that were never dictated. */
  unsupportedFields?: string[]
}

export type DerivedSheet = { columns: SheetColumn[]; rows: SheetRow[]; multiRow: boolean }

/** The documents this needs, narrowed to the columns it actually reads, so both the sheet page
 * and the shared page can pass their own query results in. */
export type DerivableDocument = {
  id: string
  filename: string
  reviewedData: unknown
  rawExtraction: unknown
  confidence: unknown
}

/** Turns a worksheet's fields and its extracted documents into the grid that represents them.
 *
 * This lived twice — once in the sheet page, once in the shared page — and the two copies had
 * to be kept identical by hand or a shared link would show different columns from the file it
 * points at. */
export function deriveSheet(fields: DocumentFieldDefinition[], documents: DerivableDocument[], options: { multiRow: boolean }): DerivedSheet {
  if (!fields.length) return deriveFreeFormSheet(documents)

  const scalarFields = fields.filter((field) => field.type !== "array")
  const arrayField = fields.find((field) => field.type === "array" && field.itemFields?.length)
  const multiRow = options.multiRow && !!arrayField

  const columns: SheetColumn[] = [
    ...scalarFields.map((field): SheetColumn => ({ id: field.key, label: field.label, type: field.type, fieldKey: field.key, itemKey: null })),
    ...(multiRow && arrayField
      ? arrayField.itemFields!.map((item): SheetColumn => ({ id: `item_${item.key}`, label: item.label, type: item.type, fieldKey: arrayField.key, itemKey: item.key }))
      : fields.filter((field) => field.type === "array").map((field): SheetColumn => ({ id: field.key, label: field.label, type: "array", fieldKey: field.key, itemKey: null }))),
  ]

  const rows = documents.flatMap((document): SheetRow[] => {
    const confidence = document.confidence as { missingRequiredFields?: string[]; fieldConfidence?: Record<string, number>; unsupportedFields?: string[] } | null
    // reviewedData is what a human confirmed; rawExtraction is what the model first said.
    const data = (document.reviewedData as Record<string, unknown> | null) ?? (document.rawExtraction as Record<string, unknown> | null) ?? {}
    const shared = {
      documentId: document.id,
      filename: document.filename,
      fieldConfidence: confidence?.fieldConfidence ?? {},
      missingRequired: confidence?.missingRequiredFields ?? [],
      unsupportedFields: confidence?.unsupportedFields ?? [],
    }

    if (!multiRow || !arrayField) {
      return [{ ...shared, itemIndex: null, values: Object.fromEntries(fields.map((field) => [field.key, data[field.key]])) }]
    }

    return flattenedItemRows(data, fields).map(({ itemIndex, item }): SheetRow => ({
      ...shared,
      itemIndex,
      values: {
        ...Object.fromEntries(scalarFields.map((field) => [field.key, data[field.key]])),
        ...Object.fromEntries((arrayField.itemFields || []).map((itemField) => [`item_${itemField.key}`, item[itemField.key]])),
      },
    }))
  })

  return { columns, rows, multiRow }
}

function toLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function deriveFreeFormSheet(documents: DerivableDocument[]): DerivedSheet {
  const allScalarKeys = new Set<string>()
  const allItemKeys = new Set<string>()
  let hasLineItems = false

  for (const doc of documents) {
    const data = (doc.reviewedData as Record<string, unknown> | null) ?? (doc.rawExtraction as Record<string, unknown> | null) ?? {}
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("_")) continue
      if (key === "line_items" && Array.isArray(value)) {
        hasLineItems = true
        for (const item of value) {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            for (const ik of Object.keys(item as Record<string, unknown>)) allItemKeys.add(ik)
          }
        }
      } else if (!Array.isArray(value) && (typeof value !== "object" || value === null)) {
        allScalarKeys.add(key)
      }
    }
  }

  const columns: SheetColumn[] = [
    ...[...allScalarKeys].map((key): SheetColumn => ({ id: key, label: toLabel(key), type: "string", fieldKey: key, itemKey: null })),
    ...(hasLineItems
      ? [...allItemKeys].map((key): SheetColumn => ({ id: `item_${key}`, label: toLabel(key), type: "string", fieldKey: "line_items", itemKey: key }))
      : []),
  ]

  const rows = documents.flatMap((doc): SheetRow[] => {
    const confidence = doc.confidence as { fieldConfidence?: Record<string, number> } | null
    const data = (doc.reviewedData as Record<string, unknown> | null) ?? (doc.rawExtraction as Record<string, unknown> | null) ?? {}
    const shared = { documentId: doc.id, filename: doc.filename, fieldConfidence: confidence?.fieldConfidence ?? {}, missingRequired: [] as string[] }

    if (!hasLineItems) {
      const values: Record<string, unknown> = {}
      for (const key of allScalarKeys) values[key] = data[key]
      return [{ ...shared, itemIndex: null, values }]
    }

    const items = Array.isArray(data.line_items) ? (data.line_items as unknown[]) : []
    if (!items.length) {
      const values: Record<string, unknown> = {}
      for (const key of allScalarKeys) values[key] = data[key]
      return [{ ...shared, itemIndex: null, values }]
    }

    return items.map((item, itemIndex): SheetRow => {
      const values: Record<string, unknown> = {}
      for (const key of allScalarKeys) values[key] = data[key]
      if (item && typeof item === "object" && !Array.isArray(item)) {
        for (const key of allItemKeys) values[`item_${key}`] = (item as Record<string, unknown>)[key]
      }
      return { ...shared, itemIndex, values }
    })
  })

  return { columns, rows, multiRow: hasLineItems }
}
