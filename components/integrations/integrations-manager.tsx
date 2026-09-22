"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/admin/panel-card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createApiKeyAction,
  createWebhookEndpointAction,
  deleteWebhookEndpointAction,
  redeliverDeliveryAction,
  revokeApiKeyAction,
  setWebhookEndpointStatusAction,
} from "@/app/(app)/workspaces/[workspaceId]/integrations-actions"
import {
  disconnectIntegrationAction,
  listExpenseAccountsAction,
  setDefaultExpenseAccountAction,
  syncAccountingEntitiesAction,
} from "@/app/(app)/workspaces/[workspaceId]/integration-connection-actions"
import { Check, Copy } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

type ApiKey = { id: string; name: string; keyPrefix: string; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }
type Endpoint = { id: string; url: string; events: string[]; status: string; failureCount: number; createdAt: Date }
type Delivery = { id: string; endpointId: string; eventType: string; status: string; attempts: number; responseStatus: number | null; errorCode: string | null; deliveredAt: Date | null; createdAt: Date }
type IntegrationConnection = {
  id: string
  provider: string
  externalTenantId: string | null
  tenantName: string | null
  status: string
  defaultExpenseAccountId: string | null
  defaultExpenseAccountName: string | null
  createdAt: Date
  lastSyncedAt: Date | null
}

// Kept in sync with lib/finance/actions.ts's copy (that module can't import client components) —
// this is the only client-side fork; both list the same providers.
const PROVIDER_LABELS: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero" }

/** One connected-provider card: shows tenant/status, a default-expense-account picker (fetched live
 * from the provider on demand — the chart of accounts isn't cached), and Disconnect. */
