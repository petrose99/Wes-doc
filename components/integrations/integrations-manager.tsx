"use client"

import { Badge } from "@/components/ui/badge"
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
  confirmSageBusinessAction,
  disconnectIntegrationAction,
  listExpenseAccountsAction,
  listSageBusinessesAction,
  setDefaultExpenseAccountAction,
  syncAccountingEntitiesAction,
} from "@/app/(app)/workspaces/[workspaceId]/integration-connection-actions"
import { NativeSelect } from "@/components/ui/native-select"
import { AccountCorrectionDialog } from "@/components/integrations/account-correction-dialog"
import { listAffectedBillsAction, type AffectedBillWithCheck } from "@/app/(app)/workspaces/[workspaceId]/account-correction-actions"
import { AlertTriangle, Check, Copy, Landmark } from "lucide-react"
import Nango, { AuthError } from "@nangohq/frontend"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { ChangeCurrencyDialog } from "@/components/admin/change-currency-dialog"
import type { CurrencyLockView } from "@/lib/admin/companies"
import { ledgerCurrencyOutcome } from "@/lib/integrations/ledger-currency-outcome"
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
  defaultExpenseAccountGuessed: boolean
  createdAt: Date
  lastSyncedAt: Date | null
  ledgerCurrency: string | null
}
/** #457 §5.4: what the card needs to compare the ledger's currency with the Company currency. */
type CompanyCurrencyContext = { currency: string; country: string | null; lock: CurrencyLockView; unpostedCount: number }

// Kept in sync with lib/finance/actions.ts's copy (that module can't import client components) —
// this is the only client-side fork; both list the same providers.
const PROVIDER_LABELS: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero", sage: "Sage" }
const PROVIDER_TILES: { provider: string; description: string; live: boolean }[] = [
  { provider: "quickbooks", description: "QuickBooks Online", live: true },
  { provider: "xero", description: "Xero", live: true },
  { provider: "sage", description: "Sage Business Cloud Accounting", live: false },
]

/** #457 §5.4: the line under the tenant row when the ledger's own currency (read on connect and
 * before each push) is unread or differs from the Company currency. Equal says nothing (H8). The
 * mismatch is amber with an icon, never colour alone, like "needs reconnect". */
function LedgerCurrencyLine({ workspaceId, connection, isOwner, company, onChanged }: {
  workspaceId: string
  connection: IntegrationConnection
  isOwner: boolean
  company: CompanyCurrencyContext
  onChanged: () => void
}) {
  const [switching, setSwitching] = useState(false)
  const switchRef = useRef<HTMLButtonElement>(null)
  const provider = PROVIDER_LABELS[connection.provider] ?? connection.provider
  const outcome = ledgerCurrencyOutcome({
    provider: connection.provider,
    ledgerCurrency: connection.ledgerCurrency,
    companyCurrency: company.currency,
    country: company.country,
    locked: company.lock.locked,
    isOwner,
  })
  if (outcome === "none") return null
  if (outcome === "unread") {
    return <p className="mt-1 text-sm text-slate-600">{`Couldn't read ${provider}'s currency yet. It's checked again before each bill is posted.`}</p>
  }
  const ledger = connection.ledgerCurrency!
  const qbo = connection.provider === "quickbooks"
  const books = qbo ? "home currency" : "base currency"
  const ledgerFact = `${provider} keeps its books in ${ledger}; this company's currency is ${company.currency}.`
  return (
    <div className="mt-1 flex flex-wrap items-start gap-x-2 gap-y-1 text-sm text-amber-800">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 max-w-[65ch] flex-1">
        {ledgerFact}{" "}
        {outcome === "ask_owner" && "Ask an Owner to change the company currency."}
        {outcome === "blocked" && `Bills won't post until they match. ${provider} doesn't let you change its ${books}, so connect a ${provider} ${qbo ? "company" : "organisation"} kept in ${company.currency}, or contact support.`}
      </p>
      {outcome === "switch" && (
        <>
          <Button ref={switchRef} type="button" size="sm" variant="outline" className="py-1.5 max-md:min-h-11" onClick={() => setSwitching(true)}>
            Switch this company to {ledger}
          </Button>
          <ChangeCurrencyDialog open={switching} workspaceId={workspaceId} companyId={workspaceId} from={company.currency} to={ledger}
            unpostedCount={company.unpostedCount} restoreFocusTo={switchRef}
            onClose={() => setSwitching(false)} onChanged={onChanged} />
        </>
      )}
    </div>
  )
}

/** One connected-provider card: shows tenant/status, a default-expense-account picker (fetched live
 * from the provider on demand — the chart of accounts isn't cached), and Disconnect. */
