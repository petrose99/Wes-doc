import type { ProvenanceHint } from "@/lib/document-templates"

type ItemField = { key: string; type: string }

export type MergeRowsInput = {
  itemFields: ItemField[]
  rows: Record<string, unknown>[]
  hints: (ProvenanceHint | null)[]
  passBoundaries: Set<number>
}

export type MergeRowsResult = {
  rows: Record<string, unknown>[]
  hints: (ProvenanceHint | null)[]
  merges: number
  dropped: number
}

const MARKER_PATTERN = /^(sub)?total\b|balance (carried|brought) (forward|down)|continued (on|from)/i

export function mergeContinuationRows(input: MergeRowsInput): MergeRowsResult {
  const { itemFields, passBoundaries } = input
  const rows = [...input.rows]
  const hints = [...input.hints]
  let merges = 0
  let dropped = 0

  const numericOrDateTypes = new Set(["number", "date", "boolean"])
  const stringKeys = itemFields.filter((f) => !numericOrDateTypes.has(f.type)).map((f) => f.key)
  const numericKeys = itemFields.filter((f) => numericOrDateTypes.has(f.type)).map((f) => f.key)

  for (let i = 1; i < rows.length; ) {
    const row = rows[i]

    const hasNumeric = numericKeys.some((key) => row[key] !== undefined && row[key] !== null && row[key] !== "")
    if (hasNumeric) { i++; continue }

    const nonEmptyStrings = stringKeys.filter((key) => typeof row[key] === "string" && (row[key] as string).trim())
    if (!nonEmptyStrings.length) { i++; continue }

    const prevRow = rows[i - 1]
    const prevHasNumeric = numericKeys.some((key) => prevRow[key] !== undefined && prevRow[key] !== null && prevRow[key] !== "")
    if (!prevHasNumeric) { i++; continue }

    const isBoundary = passBoundaries.has(i)
    const hintEvidence = hints[i]?.page != null && hints[i - 1]?.page != null && hints[i]!.page === hints[i - 1]!.page! + 1
    if (!isBoundary && !hintEvidence) { i++; continue }

    const firstStringValue = nonEmptyStrings.map((key) => (row[key] as string).trim()).join(" ")

    if (MARKER_PATTERN.test(firstStringValue)) {
      rows.splice(i, 1)
      hints.splice(i, 1)
      dropped++
      continue
    }

    if (isRepeatedHeader(row, itemFields)) {
      rows.splice(i, 1)
      hints.splice(i, 1)
      dropped++
      continue
    }

    for (const key of nonEmptyStrings) {
      const prev = typeof prevRow[key] === "string" ? (prevRow[key] as string).trim() : ""
      const fragment = (row[key] as string).trim()
      prevRow[key] = prev ? `${prev} ${fragment}` : fragment
    }
    // Advance the base hint's page so the next fragment can chain via consecutive-page evidence.
    if (hints[i]?.page != null && hints[i - 1] != null) {
      hints[i - 1] = { ...hints[i - 1]!, page: hints[i]!.page }
    }
    rows.splice(i, 1)
    hints.splice(i, 1)
    merges++
    // Don't increment — the next row shifted into position i and may also be a fragment.
  }

  return { rows, hints, merges, dropped }
}

function isRepeatedHeader(row: Record<string, unknown>, itemFields: ItemField[]): boolean {
  for (const field of itemFields) {
    const value = row[field.key]
    if (value === undefined || value === null || value === "") continue
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase()
      const label = field.key.replace(/_/g, " ").toLowerCase()
      if (normalized !== label && normalized !== field.key.toLowerCase()) return false
    } else {
      return false
    }
  }
  return true
}
