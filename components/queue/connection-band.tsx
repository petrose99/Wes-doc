import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import type { LedgerBandStatus } from "@/lib/integration-push"

const COPY: Record<LedgerBandStatus, string> = {
  disconnected: "No ledger connected — posts are waiting.",
  needs_reauth: "Ledger needs reauthorization — posts are waiting.",
  no_default_account: "Ledger has no default account set — posts are waiting.",
}

/** "disconnected" now also covers the (post-#380) default case of never having had a
 * connection — "Reconnect" would misstate that, so it gets the same "Connect" label the
 * Finance/Accounting page's own button uses (#380's one-term rule: connect the ledger,
 * once, in one word). The other two statuses did have a connection, so "Reconnect" still fits. */
const LINK_LABEL: Record<LedgerBandStatus, string> = {
  disconnected: "Connect",
  needs_reauth: "Reconnect",
  no_default_account: "Reconnect",
}

/** #281 spec.md §6: the queue-scoped connection-failure band — same structural family as
 * `OriginStrip` (full-width, `min-h-11`/`md:h-8`, border-bottom) but amber, and not a link: per
 * the glossary, "it never marks rows; it is said once, above the queue, while posts are
 * waiting." Not dismissible — it reflects live connection state, so it reappears every visit
 * while the condition holds, not just once. */
export function ConnectionBand({ status, workspaceId, isOwner }: {
  status: LedgerBandStatus | null
  workspaceId: string
  isOwner: boolean
}) {
  if (!status) return null
  return <div role="status" className="flex h-auto min-h-11 w-full items-center gap-1.5 whitespace-nowrap border-b border-amber-200 bg-amber-50 px-4 text-sm text-amber-900 md:h-8 md:min-h-0">
    <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
    <span className="min-w-0 flex-1 truncate font-medium">{COPY[status]}</span>
    {isOwner
      ? <Link href={`/workspaces/${workspaceId}/admin/integrations`}
          className="shrink-0 rounded-sm font-medium underline decoration-amber-400 underline-offset-2 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1">
          {LINK_LABEL[status]}
        </Link>
      : <span className="shrink-0 text-amber-700">Ask an owner</span>}
  </div>
}
