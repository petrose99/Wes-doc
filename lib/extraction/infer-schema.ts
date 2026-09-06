import type { DocumentFieldDefinition, DocumentItemFieldDefinition } from "@/lib/document-templates"
import type { DocTypeSpec, CanonicalKey } from "@/lib/doc-types"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const META_KEYS = new Set(["_confidence", "_provenance", "_classification"])

type FieldType = "string" | "number" | "date" | "boolean" | "array"

function inferScalarType(value: unknown): FieldType {
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number" && Number.isFinite(value)) return "number"
  if (typeof value === "string" && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return "date"
  return "string"
}

function labelFromKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function inferItemFields(rows: unknown[]): DocumentItemFieldDefinition[] {
  const keyCounts = new Map<string, { count: number; types: Map<FieldType, number> }>()
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      if (value === null || value === undefined || value === "") continue
      const entry = keyCounts.get(key) ?? { count: 0, types: new Map() }
      entry.count++
      const t = inferScalarType(value)
      entry.types.set(t, (entry.types.get(t) ?? 0) + 1)
      keyCounts.set(key, entry)
    }
  }
  const fields: DocumentItemFieldDefinition[] = []
  for (const [key, { types }] of keyCounts) {
    let bestType: FieldType = "string"
    let bestCount = 0
    for (const [t, count] of types) {
      if (count > bestCount) { bestType = t; bestCount = count }
    }
    const itemType = bestType === "array" ? "string" : bestType
    fields.push({ key, label: labelFromKey(key), type: itemType as "string" | "number" | "date" | "boolean", instruction: "", required: false })
  }
  return fields.slice(0, 20)
}

export function inferFieldSnapshot(
  merged: Record<string, unknown>,
  spec?: DocTypeSpec | null,
): DocumentFieldDefinition[] {
  const canonicalKeySet = new Map<string, CanonicalKey>()
  if (spec?.canonicalKeys) {
    for (const ck of spec.canonicalKeys) canonicalKeySet.set(ck.key, ck)
  }

  const canonicalFields: DocumentFieldDefinition[] = []
  const discoveredFields: DocumentFieldDefinition[] = []

  for (const [key, value] of Object.entries(merged)) {
    if (META_KEYS.has(key) || value === null || value === undefined || value === "") continue

    const ck = canonicalKeySet.get(key)
    const isArray = Array.isArray(value)

    let field: DocumentFieldDefinition
    if (isArray) {
      const itemFields = inferItemFields(value)
      field = {
        key,
        label: ck?.hint ? ck.hint.split(".")[0].split("(")[0].trim() : labelFromKey(key),
        type: "array",
        instruction: "",
        required: false,
        itemFields: itemFields.length ? itemFields : undefined,
      }
    } else {
      const t = inferScalarType(value)
      field = {
        key,
        label: ck?.hint ? ck.hint.split(".")[0].split("(")[0].trim() : labelFromKey(key),
        type: t,
        instruction: "",
        required: false,
      }
    }

    if (ck) {
      canonicalKeySet.delete(key)
      canonicalFields.push(field)
    } else {
      discoveredFields.push(field)
    }
  }

  discoveredFields.sort((a, b) => a.key.localeCompare(b.key))

  return [...canonicalFields, ...discoveredFields]
}

export function extractFreeFormProvenance(output: Record<string, unknown>): {
  fields: Record<string, { page: number | null; quote: string }>
  items: Record<string, ({ page: number | null; quote: string } | null)[]>
} {
  const result: {
    fields: Record<string, { page: number | null; quote: string }>
    items: Record<string, ({ page: number | null; quote: string } | null)[]>
  } = { fields: {}, items: {} }

  const provSource = output._provenance && typeof output._provenance === "object" && !Array.isArray(output._provenance)
    ? output._provenance as Record<string, unknown>
    : {}

  for (const [key, raw] of Object.entries(provSource)) {
    if (META_KEYS.has(key)) continue
    if (Array.isArray(raw)) {
      result.items[key] = raw.map(coerceHint)
    } else {
      const hint = coerceHint(raw)
      if (hint) result.fields[key] = hint
    }
  }

  return result
}

function coerceHint(raw: unknown): { page: number | null; quote: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const page = typeof r.page === "number" && Number.isInteger(r.page) && r.page > 0 ? r.page : null
  const quote = typeof r.quote === "string" ? r.quote.trim().slice(0, 120) : ""
  if (page === null && !quote) return null
  return { page, quote }
}
