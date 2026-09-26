/** Renders the file that actually gets attached to a posted bill, per ADR 0016: a split child
 * attaches only its own pages (cut into a new PDF), and HEIC/WEBP are converted to JPEG for the
 * attach only — the stored Source file is never touched. Pure function first (`renderSource
 * FileForAttach`, testable with tiny in-memory fixtures), I/O wrapper second (`loadAttachment
 * Rendition`, the one function attemptIntegrationAttachment actually calls). */

import sharp from "sharp"
import { PDFDocument } from "pdf-lib"
import { parsePageRange } from "@/lib/page-range"
import { readDocumentSource } from "@/lib/document-storage"
import { IntegrationPermanentError } from "@/lib/integrations/errors"

const CONVERT_TO_JPEG_TYPES = new Set(["image/heic", "image/webp"])

/** Xero rejects these characters in a filename (#450). Stripped, not replaced, so the result
 * stays close to the original name; an empty result falls back to a generic name rather than
 * uploading a blank string. */
const XERO_FORBIDDEN_CHARS = /[<>:"/\\|?*\0+]/g

/** Strips the Xero-forbidden characters from the Document's filename for use as the fixed
 * attachment name. Falls back to "source-file" plus the original extension (if any) when
 * stripping leaves nothing usable. */
export function fixedAttachFilename(documentFilename: string): string {
  const stripped = documentFilename.replace(XERO_FORBIDDEN_CHARS, "")
  if (stripped.trim().length > 0) return stripped
  const extension = documentFilename.match(/\.[^./\\<>:"|?*\0+]+$/)?.[0] ?? ""
  return `source-file${extension}`
}

/** Pure over a buffer already in memory: cuts `pageRange` out of a PDF with pdf-lib when the
 * document is a split child (`mimeType === "application/pdf" && pageRange`), converts HEIC/WEBP
 * to JPEG via sharp, and passes anything else through unchanged. No storage, no network. */
export async function renderSourceFileForAttach(input: {
  buffer: Buffer
  mimeType: string
  pageRange: string | null
}): Promise<{ buffer: Buffer; contentType: string }> {
  const pages = input.mimeType === "application/pdf" ? parsePageRange(input.pageRange) : null
  if (pages) {
    const source = await PDFDocument.load(input.buffer)
    const child = await PDFDocument.create()
    // pdf-lib pages are 0-indexed; parsePageRange's are 1-indexed.
    const copied = await child.copyPages(source, pages.map((page) => page - 1))
    copied.forEach((page) => child.addPage(page))
    return { buffer: Buffer.from(await child.save()), contentType: "application/pdf" }
  }
  if (CONVERT_TO_JPEG_TYPES.has(input.mimeType)) {
    const buffer = await sharp(input.buffer).rotate().jpeg().toBuffer()
    return { buffer, contentType: "image/jpeg" }
  }
  return { buffer: input.buffer, contentType: input.mimeType }
}

/** The thin I/O wrapper attemptIntegrationAttachment calls: reads the Source file from storage,
 * renders it for the attach, and fixes its filename. Throws IntegrationPermanentError
 * ("attach_source_missing") when the document has no storageKey left — the source is no longer
 * stored, which the ADR treats as a permanent failure, never a retry. */
export async function loadAttachmentRendition(document: {
  storageKey: string | null
  mimeType: string
  pageRange: string | null
  filename: string
}): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  if (!document.storageKey) throw new IntegrationPermanentError("attach_source_missing")
  const source = await readDocumentSource(document.storageKey)
  const rendition = await renderSourceFileForAttach({
    buffer: source,
    mimeType: document.mimeType,
    pageRange: document.pageRange,
  })
  return { ...rendition, fileName: fixedAttachFilename(document.filename) }
}
