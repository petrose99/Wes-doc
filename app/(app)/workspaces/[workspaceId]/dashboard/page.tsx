import type { SheetTemplate } from "@/components/extract/types"
import { FileHubUploadButton } from "@/components/files/file-hub-upload-button"

import { WelcomeTour } from "@/components/onboarding/welcome-tour"

import config from "@/lib/config"
import { getCurrentUser } from "@/lib/auth"
import { parseTemplateFields } from "@/lib/document-templates"
import { countDocumentsByStage, countDocumentsThisMonth, countFailedDocuments, flaggedFieldsFromConfidence, listWorkspaceDocuments, summarizeDocumentForReview } from "@/models/documents"
import { listWorkspaceBills } from "@/models/bills"
import { AgingSummary } from "@/components/dashboard/aging-summary"
import { ensurePipelineFile, getFileTemplates } from "@/models/files"
import { getWorkspaceUsage, requireWorkspaceRole } from "@/models/workspaces"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { getWorkspaceAnalytics, resolvePeriod } from "@/lib/analytics/workspace-analytics"
import { HeadlineCards } from "@/components/analytics/stat-cards"
import { SpendByCategoryChart } from "@/components/analytics/spend-by-category-chart"
import { VendorSpendChart } from "@/components/analytics/vendor-spend-chart"
import { getOnboardingStateAction } from "../onboarding-actions"
import { AlertTriangle, CheckCircle2, ChevronRight, FileText, SearchCheck } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

