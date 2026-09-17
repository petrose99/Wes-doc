/** Sentence per server refusal code — every claim action returns `{ success:false, error: sentence }`,
 * never a bare code, so the dialog/tab can show it verbatim (spec §2). `merchant` is the document's
 * display name at the point of refusal. */
export function claimRefusalSentence(code: string, merchant?: string | null): string {
  const who = merchant ?? "This receipt"
  switch (code) {
    case "document_not_an_expense_receipt":
      return `${who} is a supplier receipt, not an expense.`
    case "document_needs_attention":
      return `${who} needs attention before it can be claimed.`
    case "document_already_claimed":
      return `${who} is already in a claim.`
    case "expense_claim_currency_mismatch":
      return `${who} is in a different currency from this claim.`
    case "expense_claim_not_draft":
      return "This claim was already submitted."
    case "expense_claim_stage_decided":
      return "A stage was already decided; this claim can't be withdrawn."
    case "stage_requires_owner":
      return "Only this stage's approver can decide it."
    case "expense_claim_not_submitted":
      return "This claim was already decided."
    case "expense_claim_mixed_currency":
      return "Receipts are in two currencies. Remove one currency's receipts first."
    case "expense_claim_no_amounts":
      return "Add an amount to at least one receipt first."
    default:
      return "Something went wrong. Try again."
  }
}
