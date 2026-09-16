/** #244 (map #226): every hop — an in-app link that opens a row on a *different* surface —
 * carries the origin surface's address as it stood in a `from=` search param, so the arrival
 * surface can render the one Origin link. Opening a row's pane on the same queue is not a hop
 * and carries nothing. The Origin link itself is #268's to render; this is the seam every link
 * that hops writes to. */

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
  // documentDestinationPath's untyped fallback (`library/documents/<id>`); the rail calls it Archive (#245).
  library: "Archive",
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

/** Every path `documentDestinationPath` can return, mapped to the label the strip shows — used
 * both to build the standalone page's no-`from` fallback and to assert (in tests) that the map
 * never falls through to "hidden" there. */
export function labelForDestinationPath(destinationPath: string): string {
  return originLabel(destinationPath) ?? "Invoices"
}

export { documentDestinationPath }
