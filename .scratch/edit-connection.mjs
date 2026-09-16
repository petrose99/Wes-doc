import { readFileSync, writeFileSync } from 'node:fs'
const p = '/home/ubuntu/Dev/Wes-doc/components/accounting/accounting-dashboard.tsx'
let s = readFileSync(p, 'utf8')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); s = s.replace(a, b) }
rep(`function ConnectionCard({ workspaceId, isOwner, connection, job, lastSyncedAt, entityCounts, onChanged }: {
  workspaceId: string
  isOwner: boolean
  connection: Connection
  job: ProvisionJob
  lastSyncedAt: Date | null
  entityCounts: { accounts: number; vendors: number }
  onChanged: () => void
}) {`, `function ConnectionCard({ workspaceId, isOwner, connection, job, lastSyncedAt, entityCounts, onChanged, frame = "card" }: {
  workspaceId: string
  isOwner: boolean
  connection: Connection
  job: ProvisionJob
  lastSyncedAt: Date | null
  entityCounts: { accounts: number; vendors: number }
  onChanged: () => void
  /** "panel" (#248 → #252): the same behaviour inside an Admin Panel — no Card chrome, hairline
   * rules, the primary Open ledger at the top right. */
  frame?: "card" | "panel"
}) {`)
rep(`  return (
    <Card className="overflow-hidden" aria-busy={pending}>
      <div className={\`h-1 \${isActive ? "bg-emerald-500" : needsRepair ? "bg-red-400" : "bg-slate-200"}\`} />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-slate-400" />
          Connection
        </CardTitle>
        <CardDescription>Every workspace gets its own isolated accounting organization, created automatically — nothing to connect by hand.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback && (`, `  const body = <>
        {feedback && (`)
rep(`          </>
        )}
      </CardContent>
    </Card>
  )
}`, `          </>
        )}
  </>
  if (frame === "panel") {
    return <div className="space-y-4" aria-busy={pending}>
      {isActive && connection?.externalTenantId && (
        <a href={\`/api/accounting/session?workspaceId=\${workspaceId}\`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">
          Open ledger <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
      )}
      {body}
    </div>
  }
  return (
    <Card className="overflow-hidden" aria-busy={pending}>
      <div className={\`h-1 \${isActive ? "bg-emerald-500" : needsRepair ? "bg-red-400" : "bg-slate-200"}\`} />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-slate-400" />
          Connection
        </CardTitle>
        <CardDescription>Every workspace gets its own isolated accounting organization, created automatically — nothing to connect by hand.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{body}</CardContent>
    </Card>
  )
}

/** #248 → #252: Admin › Integrations › Ledger connection — Finance's ConnectionCard behaviour
 * (status line, Sync now, default expense account, Open ledger) inside an Admin Panel. */
export function LedgerConnectionPanel({ workspaceId, isOwner, connection, job, lastSyncedAt, entityCounts }: {
  workspaceId: string
  isOwner: boolean
  connection: Connection
  job: ProvisionJob
  lastSyncedAt: Date | null
  entityCounts: { accounts: number; vendors: number }
}) {
  const router = useRouter()
  return <ConnectionCard frame="panel" workspaceId={workspaceId} isOwner={isOwner} connection={connection} job={job} lastSyncedAt={lastSyncedAt} entityCounts={entityCounts} onChanged={() => router.refresh()} />
}`)
// hairline tokens in the panel body
s = s.replace(/border border-slate-100 bg-slate-50\/50/g, 'border border-hairline bg-slate-50/50').replace(/border-t border-slate-100 pt-4/g, 'border-t border-hairline pt-4').replace(/rounded-lg border border-slate-100 px-4 py-3/g, 'rounded-lg border border-hairline px-4 py-3')
s = s.replace('text-[10px] font-medium uppercase tracking-wider text-slate-400">Accounts', 'text-[11px] font-medium uppercase tracking-wider text-slate-600">Accounts').replace('text-[10px] font-medium uppercase tracking-wider text-slate-400">Vendors', 'text-[11px] font-medium uppercase tracking-wider text-slate-600">Suppliers')
s = s.replace('<span className="ml-auto text-xs text-slate-400" suppressHydrationWarning>', '<span className="ml-auto text-xs text-slate-600" suppressHydrationWarning>')
s = s.replace('{job?.errorCode && !isActive && <p className="mt-0.5 text-xs text-slate-400">', '{job?.errorCode && !isActive && <p className="mt-0.5 text-xs text-slate-600">')
s = s.replace(': needsRepair ? "text-red-600" : "text-slate-400"}`}>', ': needsRepair ? "text-red-700" : "text-slate-600"}`}>')
writeFileSync(p, s)
console.log('ok')
