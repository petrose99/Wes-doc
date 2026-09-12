import Link from "next/link"
import { notFound } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { getWorkspaceMode, requireWorkspaceRole, type WorkspaceMode } from "@/models/workspaces"
import { buildClosePreamble, closePeriodLabel, type PreambleItem } from "@/lib/close/preamble"
import { readCloseLockSnapshot, type CloseItemKind } from "@/lib/close/types"
import type {
  ComputedApAging,
  ComputedBankRecon,
  ComputedCrossBorderReview,
  ComputedUnpostedAccruals,
  ComputedValue,
  ComputedVatWorkpaper,
} from "@/lib/close/compute/types"
import {
  assertBankBalanceAction,
  lockCloseAction,
  openCloseAction,
  overrideCloseItemAction,
  recomputeCloseAction,
  relockCloseAction,
  reopenCloseAction,
  unsignCloseItemAction,
} from "./actions"
import { CloseAssistant } from "./close-assistant"
import { LockConfirmButton } from "./lock-confirm-button"
import { ReasonDialogButton } from "./reason-dialog"
import { SignForm } from "./sign-form"
import { VatSheetTabs } from "./vat-sheet-tabs"

export const dynamic = "force-dynamic"

/** #97: the close checklist — period picker, lock/reopen/relock controls, one card per
 * CloseItem with its computed summary and Sign / Unsign / Override controls. Compute is #96,
 * lifecycle is #95; this page only renders and calls through ./actions.ts. */

/** Descriptor order from lib/close/item-sets.ts (common → VAT → jurisdiction extras). */
const KIND_ORDER: CloseItemKind[] = ["bank-recon", "ap-aging", "unposted-bill-accruals", "vat-workpaper", "cross-border-review"]

type CloseRow = {
  id: string
  periodYear: number
  periodMonth: number
  state: string
  vatPeriodEnd: boolean
  reopenReason: string | null
  lastReopenedAt: Date | null
  lockedAt: Date | null
  lockSnapshot: unknown
}

type ItemRow = {
  id: string
  kind: string
  title: string
  state: string
  reSignRequired: boolean
  computedValue: unknown
  computedAt: Date | null
  signedAt: Date | null
  signedBy: { name: string | null; email: string } | null
}

