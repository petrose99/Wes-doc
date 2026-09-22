import { Button } from "@/components/ui/button"
import { Panel } from "@/components/automation/automation-ui"
import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"

/** Finance is the workspace's ledger surface — a first-class destination alongside Documents and
 * Worksheets, not a side "Accounting" utility. Route moved from /accounting; old URL redirects here.
 *
 * #380: the in-house Bigcapital ledger (the only provider this page ever drove) is gone — the
 * owner ruled its data demo-only. Connecting an external ledger (QuickBooks, Xero) from here lands
 * in a later ticket; until then this page is the glossary's definition of Accounting and nothing
 * more: says once that no ledger is connected, and offers a Connect button that is the only thing
 * on the page — disabled, with the reason. */
export default async function FinancePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)

  return <main className="space-y-8">
    <header>
      <h1 className="text-2xl font-bold text-slate-900">Finance</h1>
      <p className="mt-1 max-w-xl text-sm text-slate-500">Your workspace&apos;s ledger connection — coded accounts and vendors, ready for documents to push into.</p>
      {membership.role !== "owner" && <p className="mt-2 text-xs text-slate-400">Only workspace owners can manage this connection.</p>}
    </header>
    <Panel title="Ledger connection">
      <p className="text-sm text-slate-600">No ledger is connected yet.</p>
      <div className="mt-3">
        <Button type="button" disabled title="Connecting a ledger is coming soon">Connect</Button>
      </div>
    </Panel>
  </main>
}
