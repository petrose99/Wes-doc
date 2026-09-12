import { JurisdictionPicker } from "@/components/workspace/jurisdiction-picker"
import { DeferredVatSchemePicker } from "@/components/workspace/deferred-vat-scheme-picker"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { listAvailableJurisdictions } from "@/lib/jurisdictions"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { getWorkspaceJurisdictionSummary, getWorkspaceDeferredVatScheme } from "@/models/jurisdictions"
import { getTaxProfile } from "@/models/tax-profiles"
import { requireWorkspaceRole } from "@/models/workspaces"
import { notFound } from "next/navigation"

/** Jurisdiction settings (#49). The workspace's active jurisdiction pack — which packs its rule
 * pack, currency and rate snapshot follow. Required before AP inbound (email-in, upload, API)
 * will accept a bill; see lib/jurisdictions/require.ts.
 *
 * Finance-industry only (WP2 — this is the always-on "jurisdiction" module, renamed from
 * "tax-profiles" in the same migration). Rate snapshots stay retroactive (TaxProfileVersion);
 * rule packs read live from lib/jurisdictions/<code>/ per decision #39. */
export default async function TaxSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  if (!(await getWorkspaceCapabilities(workspaceId)).has("jurisdiction")) notFound()

  const [profile, jurisdiction, deferredVatScheme] = await Promise.all([
    getTaxProfile(workspaceId),
    getWorkspaceJurisdictionSummary(workspaceId),
    getWorkspaceDeferredVatScheme(workspaceId),
  ])
  const options = listAvailableJurisdictions()
  const owner = membership.role === "owner"

  return <main className="space-y-6">
    <header>
      <h1 className="text-3xl font-bold">Jurisdiction</h1>
      <p className="mt-1 text-muted-foreground">The tax jurisdiction this workspace files in — its rule pack, currency, and rate snapshot. Required before AP inbound can accept bills.</p>
    </header>

    <Card>
      <CardHeader>
        <CardTitle>Active jurisdiction</CardTitle>
        <CardDescription>Rule pack loads live from code; rates are snapshotted, so already-checked documents keep the rates that were in force when they were checked.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {owner
          ? <JurisdictionPicker workspaceId={workspaceId} options={options} current={jurisdiction} />
          : jurisdiction
            ? <p className="text-sm">Jurisdiction is <span className="font-medium">{options.find((o) => o.code === jurisdiction.code)?.name ?? jurisdiction.code}</span>. Only the workspace owner can change it.</p>
            : <p className="text-sm text-muted-foreground">This workspace has no jurisdiction set. The workspace owner can pick one.</p>}

        {profile && <div className="space-y-2 rounded border p-4 text-sm">
          <p><span className="font-medium">Currency:</span> {profile.config.currency}</p>
          <p><span className="font-medium">{profile.config.registrationNumberLabel}</span> format: <code className="rounded bg-slate-100 px-1.5 py-0.5">{profile.config.registrationNumberPattern}</code></p>
          {profile.config.rates.length > 0 && <div>
            <span className="font-medium">Rates:</span>
            <ul className="mt-1 list-inside list-disc">
              {profile.config.rates.map((rate) => <li key={rate.label}>{rate.label}: {(rate.rate * 100).toFixed(0)}% (from {rate.effectiveFrom})</li>)}
            </ul>
          </div>}
          {profile.config.rates.length === 0 && <p className="text-muted-foreground">This region&apos;s rates are set at the state/local level and are not modeled here yet.</p>}
        </div>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Deferred import VAT scheme</CardTitle>
        <CardDescription>
          Applies when a jurisdiction lets you defer import VAT to the return rather than paying at the border (Lesotho VAT-12 splits import inputs by this flag). Leave &quot;Not stated&quot; if it doesn&apos;t apply to your workspace &mdash; imports on unset workspaces silent-pass the return-form columns and are unaffected on packs that don&apos;t use the flag.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DeferredVatSchemePicker workspaceId={workspaceId} current={deferredVatScheme} isOwner={owner} />
      </CardContent>
    </Card>
  </main>
}
