import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc'
let p, s
const load = (f) => { p = `${root}/${f}`; s = readFileSync(p, 'utf8') }
const save = () => writeFileSync(p, s)
const rep = (a, b) => { if (!s.includes(a)) throw new Error(`missing in ${p}: ` + a.slice(0, 70)); s = s.replace(a, b) }

load('components/queue/receipt-queue.tsx')
rep(`import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"`, `import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import type { FieldTable } from "@/lib/configuration/field-table"`)
rep(`export function ReceiptQueue({ workspaceId, basePath, receipts, minConfidencePercent, views, stat, initialSelectedId }: {
  workspaceId: string
  basePath: string
  receipts: ReceiptRow[]
  minConfidencePercent: number
  views?: ReactNode
  stat?: ReactNode
  initialSelectedId?: string | null
}) {`, `export function ReceiptQueue({ workspaceId, basePath, receipts, minConfidencePercent, views, stat, initialSelectedId, fieldTable = null }: {
  workspaceId: string
  basePath: string
  receipts: ReceiptRow[]
  minConfidencePercent: number
  views?: ReactNode
  stat?: ReactNode
  initialSelectedId?: string | null
  /** #252: Admin › Configuration › Fields for receipts, when one has been saved. */
  fieldTable?: FieldTable | null
}) {`)
rep(`    columns={columns}\n`, `    columns={columns}\n    fieldTable={fieldTable}\n`)
save()

load('app/(app)/workspaces/[workspaceId]/(queue)/receipts/page.tsx')
rep(`import { listSavedViews } from "@/models/saved-views"`, `import { listSavedViews } from "@/models/saved-views"
import { getSavedFieldTable } from "@/models/field-configs"`)
rep(`  const [{ receipts }, minConfidencePercent, savedViews, matchRate] = await Promise.all([
    listWorkspaceReceipts({ workspaceId, statusFilter, claimFilter, onlyTouchless }),
    getMinConfidencePercent(workspaceId),
    listSavedViews({ workspaceId, viewKey: "receipts", userId: user.id }),
    getDocumentMatchRateStats(workspaceId, "receipt", ["invoice_to_receipt", "po_to_receipt"]),
  ])`, `  const [{ receipts }, minConfidencePercent, savedViews, matchRate, fieldTable] = await Promise.all([
    listWorkspaceReceipts({ workspaceId, statusFilter, claimFilter, onlyTouchless }),
    getMinConfidencePercent(workspaceId),
    listSavedViews({ workspaceId, viewKey: "receipts", userId: user.id }),
    getDocumentMatchRateStats(workspaceId, "receipt", ["invoice_to_receipt", "po_to_receipt"]),
    getSavedFieldTable(workspaceId, "receipt"),
  ])`)
rep(`    receipts={receipts}
    minConfidencePercent={minConfidencePercent}`, `    receipts={receipts}
    minConfidencePercent={minConfidencePercent}
    fieldTable={fieldTable}`)
save()

load('components/queue/document-queue.tsx')
rep(`export function DocumentQueue({ workspaceId, basePath, title, noun, itemType, rows, supplierLabel = "Supplier", views, stat, initialSelectedId, emptyBody, showInstitution = false, purchaseOrders = false }: {`,
    `export function DocumentQueue({ workspaceId, basePath, title, noun, itemType, rows, supplierLabel = "Supplier", views, stat, initialSelectedId, emptyBody, showInstitution = false, purchaseOrders = false, fieldTable = null }: {
  /** #252: Admin › Configuration › Fields for this queue's type, when one has been saved. */
  fieldTable?: FieldTable | null`)
rep(`      key: "supplier", label: supplierLabel, narrow: true, className: "min-w-[12rem]",`, `      key: "supplier", label: supplierLabel, narrow: true, className: "min-w-[12rem]", fieldKey: purchaseOrders ? "supplier" : "bank_name",`)
rep(`      { key: "po_number", label: "PO #", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", render:`, `      { key: "po_number", label: "PO #", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", fieldKey: "po_number", render:`)
rep(`      { key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", render: (row: DocumentQueueRow) => <>{row.total ?? "—"}</> },
      { key: "invoiced"`, `      { key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", fieldKey: "total", render: (row: DocumentQueueRow) => <>{row.total ?? "—"}</> },
      { key: "invoiced"`)
rep(`    columns={columns}\n`, `    columns={columns}\n    fieldTable={fieldTable}\n`)
save()
if (!s.includes('type FieldTable')) {
  s = s.replace(`import { QueueScreen`, `import type { FieldTable } from "@/lib/configuration/field-table"\nimport { QueueScreen`)
  save()
}

load('app/(app)/workspaces/[workspaceId]/(queue)/document-queue-page.tsx')
rep(`  return <DocumentQueue
    workspaceId={workspaceId}`, `  const fieldTable = await getSavedFieldTable(workspaceId, docType)
  return <DocumentQueue
    fieldTable={fieldTable}
    workspaceId={workspaceId}`)
rep(`import { DocumentQueue, type DocumentQueueRow } from "@/components/queue/document-queue"`, `import { DocumentQueue, type DocumentQueueRow } from "@/components/queue/document-queue"
import { getSavedFieldTable } from "@/models/field-configs"`)
save()
console.log('ok')