function AccountingConnectionCard({ workspaceId, connection, isOwner, onChanged }: {
  workspaceId: string
  connection: IntegrationConnection
  isOwner: boolean
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  const loadAccounts = () => {
    setLoadingAccounts(true)
    startTransition(async () => {
      const res = await listExpenseAccountsAction(workspaceId, connection.id)
      setLoadingAccounts(false)
      if (res.success) setAccounts(res.data ?? [])
      else toast.error(res.error || "Could not load expense accounts")
    })
  }

  const onSelectAccount = (accountId: string) => {
    const account = accounts?.find((a) => a.id === accountId)
    if (!account) return
    startTransition(async () => {
      const res = await setDefaultExpenseAccountAction(workspaceId, connection.id, account.id, account.name)
      if (res.success) onChanged()
      else toast.error(res.error || "Could not set the default account")
    })
  }

  return (
    <li className="rounded-md border border-hairline px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="min-w-0 basis-full sm:basis-auto">
          <span className="font-medium">{PROVIDER_LABELS[connection.provider] ?? connection.provider}</span>{" "}
          <span className="text-xs text-slate-600">{connection.tenantName || connection.externalTenantId}</span>
          {connection.status === "needs_reconnect" && <span className="ml-2 text-xs text-red-600">needs reconnect</span>}
        </span>
        {isOwner && connection.status === "connected" && (
          <Button type="button" size="sm" variant="ghost" disabled={pending}
            onClick={() => startTransition(async () => {
              const res = await syncAccountingEntitiesAction(workspaceId, connection.id)
              if (res.success) onChanged()
              else toast.error(res.error || "Could not sync accounts")
            })}>
            Sync accounts
          </Button>
        )}
        {isOwner && (
          <Button type="button" size="sm" variant="ghost" disabled={pending}
            onClick={() => setDisconnectOpen(true)}>
            Disconnect
          </Button>
        )}
      </div>
      {isOwner && connection.status === "connected" && (
        <p className={connection.lastSyncedAt ? "mt-1 text-xs text-slate-600" : "mt-1 text-xs font-medium text-slate-700"}>
          {connection.lastSyncedAt ? `Accounts last synced ${connection.lastSyncedAt.toLocaleString()}` : "Accounts not yet synced"}
        </p>
      )}
      {isOwner && connection.status === "connected" && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <Label htmlFor={`account-${connection.id}`} className="shrink-0 text-slate-600">Default expense account</Label>
          {accounts === null ? (
            <Button type="button" size="sm" variant="outline" disabled={loadingAccounts} onClick={loadAccounts}>
              {connection.defaultExpenseAccountName || (loadingAccounts ? "Loading…" : "Choose account")}
            </Button>
          ) : (
            <select
              id={`account-${connection.id}`}
              className="rounded border px-2 py-1 text-xs"
              defaultValue={connection.defaultExpenseAccountId ?? ""}
              disabled={pending}
              onChange={(e) => onSelectAccount(e.target.value)}
            >
              <option value="" disabled>Select an account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>
      )}
      <ConfirmDialog
        open={disconnectOpen}
        destructive
        busy={pending}
        title={`Disconnect ${PROVIDER_LABELS[connection.provider] ?? connection.provider}?`}
        description="New pushes to this provider will stop. Existing ledger records will not be removed."
        confirmLabel={pending ? "Disconnecting…" : "Disconnect provider"}
        onConfirm={() => startTransition(async () => {
          const res = await disconnectIntegrationAction(workspaceId, connection.id)
          if (res.success) { setDisconnectOpen(false); onChanged() }
          else toast.error(res.error || "Could not disconnect")
        })}
        onCancel={() => setDisconnectOpen(false)} />
    </li>
  )
}

/** The one place a freshly-minted secret is shown. Once dismissed it is gone: we only stored the
 * hash / ciphertext, so there is no way to show it again — which the copy affordance makes plain. */
function SecretReveal({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Could not copy — select and copy manually")
    }
  }
  return (
    <div className="rounded-md border border-indigo-300 bg-indigo-50 p-3">
      <p className="text-sm font-medium text-indigo-900">{label}</p>
      <p className="mt-1 text-xs text-indigo-800">Copy it now — it won&apos;t be shown again.</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="block flex-1 break-all rounded bg-white px-2 py-1 font-mono text-xs">{value}</code>
        <Button type="button" size="icon" variant="outline" onClick={copy} aria-label="Copy">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={onDone}>Done</Button>
    </div>
  )
}

export function IntegrationsManager({
  workspaceId, isOwner, eventTypes, apiKeys, endpoints, deliveries, nangoEnabled, connections,
}: {
  workspaceId: string
  isOwner: boolean
  eventTypes: string[]
  apiKeys: ApiKey[]
  endpoints: Endpoint[]
  deliveries: Delivery[]
  nangoEnabled: boolean
  connections: IntegrationConnection[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [keyName, setKeyName] = useState("")
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [url, setUrl] = useState("")
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [freshSecret, setFreshSecret] = useState<string | null>(null)
  const [revokeKey, setRevokeKey] = useState<ApiKey | null>(null)
  const [deleteEndpoint, setDeleteEndpoint] = useState<Endpoint | null>(null)

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, onOk?: () => void) =>
    startTransition(async () => {
      const res = await fn()
      if (res.success) { onOk?.(); router.refresh() }
      else toast.error(res.error || "Something went wrong")
    })

  const toggleEvent = (type: string) =>
    setSelectedEvents((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]))

  const connectionsByProvider = new Map(connections.map((c) => [c.provider, c]))
  const anyProviderConfigured = nangoEnabled
  const hasAnyConnection = connections.length > 0

  return (
    <div className="space-y-10">
      {/* Accounting connectors (P2) — omitted entirely if no provider is configured on this deployment. */}
      {anyProviderConfigured && (
        <Card>
          <CardHeader>
            <CardTitle>Accounting</CardTitle>
            <CardDescription>
              {hasAnyConnection
                ? "Push a reviewed invoice or receipt as a bill to your connected system."
                : "Connect QuickBooks or Xero to push a reviewed invoice or receipt as a bill. Already use one of these to run your books? Pick that one — DocuBite posts to whichever you connect, nothing changes which system stays your ledger of record."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {(["quickbooks", "xero"] as const)
                .map((provider) => {
                  const connection = connectionsByProvider.get(provider)
                  if (connection) {
                    return (
                      <AccountingConnectionCard
                        key={provider}
                        workspaceId={workspaceId}
                        connection={connection}
                        isOwner={isOwner}
                        onChanged={() => router.refresh()}
                      />
                    )
                  }
                  return (
                    <li key={provider} className="flex items-center justify-between rounded-md border border-hairline px-3 py-2">
                      <span className="font-medium">{PROVIDER_LABELS[provider]}</span>
                      {isOwner ? (
                        <a
                          className="text-sm font-medium text-emerald-700 hover:underline"
                          href={`/api/integrations/${provider}/connect?workspaceId=${workspaceId}`}
                        >
                          Connect
                        </a>
                      ) : (
                        <span className="text-xs text-slate-600">Not connected</span>
                      )}
                    </li>
                  )
                })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* API keys */}
      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>Authenticate requests to the DocuBite API (<code className="font-mono text-xs">/api/v1</code>). Send the key as <code className="font-mono text-xs">Authorization: Bearer …</code>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {freshKey && <SecretReveal label="Your new API key" value={freshKey} onDone={() => setFreshKey(null)} />}
          {isOwner && (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                run(() => createApiKeyAction(workspaceId, keyName), () => setKeyName(""))
              }}
            >
              <div className="flex-1">
                <Label htmlFor="key-name">Name</Label>
                <Input id="key-name" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="e.g. Zapier" />
              </div>
              <Button type="submit" disabled={pending}>Create key</Button>
            </form>
          )}
          <ul className="space-y-1 text-sm">
            {apiKeys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{key.name}</span>{" "}
                  <code className="font-mono text-xs text-slate-600">{key.keyPrefix}…</code>
                  {key.revokedAt && <span className="ml-2 text-xs text-red-600">revoked</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-slate-600">{key.lastUsedAt ? `used ${new Date(key.lastUsedAt).toLocaleDateString()}` : "never used"}</span>
                  {isOwner && !key.revokedAt && (
                    <Button type="button" size="sm" variant="ghost" disabled={pending}
                      onClick={() => setRevokeKey(key)}>
                      Revoke
                    </Button>
                  )}
                </span>
              </li>
            ))}
            {!apiKeys.length && <li className="text-slate-600">No API keys yet.</li>}
          </ul>
          <ConfirmDialog
            open={revokeKey !== null}
            destructive
            busy={pending}
            title={`Revoke ${revokeKey?.name ?? "this API key"}?`}
            description="Requests using this key will stop working immediately. This cannot be undone."
            confirmLabel={pending ? "Revoking…" : "Revoke API key"}
            onConfirm={() => {
              if (!revokeKey) return
              run(() => revokeApiKeyAction(workspaceId, revokeKey.id), () => setRevokeKey(null))
            }}
            onCancel={() => setRevokeKey(null)} />
        </CardContent>
      </Card>

      {/* Webhook endpoints */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook endpoints</CardTitle>
          <CardDescription>Receive a signed POST when documents change. Verify the <code className="font-mono text-xs">X-DocuBite-Signature</code> header with the signing secret.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {freshSecret && <SecretReveal label="Signing secret for this endpoint" value={freshSecret} onDone={() => setFreshSecret(null)} />}
          {isOwner && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                run(
                  () => createWebhookEndpointAction(workspaceId, url, selectedEvents),
                  () => { setUrl(""); setSelectedEvents([]) },
                )
              }}
            >
              <div>
                <Label htmlFor="endpoint-url">Endpoint URL (https)</Label>
                <Input id="endpoint-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.com/docubite" required />
              </div>
              <fieldset>
                <legend className="text-sm font-medium">Events <span className="font-normal text-slate-600">(none selected = all)</span></legend>
                <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {eventTypes.map((type) => (
                    <label key={type} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={selectedEvents.includes(type)} onChange={() => toggleEvent(type)} />
                      <span className="font-mono">{type}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button type="submit" disabled={pending}>Add endpoint</Button>
            </form>
          )}
          <ul className="space-y-1 text-sm">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="flex items-center justify-between gap-3 rounded-md border border-hairline px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs">{endpoint.url}</span>
                  <span className="text-xs text-slate-600">
                    {endpoint.events.length ? endpoint.events.join(", ") : "all events"}
                    {endpoint.status !== "active" && <span className="ml-2 text-red-600">disabled</span>}
                  </span>
                </span>
                {isOwner && (
                  <span className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="ghost" disabled={pending}
                      onClick={() => run(() => setWebhookEndpointStatusAction(workspaceId, endpoint.id, endpoint.status === "active" ? "disabled" : "active"))}>
                      {endpoint.status === "active" ? "Disable" : "Enable"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={pending}
                      onClick={() => setDeleteEndpoint(endpoint)}>
                      Delete
                    </Button>
                  </span>
                )}
              </li>
            ))}
            {!endpoints.length && <li className="text-slate-600">No webhook endpoints yet.</li>}
          </ul>
          <ConfirmDialog
            open={deleteEndpoint !== null}
            destructive
            busy={pending}
            title="Delete this webhook endpoint?"
            description={deleteEndpoint ? `${deleteEndpoint.url} will stop receiving document events. This cannot be undone.` : undefined}
            confirmLabel={pending ? "Deleting…" : "Delete endpoint"}
            onConfirm={() => {
              if (!deleteEndpoint) return
              run(() => deleteWebhookEndpointAction(workspaceId, deleteEndpoint.id), () => setDeleteEndpoint(null))
            }}
            onCancel={() => setDeleteEndpoint(null)} />
        </CardContent>
      </Card>

      {/* Recent deliveries */}
      <Card>
        <CardHeader>
          <CardTitle>Recent deliveries</CardTitle>
          <CardDescription>The last {deliveries.length} delivery attempts. Failed deliveries retry automatically; you can also redeliver.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-600">
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Response</th>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{d.eventType}</td>
                    <td className="py-2 pr-3">
                      <span className={d.status === "delivered" ? "text-emerald-700" : d.status === "failed" ? "text-red-600" : "text-indigo-700"}>{d.status}</span>
                      {d.attempts > 1 && <span className="text-xs text-slate-600"> ·{d.attempts}×</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{d.responseStatus ?? d.errorCode ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{new Date(d.createdAt).toLocaleString()}</td>
                    <td className="py-2 text-right">
                      {isOwner && d.status !== "delivered" && (
                        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => redeliverDeliveryAction(workspaceId, d.id))}>Redeliver</Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!deliveries.length && (
                  <tr><td colSpan={5} className="py-3 text-slate-600">No deliveries yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