function AccountingConnectionCard({ workspaceId, connection, isOwner, company, onChanged }: {
  workspaceId: string
  connection: IntegrationConnection
  isOwner: boolean
  company: CompanyCurrencyContext
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  // #457 §9.9: after a Switch the mismatch line and its button unmount, so focus lands on the
  // provider name once the refreshed Company currency arrives.
  const nameRef = useRef<HTMLSpanElement>(null)
  const focusNamePending = useRef(false)
  useEffect(() => {
    if (!focusNamePending.current) return
    focusNamePending.current = false
    nameRef.current?.focus()
  }, [company.currency])
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  // #430 Screen 1: fires after a Default-account save when older bills are still posted to the
  // account being replaced. `correction` is null until listAffectedBillsAction finds ≥1 row —
  // the dialog never opens on 0 (spec: "no dialog, nothing to show").
  const [correction, setCorrection] = useState<{
    oldAccountExternalId: string; oldAccountName: string; newAccountExternalId: string; newAccountName: string; bills: AffectedBillWithCheck[]
  } | null>(null)

  // Sage's OAuth grant isn't scoped to one business (ADR 0005): the AUTH webhook creates this row
  // with externalTenantId null, and the owner picks one here before the connection is usable —
  // an empty account/sync UI underneath would be misleading until that pick is made.
  if (connection.provider === "sage" && !connection.externalTenantId) {
    return (
      <li className="rounded-md border border-hairline px-3 py-2">
        <span className="font-medium">{PROVIDER_LABELS[connection.provider] ?? connection.provider}</span>
        <SageBusinessPicker workspaceId={workspaceId} connectionId={connection.id} onChosen={onChanged} />
      </li>
    )
  }

  const loadAccounts = () => {
    setLoadingAccounts(true)
    setLoadError(null)
    startTransition(async () => {
      const res = await listExpenseAccountsAction(workspaceId, connection.id)
      setLoadingAccounts(false)
      // #429: "Reading your chart of accounts…" while this is in flight, "Couldn't read the
      // chart of accounts from {Provider}. [Try again]" on failure — the Default row's states.
      if (res.success) setAccounts(res.data ?? [])
      else {
        const message = res.error || `Couldn't read the chart of accounts from ${PROVIDER_LABELS[connection.provider] ?? connection.provider}.`
        setLoadError(message)
        toast.error(message)
      }
    })
  }

  const onSelectAccount = (accountId: string) => {
    const account = accounts?.find((a) => a.id === accountId)
    if (!account) return
    const oldAccountExternalId = connection.defaultExpenseAccountId
    const oldAccountName = connection.defaultExpenseAccountName
    startTransition(async () => {
      const res = await setDefaultExpenseAccountAction(workspaceId, connection.id, account.id, account.name)
      if (!res.success) { toast.error(res.error || "Could not set the default account"); return }
      onChanged()
      // #430 Screen 1's trigger: only meaningful when there *was* a prior default (a first-time
      // pick has nothing already posted to correct) and it actually changed.
      if (oldAccountExternalId && oldAccountExternalId !== account.id) {
        const affected = await listAffectedBillsAction(workspaceId, connection.id, oldAccountExternalId)
        if (affected.success && affected.data && affected.data.length > 0) {
          setCorrection({ oldAccountExternalId, oldAccountName: oldAccountName || "the old account", newAccountExternalId: account.id, newAccountName: account.name, bills: affected.data })
        }
      }
    })
  }

  return (
    <li className="rounded-md border border-hairline px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="min-w-0 basis-full sm:basis-auto">
          <span ref={nameRef} tabIndex={-1} className="font-medium outline-none">{PROVIDER_LABELS[connection.provider] ?? connection.provider}</span>{" "}
          <span className="text-xs text-slate-600">{connection.tenantName || connection.externalTenantId}</span>
          {connection.status === "needs_reconnect" && <span className="ml-2 text-xs font-medium text-amber-700">needs reconnect</span>}
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
      {connection.status === "connected" && (
        <LedgerCurrencyLine workspaceId={workspaceId} connection={connection} isOwner={isOwner} company={company}
          onChanged={() => { focusNamePending.current = true; onChanged() }} />
      )}
      {isOwner && connection.status === "connected" && (
        <p className={connection.lastSyncedAt ? "mt-1 text-xs text-slate-600" : "mt-1 text-xs font-medium text-slate-700"}>
          {connection.lastSyncedAt ? `Accounts last synced ${connection.lastSyncedAt.toLocaleString()}` : "Accounts not yet synced"}
        </p>
      )}
      {isOwner && connection.status === "connected" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Label htmlFor={`account-${connection.id}`} className="shrink-0 text-slate-600">Default expense account</Label>
          {accounts === null ? (
            loadingAccounts ? (
              <span className="text-slate-600" aria-live="polite">Reading your chart of accounts…</span>
            ) : loadError ? (
              <span className="text-amber-700">
                {loadError} <button type="button" className="font-medium underline underline-offset-2" onClick={loadAccounts}>Try again</button>
              </span>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={loadingAccounts} onClick={loadAccounts}>
                {connection.defaultExpenseAccountName || "Choose account"}
              </Button>
            )
          ) : (
            <NativeSelect
              id={`account-${connection.id}`}
              className="h-7 w-auto py-0 text-xs"
              defaultValue={connection.defaultExpenseAccountId ?? ""}
              disabled={pending}
              onChange={(e) => onSelectAccount(e.target.value)}
            >
              <option value="" disabled>Select an account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </NativeSelect>
          )}
          {/* Neutral, not amber — a guess isn't yet an attention state (craft-floor: amber is
              reserved for attention). Only shown once a Default exists to guess about. */}
          {connection.defaultExpenseAccountId && connection.defaultExpenseAccountGuessed && (
            <Badge variant="secondary" className="shrink-0">Guessed</Badge>
          )}
        </div>
      )}
      {isOwner && connection.status === "connected" && !connection.defaultExpenseAccountId && (
        <p className="mt-1 text-xs font-medium text-amber-700">
          Set a default expense account so pushed items have somewhere to post.
        </p>
      )}
      <ConfirmDialog
        open={disconnectOpen}
        destructive
        busy={pending}
        title={`Disconnect ${PROVIDER_LABELS[connection.provider] ?? connection.provider}?`}
        description="Existing ledger records stay posted. Future pushes stop until you reconnect, and category/account mappings will be forgotten."
        confirmLabel={pending ? "Disconnecting…" : "Disconnect provider"}
        onConfirm={() => startTransition(async () => {
          const res = await disconnectIntegrationAction(workspaceId, connection.id)
          if (res.success) { setDisconnectOpen(false); onChanged() }
          else toast.error(res.error || "Could not disconnect")
        })}
        onCancel={() => setDisconnectOpen(false)} />
      {correction && (
        <AccountCorrectionDialog
          open
          onClose={() => setCorrection(null)}
          workspaceId={workspaceId}
          connectionId={connection.id}
          provider={connection.provider}
          providerLabel={PROVIDER_LABELS[connection.provider] ?? connection.provider}
          oldAccountExternalId={correction.oldAccountExternalId}
          oldAccountName={correction.oldAccountName}
          newAccountExternalId={correction.newAccountExternalId}
          newAccountName={correction.newAccountName}
          bills={correction.bills} />
      )}
    </li>
  )
}