/** "due_date" -> "Due date" — good enough for a reason blurb without a template-field lookup. */
function formatFieldKey(key: string): string {
  const words = key.replaceAll("_", " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

/** The old workspace overview, kept one release behind DASHBOARD_LANDING (#238). Off — the
 * default — this address is not found; the workspace home is the Invoices queue. Links into the
 * unplugged Worksheets surface are gone from it either way. */
export default async function WorkspaceDashboardPage({ params }: {
  params: Promise<{ workspaceId: string }>
}) {
  if (!config.workspace.dashboardLanding) notFound()
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)

  const documentSearchEnabled = config.embeddings.enabled

  const [pipelineFile, usage, stageCounts, documentsThisMonth, onboardingState, failedCount, capabilities] = await Promise.all([
    ensurePipelineFile(workspaceId, user.id),
    getWorkspaceUsage(workspaceId),
    countDocumentsByStage(workspaceId),
    countDocumentsThisMonth(workspaceId),
    getOnboardingStateAction(workspaceId),
    countFailedDocuments(workspaceId),
    getWorkspaceCapabilities(workspaceId),
  ])

  // Wayfinder decision #112: the home surfaces one shared, priority-ranked queue rather than a
  // broad dashboard. Priority is review > approved-awaiting-placement > failed/stalled recovery >
  // upload > exploratory destinations. The first item is the prominent "next best action"; the
  // rest render as a compact secondary list. An empty queue is the "all caught up" state.
  const queueItems = [
    stageCounts.review > 0 && {
      key: "review",
      message: `${stageCounts.review} document${stageCounts.review === 1 ? "" : "s"} need${stageCounts.review === 1 ? "s" : ""} review`,
      href: `/workspaces/${workspaceId}/pipeline?stage=review`,
      icon: SearchCheck,
    },
    failedCount > 0 && {
      key: "recovery",
      message: `${failedCount} document${failedCount === 1 ? "" : "s"} failed to process`,
      href: `/workspaces/${workspaceId}/pipeline?stage=inbox`,
      icon: AlertTriangle,
    },
  ].filter((item): item is { key: string; message: string; href: string; icon: typeof SearchCheck } => !!item)
  const [nextAction, ...secondaryQueueItems] = queueItems
  const hasPriorityAction = Boolean(nextAction)

  const showFinancials = capabilities.has("finance-analytics")
  const today = new Date()
  const analytics = showFinancials ? await getWorkspaceAnalytics(workspaceId, resolvePeriod({ period: "12m" }, today), today) : null
  const formatMoney = (value: number) => {
    const currency = analytics?.currency.baseCurrency ?? membership.workspace.baseCurrency ?? "USD"
    return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
  }
  const pipelineTemplates = await getFileTemplates(workspaceId, pipelineFile.id)
  const uploadTemplates: SheetTemplate[] = pipelineTemplates.flatMap((candidate) => {
    const version = candidate.versions[0]
    if (!version) return []
    return [{ id: candidate.id, code: candidate.code, name: candidate.name, multiRow: candidate.multiRow, documentCount: 0, fields: parseTemplateFields(version.fields), prompt: version.prompt || "" }]
  })

  // #225: the aging totals that left the Invoices header live here. Unpaid only — a paid
  // invoice has no age worth reporting — and the panel hides nothing: an empty summary says so.
  const [needsReview, { summary: agingSummary }] = await Promise.all([
    listWorkspaceDocuments(workspaceId, { stage: "review" }),
    listWorkspaceBills({ workspaceId, onlyUnpaid: true }),
  ])

  const stats = [
    { label: "Documents this month", value: documentsThisMonth, icon: FileText, href: null, iconClass: "bg-emerald-50 text-emerald-700", hoverClass: "" },
    { label: "Review", value: stageCounts.review, icon: SearchCheck, href: `/workspaces/${workspaceId}/pipeline?stage=review`, iconClass: "bg-indigo-50 text-indigo-600", hoverClass: "hover:border-[#c7d2fe] hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_12px_26px_rgba(79,70,229,0.10)]" },
    // countDocumentsByStage returns the current all-time size of each stage — there's no date
    // window on `approved` — so "(30d)" was the dashboard's biggest lie. Labelled honestly as the
    // stage count until we add a real 30-day rolling query. A wrong number on a financial
    // dashboard costs more trust than no number.
    { label: "Approved", value: stageCounts.approved, icon: CheckCircle2, href: `/workspaces/${workspaceId}/pipeline?stage=approved`, iconClass: "bg-emerald-50 text-emerald-700", hoverClass: "hover:border-[#a7f3d0] hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_12px_26px_rgba(4,120,87,0.10)]" },
  ]

  return <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-[18px] md:space-y-6 md:p-6">
    <WelcomeTour workspaceId={workspaceId} tourSeen={onboardingState.tourSeen} />
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-emerald-700 md:text-xs">{greeting(new Date())}, {(user.name || user.email).split(" ")[0]}</p>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-[25px] font-extrabold leading-[1.15] tracking-[-0.025em] text-slate-900 md:text-[33px] md:leading-normal">Welcome back to {membership.workspace.name}</h1>
        </div>
      </div>
      <div className="hidden md:block">
        <FileHubUploadButton
          workspaceId={workspaceId}
          fileId={pipelineFile.id}
          fileName="Pipeline"
          template={uploadTemplates[0] ?? null}
          templates={uploadTemplates}
          usage={usage}
          sheetCount={pipelineTemplates.length}
          documentSearchEnabled={documentSearchEnabled}
          primary={!hasPriorityAction}
          redirectTo={`/workspaces/${workspaceId}/pipeline`} />
      </div>
    </header>

    <div className="rounded-2xl border border-hairline bg-white p-[18px] shadow-panel sm:p-5">
      {nextAction ? <>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><nextAction.icon className="h-[19px] w-[19px]" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Next best action</p>
            <p className="text-[15.5px] font-bold text-slate-900">{nextAction.message}</p>
          </div>
          <Link href={nextAction.href} className="shrink-0 rounded-[11px] bg-slate-900 px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-slate-800">
            Open →
          </Link>
        </div>
        {secondaryQueueItems.length > 0 && <ul className="mt-3.5 flex flex-wrap gap-2 border-t border-[#eef2f6] pt-3.5">
          {secondaryQueueItems.map((item) => (
            <li key={item.key}>
              <Link href={item.href} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 hover:border-[#c7d2fe] hover:bg-slate-50 hover:text-indigo-700">
                <item.icon className="h-3.5 w-3.5" />{item.message}
              </Link>
            </li>
          ))}
        </ul>}
      </> : <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-[19px] w-[19px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Next best action</p>
          <p className="text-[15.5px] font-bold text-slate-900">All caught up — nothing needs your attention right now.</p>
        </div>
        <Link href={`/workspaces/${workspaceId}/pipeline`} className="shrink-0 rounded-[11px] bg-slate-900 px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-slate-800">
          Upload documents
        </Link>
      </div>}
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5">
      {stats.map((stat) => {
        const inner = <>
          <div className={`mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-[10px] sm:mb-3.5 sm:h-[38px] sm:w-[38px] sm:rounded-[11px] ${stat.iconClass}`}><stat.icon className="h-[18px] w-[18px]" /></div>
          <div className="text-[25px] font-extrabold tracking-tight text-slate-900 sm:text-[27px]">{stat.value}</div>
          <div className="mt-0.5 text-[12.5px] text-slate-500 sm:text-[13px]">{stat.label}</div>
        </>
        const className = `rounded-2xl border border-hairline bg-white p-[15px_16px] shadow-panel transition-[border-color,box-shadow,transform] duration-150 sm:p-[18px] ${stat.hoverClass}`
        return stat.href
          ? <Link key={stat.label} href={stat.href} className={className}>{inner}</Link>
          : <div key={stat.label} className={className}>{inner}</div>
      })}
    </div>

    <div className="rounded-2xl border border-hairline bg-white p-[18px] shadow-panel lg:p-5">
      <div className="mb-3.5 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><SearchCheck className="h-[17px] w-[17px]" /></span>
        <h2 className="text-[15px] font-bold text-slate-900">Needs your review</h2>
        {stageCounts.review > 0 && <span className="ml-auto rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11.5px] font-bold text-indigo-700">{stageCounts.review}</span>}
      </div>
      {needsReview.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nothing needs a look right now.</p> : <>
        {needsReview.slice(0, 3).map((doc) => {
          const reasons = flaggedFieldsFromConfidence(doc.confidence).slice(0, 2).map(formatFieldKey)
          const review = summarizeDocumentForReview(doc, membership.workspace.baseCurrency)
          return <Link key={doc.id} href={`/workspaces/${workspaceId}/documents/${doc.id}?stage=review`} className="flex items-center gap-2.5 border-t py-2.5 first:border-t-0 hover:text-emerald-800">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-slate-800">{review.supplier ?? "Unknown supplier"} · {review.category}{review.total ? ` · ${review.total}` : ""}</div>
              <div className="text-xs text-slate-500">{reasons.length > 0 ? `${reasons.join(", ")} unclear` : "Ready for a look"}</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          </Link>
        })}
      </>}
      <Link href={`/workspaces/${workspaceId}/pipeline?stage=review`} className="mt-3.5 block rounded-[11px] bg-slate-900 px-3 py-2.5 text-center text-[13.5px] font-semibold text-white hover:bg-slate-800">
        Open the review queue →
      </Link>
    </div>

    <AgingSummary workspaceId={workspaceId} summary={agingSummary} formatMoney={formatMoney} />

    {analytics && <>
      <HeadlineCards
        workspaceId={workspaceId}
        totalSpend={analytics.headline.totalSpend}
        totalOutstanding={analytics.headline.totalOutstanding}
        netCashFlow={analytics.headline.netCashFlow}
        openReviewTasks={analytics.headline.openReviewTasks}
        formatMoney={formatMoney}
      />
      <div className="rounded-2xl border border-hairline bg-white p-5 shadow-panel">
        <h2 className="mb-4 text-[15px] font-bold text-slate-900">Spend by category</h2>
        <SpendByCategoryChart workspaceId={workspaceId} rows={analytics.spend} formatMoney={formatMoney} />
      </div>
      <div className="rounded-2xl border border-hairline bg-white p-5 shadow-panel">
        <VendorSpendChart rows={analytics.vendorSpend} formatMoney={formatMoney} />
      </div>
    </>}

  </main>
}
