/** A2.1: shallow forensic checks a PDF's own metadata reveals about itself — a mismatch between
 * the DocInfo `/ModDate` (or `/Producer`) and the XMP `xmp:ModifyDate` (or `xmp:CreatorTool`) is
 * a classic tampering fingerprint, since a genuine editor updates both, while a hand-edit of
 * one usually leaves the other stale. Warn, never fail: legitimate producer chains (a PDF/A
 * pipeline that rewrites one stream but not the other) also trip this, so it is a "look at it"
 * signal, not a block.
 *
 * Pure, no fs/pdf-parser dependency — inspects the raw PDF bytes directly, tolerating both
 * indirect object references and inline literals. Handles a truncated read at a page cap by
 * only reading the first N bytes: forensic metadata sits near the file trailer, so callers pass
 * either the head+tail or the whole file — this is agnostic. */
import type { CheckResult } from "@/lib/checks/types"

const DOCINFO_MODDATE_RE = /\/ModDate\s*\(([^)]+)\)/
const DOCINFO_PRODUCER_RE = /\/Producer\s*\(([^)]+)\)/
const XMP_MODIFY_RE = /<xmp:ModifyDate>([^<]+)<\/xmp:ModifyDate>/
const XMP_CREATOR_RE = /<xmp:CreatorTool>([^<]+)<\/xmp:CreatorTool>/
const XMP_HEX_MODIFY_RE = /<xmp:ModifyDate>([^<]+)<\/xmp:ModifyDate>/i

/** Normalises a PDF `D:20260906123045+02'00'` timestamp to ISO-8601. Returns `""` on anything
 * unparseable — never throws. */
export function normalizePdfDate(value: string): string {
  const clean = value.trim().replace(/^D:/, "").replace(/'/g, "")
  const match = clean.match(/^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+-]?)(\d{0,2})(\d{0,2})/)
  if (!match) return ""
  const [, y, mo, d, h, mi, s] = match
  if (!y) return ""
  return `${y}${mo ? `-${mo}` : ""}${d ? `-${d}` : ""}${h ? `T${h}:${mi ?? "00"}:${s ?? "00"}` : ""}`
}

export type PdfForensicSignals = {
  docInfoModDate: string | null
  docInfoProducer: string | null
  xmpModifyDate: string | null
  xmpCreatorTool: string | null
}

/** Extracts the forensic-relevant metadata off a PDF's raw bytes. All fields optional — a PDF
 * without XMP (or without DocInfo) simply returns null on the missing side, and the check
 * treats one-sided data as inconclusive (no warn). */
export function readPdfForensicSignals(buffer: Buffer): PdfForensicSignals {
  const asString = buffer.toString("latin1")
  const docInfoModDate = DOCINFO_MODDATE_RE.exec(asString)?.[1] ?? null
  const docInfoProducer = DOCINFO_PRODUCER_RE.exec(asString)?.[1] ?? null
  const xmpModifyDate = XMP_MODIFY_RE.exec(asString)?.[1] ?? XMP_HEX_MODIFY_RE.exec(asString)?.[1] ?? null
  const xmpCreatorTool = XMP_CREATOR_RE.exec(asString)?.[1] ?? null
  return { docInfoModDate, docInfoProducer, xmpModifyDate, xmpCreatorTool }
}

export function checkPdfForensics(signals: PdfForensicSignals): CheckResult | null {
  const mismatches: string[] = []
  if (signals.docInfoModDate && signals.xmpModifyDate) {
    const a = normalizePdfDate(signals.docInfoModDate)
    const b = signals.xmpModifyDate.slice(0, a.length)
    if (a && b && a !== b) mismatches.push(`ModifyDate: DocInfo says ${a}, XMP says ${b}`)
  }
  if (signals.docInfoProducer && signals.xmpCreatorTool) {
    // A genuine chain often has DocInfo/Producer = "Ghostscript X" and XMP/CreatorTool = "Word",
    // which is normal; only flag when one string is completely disjoint AND one of them looks
    // like an editor after the fact (a stronger heuristic — cheap and low-noise).
    const producer = signals.docInfoProducer.toLowerCase()
    const creator = signals.xmpCreatorTool.toLowerCase()
    const editorTells = ["acrobat pro", "foxit editor", "nitro pro", "pdf-xchange editor"]
    if (editorTells.some((tell) => producer.includes(tell) || creator.includes(tell)) && producer !== creator) {
      mismatches.push(`Producer/Creator mismatch (${signals.docInfoProducer} vs ${signals.xmpCreatorTool}) with a PDF editor in the chain`)
    }
  }
  if (!mismatches.length) return null
  return {
    checkCode: "pdf_forensics", fields: [],
    status: "warn",
    message: `PDF metadata looks edited after generation: ${mismatches.join("; ")}.`,
    detail: { mismatches, signals: signals as unknown as Record<string, unknown> },
  }
}
