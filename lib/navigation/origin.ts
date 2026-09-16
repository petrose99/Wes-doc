/** #244 (map #226): every hop — an in-app link that opens a row on a *different* surface —
 * carries the origin surface's address as it stood in a `from=` search param, so the arrival
 * surface can render the one Origin link. Opening a row's pane on the same queue is not a hop
 * and carries nothing. The Origin link itself is #249's to render; this is the seam every link
 * that hops writes to. */

const FROM_PARAM = "from"

/** Appends `from=<origin>` to an in-app href. `origin` is the current path plus its query
 * (`usePathname()` + `useSearchParams()` on the client, the page's own path on the server); a
 * missing origin leaves the href untouched. */
export function withOrigin(href: string, origin: string | null | undefined): string {
  if (!origin || !href.startsWith("/")) return href
  const [path, query = ""] = href.split("?")
  const params = new URLSearchParams(query)
  params.set(FROM_PARAM, origin)
  return `${path}?${params.toString()}`
}

/** The origin an arrival surface reads back, validated to an in-app path so a crafted link can
 * never send the Origin link off-site. */
export function readOrigin(searchParams: { get(name: string): string | null } | Record<string, string | string[] | undefined>): string | null {
  const raw = "get" in searchParams && typeof searchParams.get === "function" ? searchParams.get(FROM_PARAM) : (searchParams as Record<string, string | string[] | undefined>)[FROM_PARAM]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null
  return value
}
