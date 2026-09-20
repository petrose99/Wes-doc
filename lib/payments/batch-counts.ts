/** #347: the one string for "how many lines, of which kind" a Payment batch holds — read by the
 * batch queue's Lines column, the batch pane header, the create-batch dialog's receipt/footer,
 * and every confirm dialog's recap. A bill-only batch renders byte-identical to the pre-#347
 * "n bills" text (#251); a claim gets its own noun only once one is present. */
export function describeBatchCounts(billCount: number, claimCount: number): string {
  const bills = `${billCount} bill${billCount === 1 ? "" : "s"}`
  if (claimCount === 0) return bills
  return `${bills} · ${claimCount} claim${claimCount === 1 ? "" : "s"}`
}
