import { NextResponse } from "next/server"
import { applyStop } from "@/lib/notices/stop-state"

/** The one write behind "Stop these emails" (#271). POSTed by the confirm page's form and by
 * RFC 8058 one-click clients (the List-Unsubscribe header points here). The token may arrive in
 * the query (one-click clients POST the header URL verbatim) or the form body (the page's hidden
 * field); either is verified again here. Always 303 back to the page so a reload of the result
 * never re-submits. A GET here is a scanner or a curious paste: redirect to the read-only page
 * and change nothing. */

function pageUrl(request: Request, params: Record<string, string>): URL {
  const url = new URL("/notices/stop", request.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url
}

export async function GET(request: Request) {
  const t = new URL(request.url).searchParams.get("t") ?? ""
  return NextResponse.redirect(pageUrl(request, t ? { t } : {}), 303)
}

export async function POST(request: Request) {
  const fromQuery = new URL(request.url).searchParams.get("t")
  let fromBody: string | null = null
  const contentType = request.headers.get("content-type") ?? ""
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    try {
      const body = await request.formData()
      const value = body.get("t")
      fromBody = typeof value === "string" ? value : null
    } catch {
      fromBody = null
    }
  }
  const token = fromBody || fromQuery || undefined
  let result: "done" | "invalid"
  try {
    result = await applyStop(token)
  } catch (error) {
    console.warn("[approval-notices] stop write failed:", error instanceof Error ? error.message : error)
    return NextResponse.redirect(pageUrl(request, token ? { t: token, error: "1" } : {}), 303)
  }
  if (result === "invalid") return NextResponse.redirect(pageUrl(request, {}), 303)
  return NextResponse.redirect(pageUrl(request, { done: "1", t: token! }), 303)
}
