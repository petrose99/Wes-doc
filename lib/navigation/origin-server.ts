/** #268: the server half of the Origin seam — the one document lookup that turns a validated
 * `from` value into the strip's model. Kept apart from `origin.ts` because that module is
 * imported by client components (`withOrigin`) and must stay free of `prisma`. */

import { prisma } from "@/lib/db"
import { originLabel, readOrigin, withOrigin, type Origin } from "@/lib/navigation/origin"
import { documentDestinationPath } from "@/lib/typed-destinations"

/** A document's title/suffix for the strip's row segment — the same vendor/reference pair the
 * queues themselves show, read straight off the reviewed/raw extraction. */
export function rowFromDocument(doc: { filename: string; reviewedData: unknown; rawExtraction: unknown }): { title: string; suffix?: string } {
  const data = (doc.reviewedData ?? doc.rawExtraction ?? {}) as Record<string, unknown>
  const vendorValue = data.vendor ?? data.merchant ?? data.supplier ?? data.vendor_name
  const title = typeof vendorValue === "string" && vendorValue.trim() ? vendorValue.trim() : doc.filename
  const suffixValue = data.invoice_number ?? data.po_number ?? data.statement_period ?? data.receipt_number
  const suffix = typeof suffixValue === "string" && suffixValue.trim() ? suffixValue.trim() : undefined
  return { title, suffix }
}

/** Server-side: turns a validated `from` value into the strip's model (#268 spec §1). Pure over
 * the URL, with one optional document lookup for a `<queue>/<id>` or `?doc=<id>` origin — never a
 * client fetch. Never throws: a lookup failure just omits `row` (spec §5.12). */
export async function describeOrigin(workspaceId: string, from: string | null): Promise<Origin | null> {
  if (!from) return null
  const label = originLabel(from)
  if (!label) return null
  const [pathPart, queryString = ""] = from.split("?")
  const params = new URLSearchParams(queryString)

  if (label === "Search") {
    const q = params.get("q") ?? ""
    const filterCount = [...params.keys()].filter((key) => !["q", "page", "doc", "from"].includes(key)).length
    return { href: from, label, search: { q, filterCount } }
  }

  const segments = pathPart.split("/").filter(Boolean)
  const last = segments[segments.length - 1] ?? ""
  const trailingId = /^[a-z0-9-]{10,}$/i.test(last) && !(last in ORIGIN_SEGMENTS) ? last : null
  const docId = trailingId ?? params.get("doc")
  if (!docId) return { href: from, label }

  try {
    const doc = await prisma.document.findFirst({ where: { id: docId, workspaceId }, select: { filename: true, reviewedData: true, rawExtraction: true } })
    if (!doc) return { href: from, label }
    return { href: from, label, row: rowFromDocument(doc) }
  } catch {
    return { href: from, label }
  }
}

/** Path segments that look id-shaped by the regex above but are route names. */
const ORIGIN_SEGMENTS: Record<string, true> = { "purchase-orders": true, "bank-statements": true, "po-mismatches": true }

/** The row-notice model for a `?doc=` (or `gone=`) id that is not among the queue's rows (#268
 * spec §2.5 cases 2/3): the document moved to another queue, or it is gone. `null` when the id is
 * absent. Never throws. */
export async function describeMissingRow(
  workspaceId: string,
  opts: { docId: string | null; goneId: string | null; queueLabel: string; here: string; workspaceBase: string },
): Promise<{ text: string; showHref?: string } | null> {
  if (opts.goneId) return { text: "That document was deleted." }
  if (!opts.docId) return null
  try {
    const doc = await prisma.document.findFirst({
      where: { id: opts.docId, workspaceId },
      select: { id: true, filename: true, reviewedData: true, rawExtraction: true, docType: true, template: { select: { code: true } } },
    })
    if (!doc) return { text: "That document was deleted." }
    const row = rowFromDocument(doc)
    const name = row.suffix ? `${row.title} · ${row.suffix}` : row.title
    return { text: `${name} is no longer on ${opts.queueLabel}.`, showHref: withOrigin(documentDestinationPath(opts.workspaceBase, doc), opts.here) }
  } catch {
    return { text: "That document was deleted." }
  }
}

type SearchParamsRecord = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value
  return v ? v : null
}

export type QueueArrival = { origin: Origin | null; initialMissing: { text: string; showHref?: string } | undefined }

/** What a queue page needs on arrival (#268): the strip's model from `from=`, and the
 * missing-row notice when the addressed row (`/<queue>/<id>`, `?doc=`) is not among the rows or
 * `gone=<id>` says the document was deleted on the way (spec §3.0). One call per page; the
 * result goes straight to `QueueScreen`'s `origin` / `initialMissing` props. */
export async function queueArrival(
  workspaceId: string,
  opts: { searchParams: SearchParamsRecord; queuePath: string; selectedId: string | null; rowIds: Iterable<string>; decidedText?: string; missingText?: string },
): Promise<QueueArrival> {
  const workspaceBase = `/workspaces/${workspaceId}`
  const queueLabel = originLabel(`${workspaceBase}/${opts.queuePath}`) ?? opts.queuePath
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(opts.searchParams)) {
    const v = first(value)
    if (v && key !== "gone") query.set(key, v)
  }
  const qs = query.toString()
  const here = `${workspaceBase}/${opts.queuePath}${qs ? `?${qs}` : ""}`
  const origin = await describeOrigin(workspaceId, readOrigin(opts.searchParams, workspaceId))
  const docId = opts.selectedId ?? first(opts.searchParams.doc)
  const ids = new Set(opts.rowIds)
  const missing = docId && !ids.has(docId) ? docId : null
  const notice = missing && opts.missingText ? { text: opts.missingText } : await describeMissingRow(workspaceId, { docId: missing, goneId: first(opts.searchParams.gone), queueLabel, here, workspaceBase })
  const initialMissing = notice && opts.decidedText && notice.showHref ? { text: opts.decidedText, showHref: notice.showHref } : notice ?? undefined
  return { origin, initialMissing }
}
