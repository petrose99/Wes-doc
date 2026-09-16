import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Empty, Figure, Panel, Pill, Sheet, Th } from "@/components/automation/automation-ui"
import { VendorHistorySheet } from "@/components/automation/vendor-history-sheet"
import { SupplierPaymentsSettings, type SupplierPaymentsRow } from "@/components/settings/payments-settings"
import { AutomationRuleActiveToggle } from "@/components/workspace/automation-rule-row"
import { AutomationRuleForm } from "@/components/workspace/automation-rule-form"
import { getAdminContext } from "@/lib/admin/context"
import { getSupplierTrust, type SupplierTrustRow } from "@/lib/analytics/workspace-analytics"
import { resolveAccountOptions } from "@/lib/automation/account-options"
import type { RuleActions, RuleMatcher } from "@/lib/automation/rules"
import { HISTORY_APPLY_THRESHOLDS } from "@/lib/automation/vendor-history"
import { prisma } from "@/lib/db"
import { decimalToNumber } from "@/lib/money"
import { SUPPLIER_COLD_START_COUNT, SUPPLIER_TRUST_STREAK } from "@/lib/readiness/supplier-thresholds"
import { listAccountingEntities } from "@/models/accounting-entities"
import { listAutomationRules, listPinnedRuleIdsBySupplier } from "@/models/automation-rules"
import { summarizeVendorHistory } from "@/models/vendor-history"
import { updateSupplierPaymentsAction } from "@/app/(app)/workspaces/[workspaceId]/(chrome)/settings/payments/actions"

export const dynamic = "force-dynamic"

/** One supplier's standing in the trust ladder — answers "why is this supplier still going to
 * review, and how much longer" without anyone reading the readiness code. */
function SupplierRow({ row }: { row: SupplierTrustRow }) {
  const standing = row.coldStart
    ? { state: "waiting" as const, label: "Still new" }
    : row.trusted
      ? { state: "auto" as const, label: "Trusted" }
      : { state: "idle" as const, label: "Building trust" }
  return <tr>
    <td className="py-2.5 pr-4 font-medium text-slate-900">{row.name}</td>
    <td className="py-2.5 pr-4"><Pill state={standing.state}>{standing.label}</Pill></td>
    <td className="py-2.5 pr-4 text-slate-600">
      {row.coldStart
        ? `${row.remainingToGraduate} more document${row.remainingToGraduate === 1 ? "" : "s"} reviewed by a person`
        : "None — past the new-supplier period"}
    </td>
    <td className="py-2.5 pr-4 tabular-nums text-slate-600">{row.consecutiveClean} of {SUPPLIER_TRUST_STREAK}</td>
    <td className="py-2.5 text-right tabular-nums text-slate-600">{row.effectiveMinConfidence.toFixed(2)}</td>
  </tr>
}

/** #231 Q10 (#252): Admin › Suppliers — everything supplier-shaped on one page, in one word
 * ("supplier"; the old pages said "vendor" on one tab and "supplier" on the next): trust
 * (may this supplier's documents skip review), coding history (what gets filled in), coding
 * rules (Settings › Rules), and payment terms and bank details (Settings › Payments). Each
 * panel renders only with the module that feeds it. */