export default async function ClosePage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ period?: string; blockedGates?: string }>
}) {
  const { workspaceId } = await params
  const { period, blockedGates } = await searchParams
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  if (!(await getWorkspaceCapabilities(workspaceId)).has("close")) notFound()
  const workspaceMode = await getWorkspaceMode(workspaceId)
  const signerName = user.name ?? user.email

  const closes: CloseRow[] = await prisma.close.findMany({
    where: { workspaceId },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    select: { id: true, periodYear: true, periodMonth: true, state: true, vatPeriodEnd: true, reopenReason: true, lastReopenedAt: true, lockedAt: true, lockSnapshot: true },
  })

  const nextPeriod = nextOpenablePeriod(closes)
  const openNext = openCloseAction.bind(null, workspaceId, nextPeriod.year, nextPeriod.month)

  const selected = pickSelected(closes, period)

  if (!selected) {
    return (
      <main className="space-y-6">
        <Header workspaceId={workspaceId} preamble={null} workspaceMode={workspaceMode} signerName={signerName} />
        <Card>
          <CardHeader>
            <CardTitle>No close yet</CardTitle>
            <CardDescription>
              Open your first monthly close to get the checklist: bank reconciliation, AP aging, unposted-bill accruals{" "}
              and — on a VAT period end — the VAT workpaper. Nothing is back-filled; closes start from the first one you open.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={openNext}>
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700">
                Open {closePeriodLabel(nextPeriod.year, nextPeriod.month)}
              </button>
            </form>
          </CardContent>
        </Card>
      </main>
    )
  }

  const items: ItemRow[] = await prisma.closeItem.findMany({
    where: { closeId: selected.id },
    select: {
      id: true, kind: true, title: true, state: true, reSignRequired: true,
      computedValue: true, computedAt: true, signedAt: true,
      signedBy: { select: { name: true, email: true } },
    },
  })
  items.sort((a, b) => KIND_ORDER.indexOf(a.kind as CloseItemKind) - KIND_ORDER.indexOf(b.kind as CloseItemKind))

  const isOpen = selected.state === "open"
  const wasReopened = selected.lastReopenedAt !== null
  const blockedCount = blockedGates ? Number.parseInt(blockedGates, 10) || 0 : 0
  const preambleItems: PreambleItem[] = items.map((item) => ({
    kind: item.kind,
    title: item.title,
    state: item.state,
    reSignRequired: item.reSignRequired,
    computedValue: (item.computedValue as ComputedValue | null) ?? null,
  }))
  const preamble = buildClosePreamble(selected, preambleItems)

  /* #79: a locked period renders the identity it had at lock, not the live one — a workspace
   * that gains or loses its reviewer afterwards must not rewrite what a locked period says
   * about itself. Open periods (and locked rows predating #79's back-fill, where the reader
   * returns null) fall back to the live mode read at the top of the page. The SMB banner's
   * signer name is not in the snapshot: SMB locks carry `reviewerOfRecord: null` by design,
   * and per-item signer identity lives in the close.item.attested / .signed audit trail. */
  const lockSnapshot = readCloseLockSnapshot(selected.lockSnapshot)
  const selectedMode: WorkspaceMode = selected.state === "locked" && lockSnapshot ? lockSnapshot.workspaceModeAtLock : workspaceMode
  const selectedSignerName = lockSnapshot?.reviewerOfRecord?.name ?? signerName

  const periodLabel = closePeriodLabel(selected.periodYear, selected.periodMonth)
  const lockItemSummaries = items.map((item) => ({ title: item.title, state: item.state }))
  const apAgingValue = items.find((item) => item.kind === "ap-aging")?.computedValue as ComputedApAging | null | undefined
  const lockHardBlockingCount = apAgingValue?.openExceptions.hardBlockingCount ?? 0

  return (
    <main className="space-y-6">
      <Header workspaceId={workspaceId} preamble={preamble} workspaceMode={selectedMode} signerName={selectedSignerName} />

      {/* Period picker: every close, newest first, plus the open-next button. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {closes.map((close) => {
          const value = `${close.periodYear}-${String(close.periodMonth).padStart(2, "0")}`
          const active = close.id === selected.id
          return (
            <Link key={close.id} href={`/workspaces/${workspaceId}/close?period=${value}`}
              className={`rounded-md border px-3 py-1.5 transition-colors ${active ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {closePeriodLabel(close.periodYear, close.periodMonth)}
              <span className={`ml-1.5 text-xs ${close.state === "locked" ? "text-slate-400" : "text-emerald-600"}`}>{close.state}</span>
            </Link>
          )
        })}
        <form action={openNext}>
          <button type="submit" className="rounded-md border border-dashed border-emerald-300 px-3 py-1.5 text-sm text-emerald-700 transition-colors hover:bg-emerald-50">
            + Open {closePeriodLabel(nextPeriod.year, nextPeriod.month)}
          </button>
        </form>
      </div>

      {/* Selected close header: state badge, VAT indicator, lifecycle controls. */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {closePeriodLabel(selected.periodYear, selected.periodMonth)}
                <StateBadge state={selected.state} />
                {selected.vatPeriodEnd && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">VAT period end</span>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                {isOpen
                  ? "Sign each item, then lock the period. Locking snapshots the jurisdiction pack version."
                  : `Locked${selected.lockedAt ? ` on ${selected.lockedAt.toISOString().slice(0, 10)}` : ""}. Reopen (with a reason) to make changes.`}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isOpen && (
                <form action={recomputeCloseAction.bind(null, workspaceId, selected.id)}>
                  <button type="submit" className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                    Recompute
                  </button>
                </form>
              )}
              {isOpen && !wasReopened && (
                <LockConfirmButton
                  action={lockCloseAction.bind(null, workspaceId, selected.id)}
                  triggerLabel="Lock period"
                  periodLabel={periodLabel}
                  relock={false}
                  items={lockItemSummaries}
                  hardBlockingCount={lockHardBlockingCount}
                />
              )}
              {isOpen && wasReopened && (
                <LockConfirmButton
                  action={relockCloseAction.bind(null, workspaceId, selected.id)}
                  triggerLabel="Relock period"
                  periodLabel={periodLabel}
                  relock={true}
                  items={lockItemSummaries}
                  hardBlockingCount={lockHardBlockingCount}
                />
              )}
              {!isOpen && (
                <ReasonDialogButton
                  action={reopenCloseAction.bind(null, workspaceId, selected.id)}
                  triggerLabel="Reopen…"
                  title={`Reopen ${closePeriodLabel(selected.periodYear, selected.periodMonth)}`}
                  description="Reopening puts every previously signed item back on the hook — each will show a re-sign chip until someone signs it again. The reason lands on the audit trail."
                  submitLabel="Reopen period"
                  placeholder="Why is this locked period being reopened?"
                  tone="amber"
                />
              )}
            </div>
          </div>
        </CardHeader>
        {(blockedCount > 0 || (isOpen && wasReopened)) && (
          <CardContent className="space-y-2 pt-0">
            {blockedCount > 0 && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Lock blocked: {blockedCount} open hard gate{blockedCount === 1 ? "" : "s"} against this workspace&rsquo;s bills.{" "}
                <Link href={`/workspaces/${workspaceId}/bills?blocked=1`} className="font-semibold underline underline-offset-2">
                  Review the blocked bills
                </Link>{" "}
                and clear the exceptions, then lock again.
              </p>
            )}
            {isOpen && wasReopened && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                This period was reopened{selected.reopenReason ? <> — &ldquo;{selected.reopenReason}&rdquo;</> : null}. Previously signed items need a fresh
                sign-off (marked <span className="font-semibold">re-sign</span> below) before you relock.
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {/* One card per checklist item, in descriptor order. */}
      <div className="space-y-4">
        {items.map((item) => (
          <ItemCard key={item.id} workspaceId={workspaceId} item={item} closeOpen={isOpen} mode={selectedMode} />
        ))}
      </div>
    </main>
  )
}

function Header({ workspaceId, preamble, workspaceMode, signerName }: {
  workspaceId: string
  preamble: string | null
  workspaceMode: WorkspaceMode
  signerName: string
}) {
  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Close</h1>
          <p className="mt-1 text-muted-foreground">The monthly close checklist: computed working papers, per-item sign-off, and a period lock.</p>
        </div>
        {preamble && <CloseAssistant workspaceId={workspaceId} preamble={preamble} />}
      </header>
      {workspaceMode === "smb" && <SmbBanner signerName={signerName} />}
    </div>
  )
}

/** #78: SMB banner rendered *inside* the workpaper header (not app chrome) on the close
 * checklist, so it travels with the workpaper into any future print/PDF/email export. When
 * a workspace has no reviewer, the person signing off is the signer of record. */
function SmbBanner({ signerName }: { signerName: string }) {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="font-semibold">No reviewer on this workspace.</span>{" "}
      Signer of record: <span className="font-semibold">{signerName}</span>.
    </p>
  )
}

