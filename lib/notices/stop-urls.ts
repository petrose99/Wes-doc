import config from "@/lib/config"

/** The two "Stop these emails" URLs for #271's Approval notice. The footer link a human clicks is
 * the GET confirm page (`/notices/stop?t=`) — GET never writes, because mail scanners, Safe Links
 * and unfurlers GET every URL in a message. RFC 8058 one-click clients POST the List-Unsubscribe
 * URL instead, so that header points straight at the POST route (`/notices/stop/confirm`), which
 * is the same handler the confirm page's form submits to. Next forbids `page.tsx` and `route.ts`
 * in one segment, hence the `/confirm` child. */
export function stopPageUrl(token: string): string {
  return `${config.app.baseURL}/notices/stop?t=${encodeURIComponent(token)}`
}

export function stopPostUrl(token: string): string {
  return `${config.app.baseURL}/notices/stop/confirm?t=${encodeURIComponent(token)}`
}

export function stopHeaders(token: string): Record<string, string> {
  return { "List-Unsubscribe": `<${stopPostUrl(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
}
