/** Client-safe mirror of lib/document-processing.ts's PERMANENT_ERROR_CODES and
 * lib/document-transcription.ts's PERMANENT_ASR_ERROR_CODES. Those two live in server-only
 * modules (prisma, sharp, provider SDKs) that a "use client" component can't import, so the list
 * is duplicated here rather than shared — keep the three in sync when a new permanent code is
 * added. See the degraded-pipeline journey (docs/ux) for why the distinction matters: a transient
 * failure is the system's fault and heals itself; a permanent one needs the user to act, and no
 * retry button should pretend otherwise. */
const PERMANENT_ERROR_CODES = new Set([
  "document_source_missing",
  "pdf_page_limit_exceeded",
  "invalid_page_range",
  "page_range_matched_no_pages",
  "mineru_file_too_large",
  "mineru_page_limit_exceeded",
  "mineru_not_configured",
  "asr_not_configured",
  "asr_bad_request",
  "asr_auth_failed",
  "asr_audio_empty",
  "asr_audio_too_large",
])

/** Per-code copy for the permanent (non-retryable) failures — what happened and what to do about
 * it. Anything not listed here falls back to a generic "this file can't be processed" message
 * rather than surfacing the raw code. */
const PERMANENT_ERROR_COPY: Record<string, { message: string; action: string }> = {
  mineru_file_too_large: { message: "This file is too large to process.", action: "Split it into smaller files and upload again." },
  mineru_page_limit_exceeded: { message: "This file has too many pages to process.", action: "Split it into smaller files and upload again." },
  pdf_page_limit_exceeded: { message: "This PDF has too many pages to process.", action: "Split it into smaller files and upload again." },
  invalid_page_range: { message: "The page range on this document isn't valid.", action: "Check the page range and try again." },
  page_range_matched_no_pages: { message: "The page range on this document matched no pages.", action: "Check the page range and try again." },
  document_source_missing: { message: "The original file is missing and can't be re-processed.", action: "Upload it again." },
  mineru_not_configured: { message: "Document processing isn't set up for this workspace.", action: "Contact support." },
  asr_not_configured: { message: "Dictation isn't set up for this workspace.", action: "Contact support." },
  asr_bad_request: { message: "This recording couldn't be transcribed.", action: "Try recording it again." },
  asr_auth_failed: { message: "Dictation isn't set up correctly for this workspace.", action: "Contact support." },
  asr_audio_empty: { message: "This recording is empty.", action: "Record it again." },
  asr_audio_too_large: { message: "This recording is too long to transcribe.", action: "Record a shorter clip, or split it." },
}

export type DocumentErrorDescription =
  | { permanent: true; message: string; action: string }
  | { permanent: false; message: string }

/** What to tell a user about a document whose status is already "failed" — i.e. every automatic
 * retry has been exhausted (5 attempts) or the error code is one that will never heal on its own.
 * `permanent: false` means the errorCode itself isn't one of the never-heals codes — the failure
 * is overwhelmingly provider-side (OCR outage, LLM quota), not a problem with the document — so
 * the copy says so rather than accuse the file, and the caller should offer a manual Retry rather
 * than a dead end. It never claims an automatic retry is still coming: by the time a document
 * reaches "failed", the system has already stopped retrying it on its own. */
export function describeDocumentError(errorCode: string | null | undefined): DocumentErrorDescription {
  if (errorCode && PERMANENT_ERROR_CODES.has(errorCode)) {
    return { permanent: true, ...(PERMANENT_ERROR_COPY[errorCode] ?? { message: "This file can't be processed.", action: "Remove it or upload a different file." }) }
  }
  return { permanent: false, message: "We couldn't process this — the problem is on our side. It's safe and stored." }
}