function StateBadge({ state }: { state: string }) {
  return state === "locked"
    ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Locked</span>
    : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Open</span>
}

function ItemStateChip({ state, reSignRequired }: { state: string; reSignRequired: boolean }) {
  const chip =
    state === "signed" ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Signed</span>
    : state === "override" ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Override</span>
    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Pending</span>
  return (
    <span className="flex items-center gap-1.5">
      {chip}
      {reSignRequired && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">re-sign</span>}
    </span>
  )
}

function ItemCard({ workspaceId, item, closeOpen, mode }: { workspaceId: string; item: ItemRow; closeOpen: boolean; mode: WorkspaceMode }) {
  const value = (item.computedValue as ComputedValue | null) ?? null
  // Button label + attestation gating diverge by workspace mode (#77). Firm: reviewer sign-off,
  // no attestation. SMB: signer-of-record ticks the versioned attestation checkbox before the
  // button unlocks. The unsign + override paths are mode-agnostic — attestation attaches only
  // to the forward "signed" transition.
  const isSmb = mode === "smb"
  const showSignForm = closeOpen && (item.state !== "signed" || item.reSignRequired)
  const signButtonLabel = isSmb
    ? item.state === "signed" && item.reSignRequired ? "Re-sign as signer of record" : "Sign off as signer of record"
    : item.state === "signed" && item.reSignRequired ? "Re-sign as reviewer" : "Sign off as reviewer"
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2.5 text-lg">
            {item.title}
            <ItemStateChip state={item.state} reSignRequired={item.reSignRequired} />
          </CardTitle>
          <div className="flex items-center gap-2">
            {showSignForm && (
              <SignForm workspaceId={workspaceId} itemId={item.id} isSmb={isSmb} label={signButtonLabel} />
            )}
            {closeOpen && item.state !== "pending" && (
              <form action={unsignCloseItemAction.bind(null, workspaceId, item.id)}>
                <button type="submit" className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                  Unsign
                </button>
              </form>
            )}
            {closeOpen && item.state !== "override" && (
              <ReasonDialogButton
                action={overrideCloseItemAction.bind(null, workspaceId, item.id)}
                triggerLabel="Override…"
                title={`Override: ${item.title}`}
                description="Acknowledge this item without a clean sign-off. The reason is recorded on the audit trail — this is the accrue-or-acknowledge path for soft gates."
                submitLabel="Record override"
                placeholder="Why is this item being acknowledged rather than signed off clean?"
                tone="amber"
              />
            )}
          </div>
        </div>
        {(item.signedAt || item.computedAt) && (
          <CardDescription>
            {item.signedAt && <>Signed {item.signedAt.toISOString().slice(0, 10)}{item.signedBy ? ` by ${item.signedBy.name ?? item.signedBy.email}` : ""}. </>}
            {item.computedAt && <>Computed {item.computedAt.toISOString().slice(0, 16).replace("T", " ")}.</>}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <ItemBody workspaceId={workspaceId} itemId={item.id} value={value} closeOpen={closeOpen} />
      </CardContent>
    </Card>
  )
}

function ItemBody({ workspaceId, itemId, value, closeOpen }: { workspaceId: string; itemId: string; value: ComputedValue | null; closeOpen: boolean }) {
  if (!value) return <p className="text-sm text-muted-foreground">Not computed yet — hit Recompute above.</p>
  switch (value.kind) {
    case "bank-recon": return <BankReconBody workspaceId={workspaceId} itemId={itemId} value={value} closeOpen={closeOpen} />
    case "ap-aging": return <ApAgingBody workspaceId={workspaceId} value={value} />
    case "unposted-bill-accruals": return <AccrualsBody value={value} />
    case "vat-workpaper": return <VatBody value={value} />
    case "cross-border-review": return <CrossBorderBody value={value} />
    default: return null
  }
}

function money(n: number): string {
  return n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function BankReconBody({ workspaceId, itemId, value, closeOpen }: { workspaceId: string; itemId: string; value: ComputedBankRecon; closeOpen: boolean }) {
  const statusChip =
    value.status === "awaiting-assertion" ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Awaiting assertion</span>
    : value.status === "within-tolerance" ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Within tolerance</span>
    : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Delta flagged</span>
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {statusChip}
        {value.assertedBalance !== null && <span className="text-slate-700">Asserted closing balance: <span className="font-semibold tabular-nums">{money(value.assertedBalance)}</span></span>}
        {value.computedBalance !== null && <span className="text-slate-700">Computed: <span className="font-semibold tabular-nums">{money(value.computedBalance)}</span></span>}
        {value.deltaAmount !== null && <span className="text-slate-700">Delta: <span className="font-semibold tabular-nums">{money(value.deltaAmount)}</span> (tolerance {money(value.tolerance)})</span>}
      </div>
      {closeOpen && (
        <form action={assertBankBalanceAction.bind(null, workspaceId, itemId)} className="flex flex-wrap items-center gap-2">
          <label htmlFor={`assert-${itemId}`} className="text-slate-600">
            {value.status === "awaiting-assertion" ? "Record the closing balance from your bank statement:" : "Update the asserted balance:"}
          </label>
          <input
            id={`assert-${itemId}`}
            name="assertedBalance"
            type="number"
            step="0.01"
            required
            defaultValue={value.assertedBalance ?? undefined}
            className="w-40 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm tabular-nums transition-colors focus:border-emerald-400 focus:bg-white focus:outline-none"
          />
          <button type="submit" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100">
            Record balance
          </button>
        </form>
      )}
    </div>
  )
}

function ApAgingBody({ workspaceId, value }: { workspaceId: string; value: ComputedApAging }) {
  const buckets = [
    { label: "Current", amount: value.aging.currentAmount, count: value.aging.currentCount },
    { label: "1–30d", amount: value.aging.days_1_30_amount, count: value.aging.days_1_30_count },
    { label: "31–60d", amount: value.aging.days_31_60_amount, count: value.aging.days_31_60_count },
    { label: "61–90d", amount: value.aging.days_61_90_amount, count: value.aging.days_61_90_count },
    { label: "90+ days", amount: value.aging.days_90_plus_amount, count: value.aging.days_90_plus_count },
  ]
  const { hardBlockingCount, softCount } = value.openExceptions
  return (
    <div className="space-y-3 text-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 font-medium">Bucket</th>
              <th className="px-2 py-1.5 text-right font-medium">Bills</th>
              <th className="px-2 py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.label} className="border-b border-slate-100">
                <td className="px-2 py-1.5 text-slate-700">{bucket.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{bucket.count}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{money(bucket.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-2 py-1.5 text-slate-800">Total open</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{value.totalOpenCount}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{money(value.totalOpenAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {hardBlockingCount > 0 ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          <span className="font-bold">{hardBlockingCount} hard-blocking exception{hardBlockingCount === 1 ? "" : "s"}</span> — the period cannot lock until these clear.{" "}
          <Link href={`/workspaces/${workspaceId}/bills?blocked=1`} className="font-semibold underline underline-offset-2">Open the blocked bills</Link>
          {softCount > 0 && <span className="ml-1 text-red-700">(+{softCount} soft)</span>}
        </p>
      ) : (
        <p className="text-slate-600">
          {softCount > 0
            ? <>No hard-blocking exceptions; <Link href={`/workspaces/${workspaceId}/bills`} className="underline underline-offset-2">{softCount} soft exception{softCount === 1 ? "" : "s"}</Link> to review.</>
            : "No open exceptions."}
        </p>
      )}
    </div>
  )
}

function AccrualsBody({ value }: { value: ComputedUnpostedAccruals }) {
  if (value.proposals.length === 0) {
    return <p className="text-sm text-muted-foreground">No unposted bills need accruals this period.</p>
  }
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        Journal draft — <span className="font-semibold">never posted anywhere</span>; copy it out to your ledger.
        Reversal auto-dated <span className="font-semibold tabular-nums">{value.reversalDate.slice(0, 10)}</span>.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 font-medium">Bill</th>
              <th className="px-2 py-1.5 font-medium">Category</th>
              <th className="px-2 py-1.5 text-right font-medium">Dr net</th>
              {value.vatSuspense && <th className="px-2 py-1.5 text-right font-medium">Dr VAT suspense</th>}
              <th className="px-2 py-1.5 text-right font-medium">Cr Accruals</th>
              <th className="px-2 py-1.5 font-medium">Gate</th>
            </tr>
          </thead>
          <tbody>
            {value.proposals.map((p) => (
              <tr key={p.billId} className="border-b border-slate-100">
                <td className="px-2 py-1.5 text-slate-700">
                  {p.supplierName}
                  <span className="ml-1.5 text-xs text-slate-400">{p.invoiceDate.slice(0, 10)}</span>
                </td>
                <td className="px-2 py-1.5 text-slate-600">{p.category}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{money(p.debitNet)}</td>
                {value.vatSuspense && <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{p.debitVatSuspense !== null ? money(p.debitVatSuspense) : "—"}</td>}
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{money(p.creditAccruals)}</td>
                <td className="px-2 py-1.5"><GateChip status={p.gateStatus} /></td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-2 py-1.5 text-slate-800" colSpan={2}>Totals</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{money(value.totalNet)}</td>
              {value.vatSuspense && <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{money(value.totalVatSuspense)}</td>}
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{money(value.totalAccruals)}</td>
              <td className="px-2 py-1.5" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GateChip({ status }: { status: "clear" | "soft" | "hard-blocking" }) {
  if (status === "hard-blocking") return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">hard gate</span>
  if (status === "soft") return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">soft gate</span>
  return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">clear</span>
}

function VatBody({ value }: { value: ComputedVatWorkpaper }) {
  if (!value.packCode) {
    return (
      <p className="text-sm text-muted-foreground">
        No jurisdiction pack selected — pick one under Settings → Jurisdiction and recompute to get the VAT workpaper.
      </p>
    )
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-slate-500">
        Pack {value.packCode}{value.packVersion ? ` · ${value.packVersion}` : ""}{value.groupId ? ` · group ${value.groupId}` : ""}
      </p>
      <VatSheetTabs sheets={value.sheets.map((sheet) => ({ ...sheet, totals: { ...sheet.totals }, boxes: { ...sheet.boxes } }))} />
    </div>
  )
}

function CrossBorderBody({ value }: { value: ComputedCrossBorderReview }) {
  if (value.bills.length === 0) {
    return <p className="text-sm text-muted-foreground">No bills in the {value.windowDays}-day cross-border window this period.</p>
  }
  return (
    <div className="space-y-2 text-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 font-medium">Supplier</th>
              <th className="px-2 py-1.5 font-medium">Invoice date</th>
              <th className="px-2 py-1.5 font-medium">VAT number</th>
              <th className="px-2 py-1.5 text-right font-medium">Gross</th>
            </tr>
          </thead>
          <tbody>
            {value.bills.map((bill) => (
              <tr key={bill.billId} className="border-b border-slate-100">
                <td className="px-2 py-1.5 text-slate-700">{bill.supplierName}</td>
                <td className="px-2 py-1.5 tabular-nums text-slate-600">{bill.invoiceDate.slice(0, 10)}</td>
                <td className="px-2 py-1.5 text-slate-600">{bill.supplierVatNumber ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{money(bill.grossAmount)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-2 py-1.5 text-slate-800" colSpan={3}>Total gross</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{money(value.totalGross)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Eyeball each invoice against the SARS/RSL common-border conditions before signing off.</p>
    </div>
  )
}

/** The earliest month with no Close row: with no closes at all, the current month; otherwise
 * scan forward from the earliest close and return the first gap (which is the month after
 * the latest close when the run is contiguous). */
function nextOpenablePeriod(closes: CloseRow[]): { year: number; month: number } {
  if (closes.length === 0) {
    const now = new Date()
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }
  }
  const have = new Set(closes.map((close) => close.periodYear * 12 + (close.periodMonth - 1)))
  let cursor = Math.min(...have)
  while (have.has(cursor)) cursor += 1
  return { year: Math.floor(cursor / 12), month: (cursor % 12) + 1 }
}

function pickSelected(closes: CloseRow[], period: string | undefined): CloseRow | null {
  if (closes.length === 0) return null
  if (period) {
    const match = /^(\d{4})-(\d{2})$/.exec(period)
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2])
      const found = closes.find((close) => close.periodYear === year && close.periodMonth === month)
      if (found) return found
    }
  }
  return closes[0]
}
