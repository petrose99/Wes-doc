/** #244 (map #226): every hop — an in-app link that opens a row on a *different* surface —
 * carries the origin surface's address as it stood in a `from=` search param, so the arrival
 * surface can render the one Origin link. Opening a row's pane on the same queue is not a hop
 * and carries nothing. The Origin link itself is #268's to render; this is the seam every link
 * that hops writes to. */

import { prisma } from "@/lib/db"
import { documentDestinationPath } from "@/lib/typed-destinations"

const FROM_PARAM = "from"
const MAX_FROM_LENGTH = 2048

/** Appends `from=<origin>` to an in-app href. `origin` is the current path plus its query
 * (`usePathname()` + `useSearchParams()` on the client, the page's own path on the server); a
 * missing origin leaves the href untouched. */
export function withOrigin(href: string, origin: string | null | undefined): string {
  if (!origin || !href.startsWith("/")) return href
  const [path, query = ""] = href.split("?")
  const params = new URLSearchParams(query)
  params.set(FROM_PARAM, origin)
  let value = origin
  // #268 spec §3: the outermost `from` is dropped first, keeping the nearest origin, when
  // chaining would push the href past the cap.
  while (`${path}?${(() => { params.set(FROM_PARAM, value); return params.toString() })()}`.length > MAX_FROM_LENGTH) {
    const chainedFrom = new URLSearchParams(value.split("?")[1] ?? "").get(FROM_PARAM)
    if (!chainedFrom) break
    const [innerPath] = value.split("?")
    value = innerPath
  }
  params.set(FROM_PARAM, value)
  return `${path}?${params.toString()}`
}

/** Appends `key=value` to an in-app href, alongside whatever it already carries. */
export function withParam(href: string, key: string, value: string): string {
  const [path, query = ""] = href.split("?")
  const params = new URLSearchParams(query)
  params.set(key, value)
  return `${path}?${params.toString()}`
}

/** The origin an arrival surface reads back, validated to an in-app path in the *current*
 * workspace so a crafted link can never send the Origin link off-site or into another workspace
 * (#268 spec §1). Silent `null` on anything suspect — a tampered param is not the user's problem
 * to solve. */
export function readOrigin(
  searchParams: { get(name: string): string | null } | Record<string, string | string[] | undefined>,
  workspaceId?: string,
): string | null {
  const raw = "get" in searchParams && typeof searchParams.get === "function" ? searchParams.get(FROM_PARAM) : (searchParams as Record<string, string | string[] | undefined>)[FROM_PARAM]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return null
  if (value.length > MAX_FROM_LENGTH) return null
  if (!value.startsWith("/") || value.startsWith("//")) return null
  if (value.includes("\\")) return null
  if (value.split(/[/?]/).some((segment) => segment === "..")) return null
  if (workspaceId && !value.startsWith(`/workspaces/${workspaceId}/`)) return null
  return value
}

/** The rail label for a validated origin path — the same strings `sidebar.tsx` renders (#268
 * spec §1, B3: one term per destination). An unmapped path is not a valid origin: the caller
 * treats a `null` return as "hide the strip", never as "previous page". */
const ORIGIN_LABELS: Record<string, string> = {
  invoices: "Invoices",
  "purchase-orders": "Purchase Orders",
  receipts: "Receipts",
  "bank-statements": "Bank Statements",
  exceptions: "Exceptions",
  "approvals/invoices": "Approvals",
  "approvals/po-mismatches": "Approvals",
  finance: "Finance",
  search: "Search",
}

export function originLabel(path: string): string | null {
  const withoutQuery = path.split("?")[0]
  const match = /^\/workspaces\/[^/]+\/(.+)$/.exec(withoutQuery)
  if (!match) return null
  const rest = match[1]
  for (const [key, label] of Object.entries(ORIGIN_LABELS)) {
    if (rest === key || rest.startsWith(`${key}/`)) return label
  }
  return null
}

export type Origin = {
  href: string
  label: string
  row?: { title: string; suffix?: string }
  search?: { q: string; filterCount: number }
}

/** A document's title/suffix for the strip's row segment — the same vendor/reference pair the
 * queues themselves show, read straight off the reviewed/raw extraction. */
function rowFromDocument(doc: { filename: string; reviewedData: unknown; rawExtraction: unknown }): { title: string; suffix?: string } {
  const data = (doc.reviewedData ?? doc.rawExtraction ?? {}) as Record<string, unknown>
  const vendorValue = data.vendor ?? data.merchant
  const title = typeof vendorValue === "string" && vendorValue.trim() ? vendorValue.trim() : doc.filename
  const suffixValue = data.invoice_number ?? data.po_number ?? data.statement_period
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
  const trailingId = /^[a-z0-9-]{10,}$/i.test(segments[segments.length - 1] ?? "") ? segments[segments.length - 1] : null
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

/** Every path `documentDestinationPath` can return, mapped to the label the strip shows — used
 * both to build the standalone page's no-`from` fallback and to assert (in tests) that the map
 * never falls through to "hidden" there. */
export function labelForDestinationPath(destinationPath: string): string {
  return originLabel(destinationPath) ?? "Invoices"
}

export { documentDestinationPath }
