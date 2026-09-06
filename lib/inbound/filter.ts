/** A6.3 + A6.4 + A6.5: attachment/body filtering for inbound email. Pure. Three heuristics:
 *
 * - shouldSkipAttachment: drops inline signature images (Content-Disposition: inline + < 50 KB)
 *   BEFORE they hit isSupportedDocumentBuffer, so a small email logo isn't logged as a
 *   "rejected attachment" that pollutes the intake dashboard.
 * - classifyIntent: cheap deterministic label (invoice/receipt/statement/remittance/noise)
 *   from subject + first N chars of body, so a noise mail can skip the OCR budget entirely.
 * - extractOriginalSender: pulls the original sender out of a forwarded email chain by
 *   scanning the quoted body for a `From:` header, so a bookkeeper's forward is attributed
 *   to the actual supplier, not the bookkeeper. */

const INLINE_IMAGE_MAX_BYTES = 50 * 1024

const CLASSIFICATION_HINTS: Array<{ intent: EmailIntent; keywords: string[] }> = [
  { intent: "remittance", keywords: ["remittance advice", "payment advice", "remittance"] },
  { intent: "statement", keywords: ["statement of account", "monthly statement", "bank statement", "account statement"] },
  { intent: "invoice", keywords: ["invoice", "bill", "amount due", "tax invoice", "invoice attached"] },
  { intent: "receipt", keywords: ["receipt", "order confirmation", "purchase confirmation", "your order"] },
]

const NOISE_HINTS = [
  "unsubscribe", "newsletter", "webinar", "out of office", "auto-reply", "automatic reply",
  "meeting request", "calendar invite", "job alert", "sale ends", "%%OFF", "% off",
]

export type EmailIntent = "invoice" | "receipt" | "statement" | "remittance" | "noise" | "unknown"

export type AttachmentLike = {
  filename: string
  contentType: string
  sizeBytes: number
  contentId?: string | null
  contentDisposition?: string | null
}

export function shouldSkipAttachment(attachment: AttachmentLike): boolean {
  const disposition = (attachment.contentDisposition ?? "").toLowerCase()
  const isInline = disposition.startsWith("inline") || Boolean(attachment.contentId)
  const isImage = attachment.contentType.toLowerCase().startsWith("image/")
  return isInline && isImage && attachment.sizeBytes > 0 && attachment.sizeBytes < INLINE_IMAGE_MAX_BYTES
}

export function classifyIntent(subject: string | null | undefined, bodyPreview: string | null | undefined): EmailIntent {
  const haystack = `${subject ?? ""}\n${bodyPreview ?? ""}`.toLowerCase().slice(0, 4000)
  if (!haystack.trim()) return "unknown"
  if (NOISE_HINTS.some((hint) => haystack.includes(hint.toLowerCase()))) return "noise"
  for (const { intent, keywords } of CLASSIFICATION_HINTS) {
    if (keywords.some((k) => haystack.includes(k))) return intent
  }
  return "unknown"
}

/** Finds the innermost "From: name <addr@host>" header inside a forwarded email body. Returns
 * the plain address, or null when no forwarded header is present. */
export function extractOriginalSender(bodyText: string | null | undefined): string | null {
  if (!bodyText) return null
  // Match "From:" lines inside quoted bodies — the LAST one is the deepest original.
  const matches = [...bodyText.matchAll(/^[\s>]*From:\s*.*?<?([\w.%+-]+@[\w.-]+\.[A-Za-z]{2,})>?/gmi)]
  if (!matches.length) return null
  return matches[matches.length - 1][1].toLowerCase()
}
