/** One source of truth for the QBO/Xero/DocuBite size-and-type table from #450's resolution
 * comment, so the pre-post warn Check (lib/checks/attachment-limit.ts) and the attempt-time
 * terminal-failure classification (attemptIntegrationAttachment) can never disagree (CODING_
 * STANDARDS #16). File *count* (Xero's 10-per-bill cap) is not covered here — it can only be
 * known at attempt time, from the provider's own listAttachments count. */

export type AttachProvider = "quickbooks" | "xero"

const QBO_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/gif",
])

const XERO_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/gif"])

const QBO_MAX_BYTES = 100 * 1024 * 1024
const XERO_MAX_BYTES = 10 * 1024 * 1024
/** DocuBite's own ceiling ahead of either provider's, per #450's table. */
export const DOCUBITE_MAX_BYTES = 50 * 1024 * 1024

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

/** The provider's own type/size limits, applied to the file as it will actually be uploaded
 * (post-rendition: a split child's cut PDF, a HEIC/WEBP image already converted to JPEG) —
 * never the stored original. Returns null when the file is within both the ledger's and
 * DocuBite's own limits. */
export function attachmentLimitViolation(
  provider: AttachProvider,
  file: { contentType: string; sizeBytes: number },
): { code: string; text: string } | null {
  if (file.sizeBytes > DOCUBITE_MAX_BYTES) {
    return { code: "attach_oversize", text: `DocuBite attaches files up to ${formatMb(DOCUBITE_MAX_BYTES)}; this one is ${formatMb(file.sizeBytes)}.` }
  }
  const ledgerName = provider === "quickbooks" ? "QuickBooks" : "Xero"
  const maxBytes = provider === "quickbooks" ? QBO_MAX_BYTES : XERO_MAX_BYTES
  const types = provider === "quickbooks" ? QBO_TYPES : XERO_TYPES
  if (!types.has(file.contentType)) {
    return { code: "attach_invalid_type", text: `${ledgerName} doesn't take this file type.` }
  }
  if (file.sizeBytes > maxBytes) {
    return { code: "attach_oversize", text: `${ledgerName} takes files up to ${formatMb(maxBytes)}; this one is ${formatMb(file.sizeBytes)}.` }
  }
  return null
}
