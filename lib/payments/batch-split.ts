/** #229 Q4 (#251): one Payment batch = one payer account = one currency = one file. A selection
 * that mixes Pay From accounts or currencies splits into one batch per (account, currency) pair,
 * and the Create batch dialog says so before anything is written. Pure; the model calls it and
 * the dialog calls it, so both agree on the split. */

export type BatchLineInput = {
  documentId: string
  payFromAccountId: string | null
  currencyCode: string
}

export type BatchGroup<T extends BatchLineInput> = {
  key: string
  payFromAccountId: string | null
  currencyCode: string
  lines: T[]
}

export function splitIntoBatches<T extends BatchLineInput>(lines: T[]): BatchGroup<T>[] {
  const groups = new Map<string, BatchGroup<T>>()
  for (const line of lines) {
    const currencyCode = line.currencyCode.toUpperCase()
    const key = `${line.payFromAccountId ?? "none"}:${currencyCode}`
    const group = groups.get(key) ?? { key, payFromAccountId: line.payFromAccountId, currencyCode, lines: [] }
    group.lines.push(line)
    groups.set(key, group)
  }
  // Stable: the order the operator selected in, first line of each group decides.
  return [...groups.values()]
}

/** `YYYY-MM-DD-001`, the next free suffix for the day given the names already taken today. */
export function suggestBatchName(now: Date, takenToday: string[]): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  // Local date, not UTC: a batch made at 23:30 SAST is still today's batch.
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const used = new Set(takenToday.filter((name) => name.startsWith(`${day}-`)).map((name) => name.slice(day.length + 1)))
  let n = 1
  while (used.has(String(n).padStart(3, "0"))) n += 1
  return `${day}-${String(n).padStart(3, "0")}`
}

/** The name each batch of a split gets — shared by the model and the dialog so the preview matches. */
export function splitBatchName(baseName: string, groupCount: number, currencyCode: string, index: number): string {
  return groupCount === 1 ? baseName : `${baseName}-${currencyCode}-${index + 1}`
}
