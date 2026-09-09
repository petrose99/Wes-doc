import { AutomationFrame, Empty, Figure, Ledger, LedgerRow, Panel } from "@/components/automation/automation-ui"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { summarizeMatching } from "@/models/matching-metrics"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"

export const dynamic = "force-dynamic"

/** The pipeline's own match-type keys, said the way an accountant would say them. An unmapped key
 * falls back to its raw form rather than being hidden, so a new match type is visible immediately. */
const MATCH_KIND_LABELS: Record<string, string> = {
  two_way: "Two-way, invoice to order",
  three_way: "Three-way, order to invoice to receipt",
}

/** Phase 4 visibility, folded into /automation as the "Matches" tab: DocumentMatch rollup +
 * BankMatch reconciliation state. */
export default async function AutomationMatchesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const [summary, reviewCount] = await Promise.all([
    summarizeMatching(workspaceId),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
  ])

  const maxBucket = Math.max(1, ...summary.confidenceBuckets.map((b) => b.count))
  const reconciledPct = summary.bankAccepted > 0 ? Math.round((summary.bankReconciled / summary.bankAccepted) * 100) : 0
  const resolved = summary.byStatus.resolved ?? 0
  const pending = summary.byStatus.pending ?? 0
  const byType = Object.entries(summary.byType)

  return <AutomationFrame
    workspaceId={workspaceId}
    active="matches"
    reviewCount={reviewCount}
    reviewEnabled={reviewEnabled}
    status="Documents the pipeline tied to each other, and how far the bank lines it accepted have gone toward reconciled."
  >
    {summary.total === 0 && summary.bankTotal === 0
      ? <Empty title="No matches yet">
          Matches appear once there are two documents to tie together — a purchase order and its invoice,
          or a bank statement and the invoice it paid.
        </Empty>
      : <>
        <section className="grid gap-8 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:items-center">
          <Figure
            value={`${resolved}`}
            state={resolved > 0 ? "auto" : "idle"}
            caption={<>
              {resolved === 1 ? "match has been settled" : "matches have been settled"} out of {summary.total} the
              pipeline proposed. {pending > 0 ? `${pending} still waiting on a decision.` : "Nothing is waiting on a decision."}
            </>}
          />
          <div className="rounded-md border border-[#e6ebf1] p-5">
            {summary.bankAccepted === 0
              ? <p className="text-sm text-slate-600">
                  No bank lines have been accepted yet. Once someone accepts a suggested match, this tracks
                  how many of them reach reconciled in the ledger.
                </p>
              : <>
                  <p className="text-sm text-slate-600">
                    Of the {summary.bankAccepted} bank {summary.bankAccepted === 1 ? "line" : "lines"} someone accepted,{" "}
                    <span className="font-semibold text-slate-900">{summary.bankReconciled}</span>{" "}
                    {summary.bankReconciled === 1 ? "has" : "have"} made it all the way to reconciled in the ledger.
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-emerald-600" style={{ width: `${reconciledPct}%` }} />
                  </div>
                  <p className="mt-2 text-xs tabular-nums text-slate-500">{reconciledPct}% of accepted lines reconciled</p>
                </>}
          </div>
        </section>

        <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
          <Panel title="Document matches" note="Two- and three-way ties between purchase orders, invoices and receipts.">
            <Ledger>
              <LedgerRow label="Settled" value={resolved} state="auto" />
              <LedgerRow label="Waiting on a decision" value={pending} state={pending > 0 ? "waiting" : "idle"} />
            </Ledger>
            {byType.length > 0 && <>
              <h3 className="mb-3 mt-7 text-[13px] font-medium text-slate-500">The same matches, by what they tie together</h3>
              <Ledger>
                {byType.map(([type, count]) => (
                  <LedgerRow key={type} label={MATCH_KIND_LABELS[type] ?? type} value={count} state="idle" />
                ))}
              </Ledger>
            </>}
          </Panel>

          <Panel title="Bank reconciliation" note="Statement lines matched to an invoice or receipt, and how far each got.">
            <Ledger>
              <LedgerRow label="Suggested by the pipeline" value={summary.bankTotal} state="idle" />
              <LedgerRow label="Accepted by a person" value={summary.bankAccepted} state={summary.bankAccepted > 0 ? "waiting" : "idle"} />
              <LedgerRow label="Reconciled in the ledger" value={summary.bankReconciled} state={summary.bankReconciled > 0 ? "auto" : "idle"} />
            </Ledger>
          </Panel>
        </div>

        <Panel title="How confident the matches were" note="Document matches grouped by the score the pipeline gave them.">
          {summary.total === 0
            ? <Empty title="Nothing to plot yet">
                Confidence bands fill in as soon as the pipeline generates its first match candidates.
              </Empty>
            : <Ledger>
                {summary.confidenceBuckets.map((b) => (
                  <LedgerRow
                    key={b.label}
                    label={b.label}
                    value={b.count}
                    share={b.count / maxBucket}
                    state={b.count > 0 ? "auto" : "idle"}
                  />
                ))}
              </Ledger>}
        </Panel>
      </>}
  </AutomationFrame>
}
