/** A6.8: portal-link following. Some suppliers email "your invoice is ready at
 * https://portal.example.com/inv/42.pdf" instead of attaching the PDF. When the URL is a
 * DIRECT unauthenticated .pdf link (Content-Type: application/pdf under the SSRF safety
 * checks), we fetch it and treat it as an attachment. Authenticated portals are out of scope
 * for this pass — those need per-vendor credentials the workspace has to configure.
 *
 * Extraction is conservative: we only follow links whose href literally ends in `.pdf`, live
 * on an https origin (assertUrlSafe already refuses http/private/loopback), and return
 * application/pdf on GET. Any other link is left alone. */

import { assertUrlSafe, UnsafeUrlError } from "@/lib/url-safety"

const MAX_LINK_BYTES = 25 * 1024 * 1024
const FETCH_TIMEOUT_MS = 8_000
const MAX_LINKS_PER_MAIL = 3

export type PortalCandidate = { url: string; filename: string; buffer: Buffer }

/** Find every candidate PDF URL in a body. Order-preserving, deduplicates on the URL. */
export function findPdfLinks(bodyText: string | null | undefined): string[] {
  if (!bodyText) return []
  const matches = [...bodyText.matchAll(/https:\/\/[^\s<>"']+?\.pdf\b/gi)]
  return [...new Set(matches.map((m) => m[0]))].slice(0, MAX_LINKS_PER_MAIL)
}

/** Fetch each candidate; skip anything that isn't a direct application/pdf response. Fetch
 * failures (SSRF refusal, timeout, non-2xx, oversize, wrong content-type) drop that link
 * silently — the intake keeps whatever attachments already came through. */
export async function fetchPortalPdfs(bodyText: string | null | undefined): Promise<PortalCandidate[]> {
  const urls = findPdfLinks(bodyText)
  if (!urls.length) return []
  const out: PortalCandidate[] = []
  for (const url of urls) {
    try {
      await assertUrlSafe(url)
    } catch (error) {
      if (!(error instanceof UnsafeUrlError)) console.error("[portal-links] unexpected assertUrlSafe error:", error)
      continue
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { accept: "application/pdf" } })
      clearTimeout(timer)
      if (!response.ok) continue
      const contentType = response.headers.get("content-type") ?? ""
      if (!contentType.toLowerCase().startsWith("application/pdf")) continue
      const contentLengthHeader = response.headers.get("content-length")
      if (contentLengthHeader && Number(contentLengthHeader) > MAX_LINK_BYTES) continue
      const arrayBuffer = await response.arrayBuffer()
      if (arrayBuffer.byteLength > MAX_LINK_BYTES) continue
      const filename = (new URL(url).pathname.split("/").pop() || "portal-invoice.pdf").replace(/[^\w.-]+/g, "-").slice(0, 80)
      out.push({ url, filename, buffer: Buffer.from(arrayBuffer) })
    } catch (error) {
      console.error("[portal-links] fetch failed for", url, error instanceof Error ? error.message : error)
    }
  }
  return out
}
