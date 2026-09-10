/** WP-AP2: pure ZA EFT payment-file formatter. Emits a plain CSV format that every major SA
 * business-banking portal (Standard Bank, Absa, Nedbank, FNB) will accept via their "bulk
 * payments upload" surface — the columns are the union of what those portals ask for; each
 * portal ignores columns it doesn't need.
 *
 * NOT a scheme file (no BankservAfrica ACB header, no fixed-width record layouts). The reason is
 * deliberate: only a registered payment operator can submit ACB files. A CSV a user uploads via
 * their own bank's portal keeps DocuBite entirely outside the payment-license perimeter, which
 * is the whole point of "prepare, don't execute" — see the AP reposition plan.
 *
 * SEPA (pain.001) support is a future add; it lives next to this file when we get to it. */

export type PaymentInstruction = {
  documentId: string
  supplier: string
  bankAccountNumber: string | null
  branchCode: string | null
  amount: number
  currencyCode: string
  reference: string
  /** Optional beneficiary email for the bank's own remittance notification, when the portal
   * supports it (Standard Bank's does). */
  beneficiaryEmail?: string | null
}

export type ZaEftCsvOptions = {
  /** Filename hint the caller intends to save the file as — not written into the CSV itself,
   * exposed only so a download response can set Content-Disposition. */
  filename?: string
}

/** Rejects an instruction that would generate a malformed row. Returns a list of human-readable
 * errors — never throws — so the caller can render every problem at once rather than surfacing
 * them one at a time. An empty list means the file is safe to write. */
export function validatePaymentInstructions(instructions: PaymentInstruction[]): string[] {
  const errors: string[] = []
  if (instructions.length === 0) return ["no_instructions"]
  for (const [i, ins] of instructions.entries()) {
    if (!ins.supplier?.trim()) errors.push(`row ${i + 1}: missing supplier`)
    if (!ins.bankAccountNumber?.trim()) errors.push(`row ${i + 1} (${ins.supplier}): missing bank account`)
    if (ins.amount === null || ins.amount === undefined || !Number.isFinite(ins.amount) || ins.amount <= 0) errors.push(`row ${i + 1} (${ins.supplier}): amount must be a positive number`)
    if (!ins.reference?.trim()) errors.push(`row ${i + 1} (${ins.supplier}): missing reference`)
    if (!/^[A-Z]{3}$/.test(ins.currencyCode)) errors.push(`row ${i + 1} (${ins.supplier}): currency must be an ISO 4217 code`)
  }
  return errors
}

/** Formats one payment run as CSV. Fields in every SA bulk-payment header the portals accept in
 * some form. Currency is a column even when every row is ZAR — a mixed-currency batch is a real
 * case (a workspace using DocuBite for foreign-supplier invoices) and a currency-per-row keeps
 * the parser downstream honest. */
export function formatZaEftCsv(instructions: PaymentInstruction[]): string {
  const header = [
    "beneficiary_name",
    "account_number",
    "branch_code",
    "amount",
    "currency",
    "your_reference",
    "beneficiary_reference",
    "beneficiary_email",
  ]
  const rows = instructions.map((ins) => [
    csvField(ins.supplier),
    csvField(ins.bankAccountNumber ?? ""),
    csvField(ins.branchCode ?? ""),
    ins.amount.toFixed(2),
    ins.currencyCode.toUpperCase(),
    csvField(ins.reference),
    csvField(ins.reference),
    csvField(ins.beneficiaryEmail ?? ""),
  ])
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n") + "\r\n"
}

/** RFC 4180 quoting: any field containing a comma, quote, CR, or LF gets wrapped in double
 * quotes with embedded quotes doubled. */
function csvField(value: string): string {
  if (value === "") return ""
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Total of all instructions, per currency. Useful for the "you are about to send X" preview
 * summary a UI shows before offering the download. */
export function totalsByCurrency(instructions: PaymentInstruction[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const ins of instructions) {
    const cur = ins.currencyCode.toUpperCase()
    totals[cur] = (totals[cur] ?? 0) + ins.amount
  }
  return totals
}

/** Suggests a filename for a run created `now`, e.g. `payment-run-2026-09-10-1435.csv`. */
export function paymentRunFilename(now: Date): string {
  const iso = now.toISOString()
  return `payment-run-${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}.csv`
}