export default async function SuppliersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const { owner, capabilities } = context
  const hasTouchless = capabilities.has("touchless-automation")
  const hasRules = capabilities.has("supplier-rules")

  const [history, trust, pinnedRuleIds, rules, accountingEntities, suppliers] = await Promise.all([
    hasTouchless ? summarizeVendorHistory(workspaceId) : Promise.resolve([]),
    hasTouchless ? getSupplierTrust(workspaceId) : Promise.resolve([]),
    hasTouchless && owner ? listPinnedRuleIdsBySupplier(workspaceId) : Promise.resolve(new Map<string, string>()),
    hasRules ? listAutomationRules(workspaceId) : Promise.resolve([]),
    hasRules ? listAccountingEntities(workspaceId, "account") : Promise.resolve([]),
    prisma.supplier.findMany({
      where: { workspaceId },
      orderBy: { canonicalName: "asc" },
      select: { id: true, canonicalName: true, paymentTermsDays: true, earlyPaymentDiscountPercent: true, earlyPaymentDiscountDays: true, iban: true, bankDetails: true, documentCount: true },
    }),
  ])
  const autoCount = history.filter((row) => row.willAutoApply).length
  const accountOptions = resolveAccountOptions(accountingEntities)
  const paymentRows: SupplierPaymentsRow[] = suppliers.map((s) => {
    const details = (s.bankDetails ?? {}) as Record<string, unknown>
    const account = typeof details.account === "string" ? details.account : typeof details.iban === "string" ? details.iban : s.iban
    const branchCode = typeof details.branchCode === "string" ? details.branchCode : typeof details.branch === "string" ? details.branch : null
    return { id: s.id, name: s.canonicalName, paymentTermsDays: s.paymentTermsDays, earlyPaymentDiscountPercent: decimalToNumber(s.earlyPaymentDiscountPercent), earlyPaymentDiscountDays: s.earlyPaymentDiscountDays, account: account || null, branchCode, documentCount: s.documentCount }
  })

  return <AdminPage title="Suppliers" intro="Each supplier carries four facts: whether its documents may skip a person's review, what gets filled in for them, the rule that codes them, and how they are paid. Trust and history are earned from the documents you have already reviewed.">
    {!owner && <ReadOnlyBand owners={context.owners} />}

    {hasTouchless && <Panel
      title="Who can skip review"
      note={<>A new supplier&rsquo;s first {SUPPLIER_COLD_START_COUNT} documents always go to a person, however confident the extraction is. After {SUPPLIER_TRUST_STREAK} clean documents in a row the supplier is trusted and its documents can move on their own.</>}
    >
      {trust.length === 0
        ? <Empty title="No suppliers recognised yet">Suppliers appear here as documents are extracted. The first document from any supplier starts its trust record.</Empty>
        : <Sheet head={<>
            <Th>Supplier</Th>
            <Th>Standing</Th>
            <Th>Before it can skip review</Th>
            <Th>Clean streak</Th>
            <Th align="right">Confidence bar</Th>
          </>}>
            {trust.map((row) => <SupplierRow key={row.supplierId} row={row} />)}
          </Sheet>}
    </Panel>}

    {hasTouchless && <Panel
      title="What gets filled in automatically"
      note={<>When {HISTORY_APPLY_THRESHOLDS.minSupport} or more of a supplier&rsquo;s reviewed documents agree on a value {Math.round(HISTORY_APPLY_THRESHOLDS.minAgreement * 100)}% of the time, the next document gets that value without asking the AI.</>}
    >
      {history.length === 0
        ? <Empty title="No coding history yet">History builds as documents are coded — by hand or by a rule. Three consistent codings for the same supplier are enough for the next one to fill itself in.</Empty>
        : <>
          <div className="mb-5">
            <Figure layout="inline" value={`${autoCount}`} state={autoCount > 0 ? "auto" : "idle"}
              caption={<>of {history.length} supplier{history.length === 1 ? "" : "s"} with history now {autoCount === 1 ? "fills itself in" : "fill themselves in"}. The rest still go to the AI every time.</>} />
          </div>
          <VendorHistorySheet workspaceId={workspaceId} rows={history} pinnedRuleIds={Object.fromEntries(pinnedRuleIds)} isOwner={owner} />
        </>}
    </Panel>}

    {hasRules && <Panel title="Coding rules" note="When a document's supplier matches, its coding is applied automatically. A rule that requires review is still applied — the document also lands in review.">
      <div className="space-y-6">
        {owner && <AutomationRuleForm workspaceId={workspaceId} accountOptions={accountOptions} />}
        {!rules.length
          ? <Empty title="No rules yet">A rule names a supplier and the coding to apply to every document from it.</Empty>
          : <Sheet head={<>
              <Th>Name</Th>
              <Th>Matches</Th>
              <Th>Assigns</Th>
              <Th align="right">Hits</Th>
              <Th align="right">Status</Th>
            </>}>
              {rules.map((rule) => {
                const matcher = rule.matcher as unknown as RuleMatcher
                const actions = rule.actions as unknown as RuleActions
                return <tr key={rule.id}>
                  <td className="py-2.5 pr-4 font-medium text-slate-900">{rule.name}</td>
                  <td className="py-2.5 pr-4 text-slate-600">Supplier {matcher.type === "exact" ? "is" : "contains"} &ldquo;{matcher.value}&rdquo;</td>
                  <td className="py-2.5 pr-4 text-slate-600">{Object.entries(actions.codingData || {}).map(([key, value]) => `${key}: ${value}`).join(", ")}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600">{rule.hitCount}</td>
                  <td className="py-2.5 text-right">{owner ? <AutomationRuleActiveToggle workspaceId={workspaceId} ruleId={rule.id} active={rule.isActive} /> : <Pill state={rule.isActive ? "auto" : "idle"}>{rule.isActive ? "Active" : "Inactive"}</Pill>}</td>
                </tr>
              })}
            </Sheet>}
      </div>
    </Panel>}

    <Panel title="Payment terms and bank details" note={<>Net days infer a due date when an invoice has none; an early-payment discount (say 2% within 10 days, shown as &ldquo;2/10 net 30&rdquo;) lowers the amount to pay on Bill Pay while its window is open. The bank account is what the payment file pays to — without it an approved invoice waits on Bill Pay as &ldquo;Needs bank details&rdquo;.</>}>
      <SupplierPaymentsSettings workspaceId={workspaceId} suppliers={paymentRows} owner={owner} action={updateSupplierPaymentsAction} />
    </Panel>
  </AdminPage>
}
