import { AdminPage, ModuleOff, ReadOnlyBand } from "@/components/admin/admin-ui"
import { TaxForm } from "@/components/admin/tax-form"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { listAvailableJurisdictions } from "@/lib/jurisdictions"
import { listCategoryNatures } from "@/models/category-natures"
import { getWorkspaceDeferredVatScheme, getWorkspaceJurisdictionSummary } from "@/models/jurisdictions"
import { getTaxProfile } from "@/models/tax-profiles"

export const dynamic = "force-dynamic"

/** #231 Q25 (#252): Admin › Configuration › Tax — "Jurisdiction" in the accountant's word.
 * The jurisdiction pack (#49), the deferred import VAT scheme (#84) and the goods-or-services
 * split by category (#83) on one page: everything a return-form workpaper reads — one form,
 * one sticky Save (evaluate H4). */
export default async function TaxPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  if (!context.capabilities.has("jurisdiction")) {
    return <AdminPage title="Tax"><ModuleOff what="Tax" href={adminPaths(workspaceId).whatsOn} /></AdminPage>
  }
  const [profile, jurisdiction, deferredVatScheme, natures] = await Promise.all([
    getTaxProfile(workspaceId),
    getWorkspaceJurisdictionSummary(workspaceId),
    getWorkspaceDeferredVatScheme(workspaceId),
    listCategoryNatures(workspaceId),
  ])
  const options = listAvailableJurisdictions()
  const owner = context.owner

  return <AdminPage title="Tax" intro="The tax jurisdiction this company files in — its rule pack, currency and rate snapshot — and the facts the return-form workpapers read from. Required before email intake will accept an invoice.">
    {!owner && <ReadOnlyBand owners={context.owners} />}

    <TaxForm
      workspaceId={workspaceId}
      options={options}
      jurisdiction={jurisdiction}
      deferredVatScheme={deferredVatScheme}
      natures={natures}
      owner={owner}
      jurisdictionFacts={profile && <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-slate-500">Currency</dt><dd className="text-slate-900">{profile.config.currency}</dd>
        <dt className="text-slate-500">{profile.config.registrationNumberLabel} format</dt><dd><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">{profile.config.registrationNumberPattern}</code></dd>
        <dt className="text-slate-500">Rates</dt>
        <dd className="text-slate-900">
          {profile.config.rates.length > 0
            ? <ul className="space-y-0.5">{profile.config.rates.map((rate) => <li key={rate.label} className="tabular-nums">{rate.label}: {(rate.rate * 100).toFixed(0)}% from {rate.effectiveFrom}</li>)}</ul>
            : <span className="text-slate-600">Set at the state or local level; not modelled here yet.</span>}
        </dd>
      </dl>} />
  </AdminPage>
}
