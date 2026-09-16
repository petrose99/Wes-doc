import Link from "next/link"
import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"
import { DocTypeSwitcher } from "@/components/admin/doc-type-switcher"
import { FieldTableEditor } from "@/components/admin/field-table-editor"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { FIELD_TABLE_TYPES, isFieldTableType, type FieldTableType } from "@/lib/configuration/field-table"
import { DOC_TYPE_SPECS } from "@/lib/doc-types"
import { fieldTableStamp, getFieldTable } from "@/models/field-configs"

export const dynamic = "force-dynamic"

/** The queue each type's system views belong to — the sentence under the h1 names it so the
 * Width column is read as "a column on Invoices", not an abstract setting. */
const QUEUE_NAMES: Record<FieldTableType, string> = {
  invoice: "Invoices",
  purchase_order: "Purchase Orders",
  receipt: "Receipts",
  bank_statement: "Bank Statements",
}

/** What the tabs say on a phone, where four full names do not fit on one line. */
const SHORT_LABELS: Record<FieldTableType, string> = { invoice: "Invoice", purchase_order: "PO", receipt: "Receipt", bank_statement: "Bank" }

/** #231 Q11 (#252): Admin › Configuration › Fields — per document type, the table that drives
 * the Detail pane (Editable, Required) and the queue's system-view columns (Width, order). */
export default async function ConfigurationFieldsPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { workspaceId } = await params
  const { type } = await searchParams
  const context = await getAdminContext(workspaceId)
  const docType: FieldTableType = isFieldTableType(type) ? type : "invoice"
  const [table, stamp] = await Promise.all([getFieldTable(workspaceId, docType), fieldTableStamp(workspaceId, docType)])
  const typeLabel = DOC_TYPE_SPECS[docType].label
  const panelId = "field-table"

  return <AdminPage
    title="Fields"
    intro={<>Each row is one field on the {typeLabel} Detail pane. <strong className="font-medium text-slate-800">Editable</strong> lets a reviewer change it; <strong className="font-medium text-slate-800">Required</strong> holds the document in review until it has a value; <strong className="font-medium text-slate-800">Width</strong> sets its column in the {QUEUE_NAMES[docType]} queue. Custom fields come from this company&rsquo;s <Link href={adminPaths(workspaceId).whatsOn} className="font-medium text-emerald-700 underline-offset-2 hover:underline">document templates</Link>.</>}
    aside={<DocTypeSwitcher basePath={adminPaths(workspaceId).fields} current={docType} panelId={panelId}
      types={FIELD_TABLE_TYPES.map((value) => ({ value, label: DOC_TYPE_SPECS[value].label, shortLabel: SHORT_LABELS[value] }))} />}
  >
    {!context.owner && <ReadOnlyBand owners={context.owners} />}
    <div id={panelId} role="tabpanel" aria-label={`${typeLabel} fields`}>
      <FieldTableEditor key={docType} workspaceId={workspaceId} docType={docType} typeLabel={typeLabel} rows={table.rows} stamp={stamp} readOnly={!context.owner} />
    </div>
  </AdminPage>
}
