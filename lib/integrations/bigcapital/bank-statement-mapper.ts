export type BankStatementTransaction = {
  date: string
  description: string
  amount: number
  type: "debit" | "credit"
}

export type BankStatementPayload = {
  documentId: string
  documentType: "bank_statement"
  bankName: string | null
  currencyCode: string | null
  transactions: BankStatementTransaction[]
  cashflowAccountId: string
  creditAccountId: string
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function extractBankStatementPayload(
  documentId: string,
  reviewedData: Record<string, unknown>,
  cashflowAccountId: string,
  creditAccountId: string,
): BankStatementPayload {
  const bankName = asString(reviewedData.bank_name)
  const currencyCode = asString(reviewedData.currency_code)
  const rows = Array.isArray(reviewedData.transactions) ? (reviewedData.transactions as unknown[]) : []

  const transactions: BankStatementTransaction[] = rows
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>
      const debit = asNumber(r.debit)
      const credit = asNumber(r.credit)
      if (!debit && !credit) return null
      const date = asString(r.transaction_date) ?? new Date().toISOString().slice(0, 10)
      const description = asString(r.description) ?? "Bank transaction"
      return debit
        ? { date, description, amount: debit, type: "debit" as const }
        : { date, description, amount: credit!, type: "credit" as const }
    })
    .filter((t): t is BankStatementTransaction => t !== null)

  return { documentId, documentType: "bank_statement", bankName, currencyCode, transactions, cashflowAccountId, creditAccountId }
}

export function toBigcapitalCashflowBody(
  txn: BankStatementTransaction,
  cashflowAccountId: string,
  creditAccountId: string,
  referenceNo?: string,
) {
  return {
    date: txn.date,
    amount: txn.amount,
    cashflow_account_id: Number(cashflowAccountId),
    credit_account_id: Number(creditAccountId),
    transaction_type: txn.type === "credit" ? "other_income" as const : "other_expense" as const,
    description: txn.description,
    ...(referenceNo ? { reference_no: referenceNo } : {}),
  }
}
