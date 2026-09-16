import { AdminPage, ModuleOff, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Empty, Ledger, LedgerRow, Panel } from "@/components/automation/automation-ui"
import { PoMismatchPolicy, type MismatchApproverOption } from "@/components/workspace/po-mismatch-policy"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { getOrCreateAutomationConfig } from "@/models/automation-config"
import { summarizeMatching } from "@/models/matching-metrics"

export const dynamic = "force-dynamic"

/** The pipeline's own match-type keys, said the way an accountant would say them. An unmapped key
 * falls back to its raw form rather than being hidden, so a new match type is visible immediately. */
const MATCH_KIND_LABELS: Record<string, string> = {
  two_way: "Two-way, invoice to order",
  three_way: "Three-way, order to invoice to receipt",
  // WP-AP1: current lib/matching/engine.ts enum values. Historic seed data still writes the
  // two_way/three_way strings above, so both vocabularies stay mapped here rather than migrating
  // one into the other.
  po_to_invoice: "Two-way, order to invoice",
  invoice_to_receipt: "Two-way, invoice to receipt",
  po_to_receipt: "Two-way, order to receipt",
}

/** #231 Q13 (#252): Admin › PO Mismatch Flows — the tolerances a match is judged by, then the
 * match history that was Controls › Matches as its read-only log. "Who approves a mismatch"
 * and the match-variance percent as a setting are #253's. */
export default async function PoMismatchFlowsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const paths = adminPaths(workspaceId)
  if (!context.capabilities.has("touchless-automation")) {
    return <AdminPage title="PO Mismatch Flows"><ModuleOff what="Touchless automation" href={paths.whatsOn} /></AdminPage>
  }
  const summary = await summarizeMatching(workspaceId)

  // #253: the match-variance percent is stored 0–1 (WorkspaceAutomationConfig.matchTolerance,
  // #228 Q12) and shown 0–100. Reading it through the same config row the gate reads means the
  // number on this page and the number the View PO row honours can never drift (#250 lesson).
  const automationConfig = await getOrCreateAutomationConfig(workspaceId)
  const storedTolerance = (automationConfig.matchTolerance ?? null) as { percent?: number } | null
  const matchVariancePercent = Math.round((storedTolerance?.percent ?? 0.02) * 1000) / 10
  // Pruned to current members, the same way canOverrideMismatch reads it: a person who has left
  // no longer counts on the gate, so the page must not list them as in force either.
  const memberIds = new Set(context.members.map((member) => member.userId))
  const approverIds = ((context.workspace.poMismatchApproverIds ?? []) as string[]).filter((id) => memberIds.has(id))
  const approverOptions: MismatchApproverOption[] = context.members.map((member) => ({
    id: member.userId,
    name: member.user.name ?? "",
    email: member.user.email ?? "",
    role: member.role === "owner" ? "owner" : "member",
  }))

  const maxBucket = Math.max(1, ...summary.confidenceBuckets.map((b) => b.count))
  const reconciledPct = summary.bankAccepted > 0 ? Math.round((summary.bankReconciled / summary.bankAccepted) * 100) : 0
  const resolved = summary.byStatus.resolved ?? 0
  const pending = summary.byStatus.pending ?? 0
  const byType = Object.entries(summary.byType)

  return <AdminPage title="PO Mismatch Flows" intro="How far an invoice may differ from its purchase order before the row shows a mismatch, who may let a mismatched invoice through, and the record of every match the pipeline has proposed.">
    {!context.owner && <ReadOnlyBand owners={context.owners} />}

    <PoMismatchPolicy
      workspaceId={workspaceId}
      quantityPercent={context.workspace.poQuantityTolerancePercent}
      matchVariancePercent={matchVariancePercent}
      members={approverOptions}
      approverIds={approverIds}
      readOnly={!context.owner} />

    <Panel title="Match history" note="Documents the pipeline tied to each other, and how far the bank lines it accepted have gone toward reconciled.">
    {summary.total === 0 && summary.bankTotal === 0
      ? <Empty title="No matches yet">
          Matches appear once there are two documents to tie together — a purchase order and its invoice,
          or a bank statement and the invoice it paid.
        </Empty>
      : <>
        <section className="grid gap-x-10 gap-y-4 md:grid-cols-2 md:items-start">
          <p className="max-w-[52ch] text-sm leading-relaxed text-slate-700">
            <span className="font-semibold tabular-nums text-slate-900">{resolved}</span> of the {summary.total} {summary.total === 1 ? "match" : "matches"} the pipeline proposed {resolved === 1 ? "has" : "have"} been settled.{" "}
            {pending > 0 ? `${pending} still ${pending === 1 ? "waits" : "wait"} on a decision.` : "Nothing is waiting on a decision."}
          </p>
          <div className="max-w-[52ch]">
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
          <Panel level="h3" title="Document matches" note="Two- and three-way ties between purchase orders, invoices and receipts.">
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

          <Panel level="h3" title="Bank reconciliation" note="Statement lines matched to an invoice or receipt, and how far each got.">
            <Ledger>
              <LedgerRow label="Suggested by the pipeline" value={summary.bankTotal} state="idle" />
              <LedgerRow label="Accepted by a person" value={summary.bankAccepted} state={summary.bankAccepted > 0 ? "waiting" : "idle"} />
              <LedgerRow label="Reconciled in the ledger" value={summary.bankReconciled} state={summary.bankReconciled > 0 ? "auto" : "idle"} />
            </Ledger>
          </Panel>
        </div>

        <Panel level="h3" title="How confident the matches were" note="Document matches grouped by the score the pipeline gave them.">
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
    </Panel>
  </AdminPage>
}
