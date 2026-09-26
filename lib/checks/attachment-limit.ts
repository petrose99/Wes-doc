/** Pre-post warn Check: "a file the ledger can't take is known before posting" (ADR 0016 / #450).
 * Static, size-and-type only — the file *count* limit (Xero's 10/bill) can only be discovered at
 * attempt time from the provider's own listAttachments, so it is not checked here (#450). Reads
 * the same table as the attempt-time terminal classification via
 * lib/integrations/attach-limits.ts's attachmentLimitViolation (CODING_STANDARDS #16: one source
 * of truth). Pure — no I/O, no network. */
import { attachmentLimitViolation, type AttachProvider } from "@/lib/integrations/attach-limits"
import type { CheckResult } from "@/lib/checks/types"

export function checkAttachmentLimit(input: {
  provider: AttachProvider
  contentType: string
  sizeBytes: number
}): CheckResult | null {
  const violation = attachmentLimitViolation(input.provider, { contentType: input.contentType, sizeBytes: input.sizeBytes })
  if (!violation) return null
  return {
    checkCode: "attachment_limit",
    status: "warn",
    fields: [],
    message: `Source file won't attach after posting: ${violation.text}`,
    detail: { code: violation.code },
  }
}
