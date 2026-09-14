/** A2.2: the bank-detail change freeze — the single highest-value fraud control in the roadmap.
 * An invoice whose remittance IBAN differs from what this workspace has previously seen for the
 * same supplier is the canonical payment-diversion pattern (a compromised vendor mailbox sending
 * a real-looking invoice with the attacker's account), so it FAILS (never warns), which makes it
 * a hard readiness blocker: such a document can never go touchless.
 *
 * Pure: models/document-checks.ts resolves the supplier and passes the remembered details in;
 * learning a first-seen IBAN onto the Supplier row is also the caller's job (and is audited
 * there) — this only compares. */
import type { CheckResult } from "@/lib/checks/types"
import { normalizeIban } from "@/lib/suppliers/normalize"

export function maskIban(iban: string): string {
  return iban.length <= 6 ? iban : `${iban.slice(0, 4)}…${iban.slice(-4)}`
}

export function checkBankDetails(input: {
  /** The payment IBAN extracted from THIS document, raw. */
  extractedIban: string | null
  /** The IBAN previously remembered for the resolved supplier, raw or normalized. Null when this
   * supplier has no remembered bank details yet (first sight — the caller learns it on pass). */
  knownIban: string | null
  supplierName: string | null
}): CheckResult | null {
  const extracted = normalizeIban(input.extractedIban)
  if (!extracted) return null

  const known = normalizeIban(input.knownIban)
  if (!known) {
    return {
      checkCode: "bank_detail_change",
      status: "pass", fields: ["payment_iban"],
      message: `First bank details on file for ${input.supplierName ?? "this supplier"} (${maskIban(extracted)}).`,
      detail: { firstSeen: true, iban: extracted },
    }
  }
  if (known === extracted) {
    return {
      checkCode: "bank_detail_change",
      status: "pass", fields: ["payment_iban"],
      message: "Payment details match the supplier's bank details on file.",
      detail: { iban: extracted },
    }
  }
  return {
    checkCode: "bank_detail_change",
    status: "fail", fields: ["payment_iban"],
    message: `Payment IBAN changed for ${input.supplierName ?? "this supplier"}: ${maskIban(known)} on file, this document says ${maskIban(extracted)}. Verify with the supplier through a known channel before paying.`,
    detail: { knownIban: known, extractedIban: extracted },
  }
}
