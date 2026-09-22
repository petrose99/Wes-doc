import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Panel } from "@/components/automation/automation-ui"
import { PayerAccountsSettings } from "@/components/settings/payments-settings"
import { getAdminContext } from "@/lib/admin/context"
import { listPayerAccounts } from "@/models/payer-accounts"
import { archivePayerAccountAction, createPayerAccountAction, setDefaultPayerAccountAction, updatePayerAccountAction } from "@/app/(app)/workspaces/[workspaceId]/(chrome)/settings/payments/actions"

export const dynamic = "force-dynamic"

/** #229 Q4 → #252: Admin › Configuration › Payments — the payer accounts a batch is paid from.
 * Supplier terms and bank details moved to Admin › Suppliers, where the supplier lives. */
export default async function PaymentsConfigurationPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const accounts = await listPayerAccounts(workspaceId)

  return <AdminPage title="Payments" intro="The bank accounts a payment batch is paid from. DocuBite never holds an account's credentials, and the payment file never carries its number — a payer account is the label that tells whoever uploads the file which bank portal it belongs to.">
    {!context.owner && <ReadOnlyBand owners={context.owners} />}
    <Panel title="Payer accounts">
      <PayerAccountsSettings workspaceId={workspaceId} accounts={accounts} owner={context.owner} baseCurrency={context.workspace.baseCurrency ?? "ZAR"}
        actions={{ create: createPayerAccountAction, update: updatePayerAccountAction, setDefault: setDefaultPayerAccountAction, archive: archivePayerAccountAction }} />
    </Panel>
  </AdminPage>
}