/** Sage's in-page "Choose a business" step (ADR 0005, #383): loads automatically once the card
 * mounts (the connection already exists — Sage's AUTH webhook fired, it just has no tenant yet),
 * and treats an empty list as a named dead end with a way out rather than an error. */
function SageBusinessPicker({ workspaceId, connectionId, onChosen }: {
  workspaceId: string
  connectionId: string
  onChosen: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listSageBusinessesAction(workspaceId, connectionId).then((res) => {
      if (cancelled) return
      if (res.success) setBusinesses(res.data ?? [])
      else setLoadError(res.error || "Could not load Sage businesses")
    })
    return () => { cancelled = true }
  }, [workspaceId, connectionId])

  const choose = (id: string, name: string) =>
    startTransition(async () => {
      const res = await confirmSageBusinessAction(workspaceId, connectionId, id, name)
      if (res.success) onChosen()
      else toast.error(res.error || "Could not confirm the business")
    })

  if (loadError) return <p className="mt-1 text-xs text-red-600">{loadError}</p>
  if (businesses === null) return <p className="mt-1 text-xs text-slate-600">Loading businesses…</p>
  if (businesses.length === 0) {
    return <p className="mt-1 text-xs text-slate-700">No businesses found on this Sage account — create one in Sage first.</p>
  }
  return (
    <div className="mt-1">
      <p className="text-xs text-slate-600">Choose a business</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {businesses.map((b) => (
          <li key={b.id}>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => choose(b.id, b.name)}>
              {b.name}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One provider tile's Connect affordance and its handshake states (state inventory from #383's
 * resolution): popup-blocked and provider-error keep the same button so the owner can retry
 * in place; a closed-early handshake reverts to idle without an error tone (the owner chose to
 * back out, that is not a failure). The AUTH webhook, not this promise resolving, is what marks
 * the connection `connected` — `onConnected` only asks the page to refresh and pick that up. */
function ProviderConnectTile({ workspaceId, provider, onConnected }: {
  workspaceId: string
  provider: string
  onConnected: () => void
}) {
  const label = PROVIDER_LABELS[provider] ?? provider
  const [phase, setPhase] = useState<"idle" | "connecting" | "popup-blocked" | "error" | "delayed">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const connect = async () => {
    setPhase("connecting")
    try {
      const res = await fetch("/api/integrations/connect-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, providerConfigKey: provider }),
      })
      if (!res.ok) {
        setErrorMessage(`${label} couldn't connect — try again or use a different account.`)
        setPhase("error")
        return
      }
      const { token } = (await res.json()) as { token: string }
      await new Nango({ connectSessionToken: token }).auth(provider)
      // Handshake resolved on the provider's side; the AUTH webhook still has to land before the
      // connection shows as connected, so keep the "connecting" label and let the refresh catch it.
      onConnected()
      setTimeout(onConnected, 1500)
      // If the webhook never lands (dropped, slow, misconfigured), don't leave the tile stuck on
      // "Connecting…" forever with no way out — after a longer wait, offer a manual recheck instead
      // of silence. `onConnected`'s router.refresh() will have already unmounted/re-rendered this
      // tile as connected by then if the webhook did land, so this only fires on the stuck path.
      setTimeout(() => setPhase((p) => (p === "connecting" ? "delayed" : p)), 12000)
    } catch (error) {
      const type = error instanceof AuthError ? error.type : undefined
      if (type === "blocked_by_browser") {
        setPhase("popup-blocked")
      } else if (type === "window_closed") {
        toast("Connect cancelled")
        setPhase("idle")
      } else {
        setErrorMessage(`${label} couldn't connect — try again or use a different account.`)
        setPhase("error")
      }
    }
  }

  if (phase === "connecting") return <span className="mt-auto text-xs text-slate-600">Connecting…</span>
  if (phase === "delayed") {
    // The provider round-trip finished but the AUTH webhook hasn't landed after a while — give the
    // owner a way out instead of leaving "Connecting…" up forever with no escape (H1/H9).
    return (
      <span className="mt-auto flex flex-col gap-1">
        <span className="text-xs text-slate-600">Still finishing up — this can take a minute.</span>
        <Button type="button" variant="link" size="sm" className="h-auto justify-start p-0 text-emerald-700" onClick={onConnected}>
          Check again
        </Button>
      </span>
    )
  }
  if (phase === "popup-blocked") {
    return (
      <span className="mt-auto flex flex-col gap-1">
        <span className="text-xs text-red-600">Connect was blocked — allow pop-ups for this site and try again.</span>
        <Button type="button" variant="link" size="sm" className="h-auto justify-start p-0 text-emerald-700" onClick={connect}>Try again</Button>
      </span>
    )
  }
  if (phase === "error") {
    return (
      <span className="mt-auto flex flex-col gap-1">
        <span className="text-xs text-red-600">{errorMessage}</span>
        <Button type="button" variant="link" size="sm" className="h-auto justify-start p-0 text-emerald-700" onClick={connect}>Try again</Button>
      </span>
    )
  }
  return (
    <Button type="button" variant="link" size="sm" className="mt-auto h-auto justify-start p-0 text-emerald-700" onClick={connect}>
      Connect
    </Button>
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
  workspaceId, isOwner, eventTypes, apiKeys, endpoints, deliveries, nangoEnabled, connections, company,
}: {
  workspaceId: string
  isOwner: boolean
  eventTypes: string[]
  apiKeys: ApiKey[]
  endpoints: Endpoint[]
  deliveries: Delivery[]
  nangoEnabled: boolean
  connections: IntegrationConnection[]
  company: CompanyCurrencyContext
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
            {hasAnyConnection ? (
              <ul className="space-y-2 text-sm">
                {(["quickbooks", "xero", "sage"] as const)
                  .filter((provider) => connectionsByProvider.has(provider))
                  .map((provider) => (
                    <AccountingConnectionCard
                      key={provider}
                      workspaceId={workspaceId}
                      connection={connectionsByProvider.get(provider)!}
                      isOwner={isOwner}
                      company={company}
                      onChanged={() => router.refresh()}
                    />
                  ))}
              </ul>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-3">
                {PROVIDER_TILES.map(({ provider, description, live }) => (
                  <li
                    key={provider}
                    className={`flex flex-col gap-2 rounded-md border border-hairline p-4 ${live ? "" : "opacity-60"}`}
                  >
                    <Landmark className="h-5 w-5 text-slate-500" aria-hidden />
                    <span className="font-medium">{PROVIDER_LABELS[provider]}</span>
                    <span className="text-xs text-slate-600">{description}</span>
                    {live ? (
                      isOwner ? (
                        <ProviderConnectTile workspaceId={workspaceId} provider={provider} onConnected={() => router.refresh()} />
                      ) : (
                        <span className="mt-auto text-xs text-slate-600">Not connected</span>
                      )
                    ) : (
                      <span className="mt-auto text-xs text-slate-500">Coming soon</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
