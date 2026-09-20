/** #347: the one string for "how many lines, of which kind" a Payment batch holds — read by the
 * batch queue's Lines column, the batch pane header, the create-batch dialog's receipt/footer,
 * and every confirm dialog's recap. A bill-only batch renders byte-identical to the pre-#347
 * "n bills" text (#251); a claim-only batch renders "n claims" the same way, not "0 bills · n
 * claims" — each noun appears only once its count is present (close #347, H8). */
export function describeBatchCounts(billCount: number, claimCount: number): string {
  const parts = []
  if (billCount > 0 || claimCount === 0) parts.push(`${billCount} bill${billCount === 1 ? "" : "s"}`)
  if (claimCount > 0) parts.push(`${claimCount} claim${claimCount === 1 ? "" : "s"}`)
  return parts.join(" · ")
}
