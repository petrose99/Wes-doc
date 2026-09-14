import type { CheckResult } from "@/lib/checks/types"

/** #207 (map #177's ticket 16): saved bank-statement layout + drift detection.
 *
 * "Layout" is column set + order + header labels + date/amount format — page/section structure
 * is deliberately excluded (too fragile, varies within a single bank's own statements). This
 * app's extraction has no literal "printed header text" field, so the layout signature is
 * derived from what extraction does capture: the set of keys actually populated on each
 * transaction row (a proxy for "which columns exist and in what order"), plus the date and
 * amount formats sniffed from sample values. Zero transactions in a period is NOT drift — an
 * empty month says nothing about the statement's shape. */

export type StatementLayout = {
  columns: string[]
  dateFormat: string | null
  amountFormat: string | null
}

export type StatementDriftInput = {
  transactions: Array<Record<string, unknown>>
  savedLayout: StatementLayout | null
}

export type StatementDriftResult =
  | { kind: "not_applicable" }
  | { kind: "no_transactions" }
  | { kind: "clean"; layout: StatementLayout }
  | { kind: "drift"; layout: StatementLayout; changes: string[] }

const DATE_PATTERNS: Array<[RegExp, string]> = [
  [/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"],
  [/^\d{2}\/\d{2}\/\d{4}$/, "DD/MM/YYYY"],
  [/^\d{2}-\d{2}-\d{4}$/, "DD-MM-YYYY"],
]

function sniffDateFormat(value: unknown): string | null {
  if (typeof value !== "string") return null
  for (const [pattern, name] of DATE_PATTERNS) if (pattern.test(value)) return name
  return null
}

function sniffAmountFormat(value: unknown): string | null {
  if (typeof value === "number") return "numeric"
  if (typeof value !== "string") return null
  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(value)) return "comma_grouped"
  if (/^-?\d+(\.\d+)?$/.test(value)) return "plain"
  if (/^\(\d+(\.\d+)?\)$/.test(value)) return "parenthesized_negative"
  return null
}

/** Derives a layout signature from a statement's extracted transactions. Columns are the union
 * of keys populated across rows (order-preserving by first sighting) — a column present on some
 * rows but not others is still "part of the layout"; a genuinely removed column simply never
 * appears. */
export function deriveStatementLayout(transactions: Array<Record<string, unknown>>): StatementLayout {
  const columns: string[] = []
  let dateFormat: string | null = null
  let amountFormat: string | null = null
  for (const row of transactions) {
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) continue
      if (!columns.includes(key)) columns.push(key)
      if (!dateFormat && key.toLowerCase().includes("date")) dateFormat = sniffDateFormat(value) ?? dateFormat
      if (!amountFormat && (key.toLowerCase().includes("amount") || key.toLowerCase().includes("balance"))) amountFormat = sniffAmountFormat(value) ?? amountFormat
    }
  }
  return { columns, dateFormat, amountFormat }
}

function layoutChanges(saved: StatementLayout, current: StatementLayout): string[] {
  const changes: string[] = []
  const savedSet = new Set(saved.columns)
  const currentSet = new Set(current.columns)
  const added = current.columns.filter((c) => !savedSet.has(c))
  const removed = saved.columns.filter((c) => !currentSet.has(c))
  if (added.length) changes.push(`column(s) added: ${added.join(", ")}`)
  if (removed.length) changes.push(`column(s) removed: ${removed.join(", ")}`)
  if (!added.length && !removed.length && saved.columns.join(",") !== current.columns.join(",")) changes.push(`column order changed: ${saved.columns.join(" > ")} → ${current.columns.join(" > ")}`)
  if (saved.dateFormat && current.dateFormat && saved.dateFormat !== current.dateFormat) changes.push(`date format changed: ${saved.dateFormat} → ${current.dateFormat}`)
  if (saved.amountFormat && current.amountFormat && saved.amountFormat !== current.amountFormat) changes.push(`amount format changed: ${saved.amountFormat} → ${current.amountFormat}`)
  return changes
}

/** Pure evaluation: given the saved layout (null for a not-yet-asserted institution or its first
 * statement) and this statement's transactions, decide clean / drift / not-applicable. The
 * caller (models/document-checks.ts) is responsible for persisting a first-seen layout onto the
 * Institution — this function only judges, it never writes. */
export function evaluateStatementDrift(input: StatementDriftInput): StatementDriftResult {
  if (!input.transactions.length) return { kind: "no_transactions" }
  const layout = deriveStatementLayout(input.transactions)
  if (!input.savedLayout) return { kind: "not_applicable" }
  const changes = layoutChanges(input.savedLayout, layout)
  return changes.length ? { kind: "drift", layout, changes } : { kind: "clean", layout }
}

export function checkStatementLayoutDrift(input: StatementDriftInput): CheckResult | null {
  const result = evaluateStatementDrift(input)
  if (result.kind !== "drift") return null
  return {
    checkCode: "statement_layout_drift",
    status: "warn",
    message: `This statement's layout differs from the saved layout for this institution: ${result.changes.join("; ")}`,
    detail: { changes: result.changes, layout: result.layout },
  }
}
