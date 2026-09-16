// #251 confirming-round fixes: dialog resets, from= on the remaining hops, facet labels, Reject… ellipsis.
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc/'
const edit = (p, pairs) => { let s = readFileSync(root + p, 'utf8'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(p + ' missing: ' + a.slice(0, 70)); s = s.split(a).join(b) } writeFileSync(root + p, s) }

edit('components/list-screen/reason-dialog-button.tsx', [
  [`  const close = () => { onClose(); setError(null) }`, `  // A cancelled reason never carries over to the next thing this dialog is opened for (#251).
  const close = () => { onClose(); setError(null); setReason("") }`],
])

edit('components/payments/bill-pay-queue.tsx', [
  [`  const [accountId, setAccountId] = useState(accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return <Dialog open={open} onClose={() => { if (!busy) onClose() }} title="Set Pay From"`, `  const initial = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? ""
  const [accountId, setAccountId] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (busy) return; onClose(); setAccountId(initial); setError(null) }
  return <Dialog open={open} onClose={close} title="Set Pay From"`],
  [`      try { const result = await onSubmit(accountId); if (!result.success) setError(result.error ?? "Couldn't set Pay From."); else onClose() }`, `      try { const result = await onSubmit(accountId); if (!result.success) setError(result.error ?? "Couldn't set Pay From."); else close() }`],
  [`        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !accountId}>{busy ? "Saving…" : "Set Pay From"}</Button>`, `        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !accountId}>{busy ? "Saving…" : "Set Pay From"}</Button>`],
  [`<Button asChild size="sm" variant="outline"><Link className="py-1.5" href={\`\${batchesHref}/\${row.scheduledBatch.id}\`}>`, `<Button asChild size="sm" variant="outline"><Link className="py-1.5" href={withOrigin(\`\${batchesHref}/\${row.scheduledBatch.id}\`, origin)}>`],
  [`      { value: "current", label: "Not yet due" }, { value: "1-30", label: "1–30 days overdue" }, { value: "31-60", label: "31–60 days" },
      { value: "61-90", label: "61–90 days" }, { value: "90+", label: "90+ days" }, { value: "none", label: "No due date" },`, `      { value: "current", label: "Not yet due" }, { value: "1-30", label: "1–30 days overdue" }, { value: "31-60", label: "31–60 days overdue" },
      { value: "61-90", label: "61–90 days overdue" }, { value: "90+", label: "90+ days overdue" }, { value: "none", label: "No due date" },`],
  // the dialog's hops carry the origin too
  [`    <CreateBatchDialog open={batching !== null} onClose={() => setBatching(null)} rows={batching ? selectedRows(batching) : []}
      suggestedName={suggestedBatchName} fallbackCurrency={fallbackCurrency} batchesHref={batchesHref}`, `    <CreateBatchDialog open={batching !== null} onClose={() => setBatching(null)} rows={batching ? selectedRows(batching) : []}
      suggestedName={suggestedBatchName} fallbackCurrency={fallbackCurrency} batchesHref={batchesHref} origin={origin}`],
])

edit('components/payments/create-batch-dialog.tsx', [
  [`export function CreateBatchDialog({ open, onClose, rows, suggestedName, fallbackCurrency, batchesHref, onCreate, onCreated }: {`, `export function CreateBatchDialog({ open, onClose, rows, suggestedName, fallbackCurrency, batchesHref, origin, onCreate, onCreated }: {`],
  [`  batchesHref: string
  onCreate:`, `  batchesHref: string
  /** The queue's own address, carried as \`from=\` on every hop to Payment Batches (#244). */
  origin: string
  onCreate:`],
  [`import { payerAccountLabel } from "@/lib/payments/payer-account-label"`, `import { payerAccountLabel } from "@/lib/payments/payer-account-label"
import { withOrigin } from "@/lib/navigation/origin"`],
  [`<Link href={\`\${batchesHref}/\${batch.id}\`} className="font-medium text-emerald-800 underline-offset-2 hover:underline">{batch.name}</Link>`, `<Link href={withOrigin(\`\${batchesHref}/\${batch.id}\`, origin)} className="font-medium text-emerald-800 underline-offset-2 hover:underline">{batch.name}</Link>`],
  [`<Button asChild size="sm" variant="outline"><Link className="py-1.5" href={batchesHref}>Open Payment Batches</Link></Button>`, `<Button asChild size="sm" variant="outline"><Link className="py-1.5" href={withOrigin(batchesHref, origin)}>Open Payment Batches</Link></Button>`],
  [`<Link href={\`\${batchesHref}/\${row.scheduledBatch.id}\`} className="text-emerald-800 underline-offset-2 hover:underline">Already in {row.scheduledBatch.name ?? "a batch"}</Link>`, `<Link href={withOrigin(\`\${batchesHref}/\${row.scheduledBatch.id}\`, origin)} className="text-emerald-800 underline-offset-2 hover:underline">Already in {row.scheduledBatch.name ?? "a batch"}</Link>`],
])

edit('components/payments/batch-queue.tsx', [
  [`<Link className="py-1.5" href={\`/workspaces/\${workspaceId}/settings/payments\`}><Landmark className="h-3.5 w-3.5" aria-hidden />Fix bank details to download</Link>`, `<Link className="py-1.5" href={withOrigin(\`/workspaces/\${workspaceId}/settings/payments\`, origin)}><Landmark className="h-3.5 w-3.5" aria-hidden />Fix bank details to download</Link>`],
  [`import Link from "next/link"`, `import Link from "next/link"
import { withOrigin } from "@/lib/navigation/origin"
import { useOriginHere } from "@/components/documents/po-compare"`],
  [`  const router = useRouter()
  const [approving, setApproving]`, `  const router = useRouter()
  const origin = useOriginHere()
  const [approving, setApproving]`],
  // "…" = the control opens a dialog that needs more from you (a reason, a date); a bare confirm gets none — the shell's own convention (Cancel invoice…).
  [`onClick={() => setRejecting(batch)}><XCircle className="h-3.5 w-3.5" aria-hidden />Reject</Button>`, `onClick={() => setRejecting(batch)}><XCircle className="h-3.5 w-3.5" aria-hidden />Reject…</Button>`],
])

edit('components/payments/batch-detail.tsx', [
  [`<Link href={\`/workspaces/\${workspaceId}/settings/payments\`} className="underline">Settings › Payments</Link>`, `<Link href={withOrigin(\`/workspaces/\${workspaceId}/settings/payments\`, origin)} className="underline">Settings › Payments</Link>`],
])
console.log('ok')
