import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { decimalToNumber } from "@/lib/money"
import { listPayerAccounts } from "@/models/payer-accounts"
import { requireWorkspaceRole } from "@/models/workspaces"
import { PayerAccountsSettings, SupplierPaymentsSettings, type SupplierPaymentsRow } from "@/components/settings/payments-settings"
import { archivePayerAccountAction, createPayerAccountAction, setDefaultPayerAccountAction, updatePayerAccountAction, updateSupplierPaymentsAction } from "./actions"

export const dynamic = "force-dynamic"

/** #229 Q4/Q5 (#251): Settings › Payments — the payer accounts a batch pays from and each
 * supplier's payment terms, discount and bank account. Until Admin › Suppliers (#252) ships,
 * this is where "Needs bank details" on Bill Pay sends the owner. */
export default async function PaymentsSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const owner = membership.role === "owner"
  const [accounts, workspace, suppliers] = await Promise.all([
    listPayerAccounts(workspaceId),
    prisma.workspace.findFirst({ where: { id: workspaceId }, select: { baseCurrency: true } }),
    prisma.supplier.findMany({
      where: { workspaceId },
      orderBy: { canonicalName: "asc" },
      select: { id: true, canonicalName: true, paymentTermsDays: true, earlyPaymentDiscountPercent: true, earlyPaymentDiscountDays: true, iban: true, bankDetails: true, documentCount: true },
    }),
  ])
  const rows: SupplierPaymentsRow[] = suppliers.map((s) => {
    const details = (s.bankDetails ?? {}) as Record<string, unknown>
    const account = typeof details.account === "string" ? details.account : typeof details.iban === "string" ? details.iban : s.iban
    const branchCode = typeof details.branchCode === "string" ? details.branchCode : typeof details.branch === "string" ? details.branch : null
    return { id: s.id, name: s.canonicalName, paymentTermsDays: s.paymentTermsDays, earlyPaymentDiscountPercent: decimalToNumber(s.earlyPaymentDiscountPercent), earlyPaymentDiscountDays: s.earlyPaymentDiscountDays, account: account || null, branchCode, documentCount: s.documentCount }
  })

  return <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Payer accounts</CardTitle>
        <CardDescription>The workspace bank accounts a payment batch is paid from. A label that tells whoever uploads the file which bank portal it belongs to — DocuBite never holds the account&apos;s credentials, and the payment file never carries its number.</CardDescription>
      </CardHeader>
      <CardContent>
        <PayerAccountsSettings workspaceId={workspaceId} accounts={accounts} owner={owner} baseCurrency={workspace?.baseCurrency ?? "ZAR"}
          actions={{ create: createPayerAccountAction, update: updatePayerAccountAction, setDefault: setDefaultPayerAccountAction, archive: archivePayerAccountAction }} />
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Supplier payment terms and bank details</CardTitle>
        <CardDescription>Net days infer a due date when an invoice has none; an early-payment discount (say 2% within 10 days, shown as &ldquo;2/10 net 30&rdquo;) lowers the amount to pay on Bill Pay while its window is open. The bank account is what the payment file pays to — without it an approved invoice waits on Bill Pay as &ldquo;Needs bank details&rdquo;.</CardDescription>
      </CardHeader>
      <CardContent>
        <SupplierPaymentsSettings workspaceId={workspaceId} suppliers={rows} owner={owner} action={updateSupplierPaymentsAction} />
      </CardContent>
    </Card>
  </div>
}
