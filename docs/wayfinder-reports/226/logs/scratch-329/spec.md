# Spec — #329 Execute: fold Bigcapital into the connector panel (#292)

Mode: Operate (`impeccable` — this is Admin, a task surface). Surface: Admin › Integrations
(`app/(app)/workspaces/[workspaceId]/admin/integrations/page.tsx`), one screen, no new route.
Skills run: Intent `strategize`→`journey`→`articulate` (Action Summary on #292/#329);
Impeccable `shape`→`distill`→`clarify`, ending `polish`. Decided facts (#292, cited not
re-argued): every workspace starts Not connected, no default provider, `Provisioning…` retires
as a user word, action vocabulary (Post/Posted/Ledger) is unchanged.

## 1. Screen: Admin › Integrations, Accounting card

**Intent:** an owner picks one ledger provider and authorises it; no provider is silently
running underneath them. Removing this card would leave owners unable to see or change which
ledger the company posts to.

**Behaviour.** One `Card` titled "Accounting" (`components/integrations/integrations-manager.tsx`
`IntegrationsManager`), a `<ul>` of exactly the providers this deployment has configured, now
three instead of two: `(["quickbooks", "xero", "bigcapital"] as const).filter(provider =>
accountingProviders[provider])`. `accountingProviders` prop gains `bigcapital: boolean`
(`config.integrations.bigcapital.enabled`, passed from `page.tsx`). The card is omitted only when
*no* provider is configured on the deployment (`anyProviderConfigured` extended with
`|| accountingProviders.bigcapital`).

**Help at the point of choice (H10).** The card's existing `CardDescription` ("Connect QuickBooks
or Xero to push a reviewed invoice or receipt as a bill.") becomes "Connect QuickBooks, Xero or
Bigcapital to push a reviewed invoice or receipt as a bill. Already use one of these to run your
books? Pick that one — DocuBite posts to whichever you connect, nothing changes which system stays
your ledger of record." This is the one sentence a first-time owner needs to choose among three
otherwise-unlabelled options; it does not describe what Bigcapital *is* (out of scope, a marketing
question, not this admin screen's job) but does answer "how do I pick", which is the actual
decision point.

**Per-provider row, one of four states** (per #292's decided state list):

1. **Not connected** — `<li>` with provider name + "Connect" link/button, right-aligned. For
   QuickBooks/Xero, unchanged: `<a href="/api/integrations/{provider}/connect?...">Connect</a>`
   (owner-only; non-owner sees "Not connected" text, no control). For Bigcapital: no OAuth route
   exists or is needed (models/bigcapital.ts provisions via job, not a redirect) — the row's
   "Connect" is a `<button>` calling `repairBigcapitalConnectionAction(workspaceId)` (already
   exists, `app/(app)/workspaces/[workspaceId]/accounting-actions.ts:57`, idempotent, owner-gated
   server-side). This is the "sized as its own build step" fork the ticket named: it is **not**
   needed — the existing action is a direct, callable-from-a-user-action path already.
2. **Authorising…** — Bigcapital only (QuickBooks/Xero leave the page for their OAuth redirect
   and never render this state client-side, so nothing about Bigcapital's connect *looks* slower —
   it just doesn't navigate away). Entered the instant `repairBigcapitalConnectionAction` resolves
   `{success:true}`; the row shows a spinner + "Authorising…" (not "Provisioning…" — #292 retires
   that word from user-facing copy) and no controls. Client polls
   `getBigcapitalStatusAction(workspaceId)` (already exists,
   `app/(app)/workspaces/[workspaceId]/accounting-actions.ts:25`) every 2s; on a `connection`
   appearing, calls `router.refresh()` and stops polling; on `job.status` settling to anything but
   `pending` with still no connection, stops polling and falls to Needs reconnect (see state 4)
   with a toast naming `job.errorCode`. Poll stops on unmount (cleanup in the effect).
3. **Connected** — `<AccountingConnectionCard>`-shaped row (the existing QB/Xero component,
   generalised — see B4): provider name, `tenantName` (Bigcapital: the auto-named org, e.g. the
   company name), "Sync now" (owner-only, reuses `syncAccountingEntitiesAction`, already
   provider-agnostic), default-expense-account picker (reused, already provider-agnostic),
   Disconnect. **Decided scope (resolved by investigation, not deferred):** QuickBooks/Xero have no
   destination link today (`AccountingConnectionCard` never had one) and no session/deep-link route
   exists for either (`app/api/integrations/{provider}/` has only `connect`/`callback`) — building
   one for each is new route-level scope #292's Files-in-scope list doesn't name. So "Open in
   ‹Provider›" ships **for Bigcapital only** this ticket, reusing the existing
   `/api/accounting/session?workspaceId=` route (`accounting-dashboard.tsx:194`). This makes the
   Connected row's shape genuinely differ by provider (Bigcapital gets one more link than
   QuickBooks/Xero) — named here as a real, accepted H4 cost (see preflight B4/H4), not hidden as a
   consistency win. QuickBooks/Xero destination links are **fog** for the map (`Not yet specified`):
   revisit once/if a QB/Xero deep-link route is built for another reason.
4. **Needs reconnect** — row shows "‹Provider› · needs reconnect" in red (existing pattern,
   `integrations-manager.tsx:83`) + a "Reconnect" control: QB/Xero re-run their Connect href;
   Bigcapital re-runs `repairBigcapitalConnectionAction` (same call as first Connect — the action
   is already idempotent for this).

**Copy (exact strings):**
- Row label: provider display name only (`PROVIDER_LABELS`, extended with `bigcapital:
  "Bigcapital"` — already present verbatim in `lib/finance/actions.ts:7`; move/reuse, don't
  re-type, see B3).
- Not connected, non-owner: "Not connected"
- Not connected, owner: control label "Connect"
- Authorising (Bigcapital only): "Authorising…"
- Connected: "Connected · {tenantName}" as the status line — **decided, not deferred**: the
  provider name is already the row's own label (each `<li>` is headed by `PROVIDER_LABELS[provider]`),
  so repeating "(Xero)" inside the status line is redundant; unchanged from the existing
  QuickBooks/Xero status text (`integrations-manager.tsx:82`, already just `{tenantName ||
  externalTenantId}`, no provider suffix). Bigcapital's Connected row matches this exact existing
  format — no new copy decision, an existing one it inherits.
- Needs reconnect: "needs reconnect" (existing lowercase red suffix, unchanged) + control label
  "Reconnect"
- Destination link: "Open in QuickBooks" / "Open in Xero" / "Open in Bigcapital"
- Disconnect confirm (existing `ConfirmDialog`, unchanged copy, provider name interpolated):
  title `Disconnect {Provider}?`, body "New pushes to this provider will stop. Existing ledger
  records will not be removed.", confirm "Disconnect provider"
- Sync error / connect error: existing `toast.error(res.error || "…")` fallback strings, unchanged
  pattern; Bigcapital's connect failure toast: "Could not connect — {job.errorCode, spaced}" (same
  shape as `accounting-dashboard.tsx:72`'s existing "Could not start provisioning" text, reworded
  since we're retiring "provisioning" as a user word → "Could not connect Bigcapital").

## 2. Ledger connection Panel — removed

`admin/integrations/page.tsx` drops the whole `{ledgerEnabled && <Panel title="Ledger
connection"...>}` block (lines 32, 38-39, 41-44 data-fetching for `ledger`/`job` and the
`<Panel>` at 57-59) — Bigcapital's card now lives inside `IntegrationsManager` per §1. The page's
`intro` sentence drops its implicit single-ledger framing ("The ledger this company posts to…" →
"Connect an accounting provider, manage API keys and webhooks, and map categories to accounts.").
`accountingProviders` prop widens to `{ quickbooks, xero, bigcapital }`; `connections` prop
(`connectionsWithSync`) already includes every provider row via `listWorkspaceIntegrationConnections`
— verify it is not filtered to non-bigcapital anywhere (B4 check).

## 3. Auto-provision removed

`models/workspaces.ts:119-127` — the `if (config.integrations.bigcapital.enabled) { await
enqueueBigcapitalProvisionJob(...) }` block on workspace creation is deleted outright (not
gated, not made conditional): #292's stance is every workspace starts Not connected, full stop.
No replacement call is added — connecting is now purely the owner's Connect click in §1.

## 4. Gate

`app/(app)/workspaces/[workspaceId]/layout.tsx:91,105` — `accountingEnabled` changes from
`config.integrations.bigcapital.enabled` to `config.integrations.bigcapital.enabled ||
config.integrations.xero.enabled || config.integrations.quickbooks.enabled`. This flag drives the
rail's Finance entry and the phone tab bar's Finance tab — unrelated to whether any *workspace*
has actually connected a provider (deployment-level, same semantics as today, just OR'd across
three flags instead of reading one). Define the OR once (`lib/config.ts` gains a
`config.integrations.anyAccountingProviderEnabled` computed boolean, or a small
`lib/finance/provider-flags.ts` helper) rather than repeating the OR at both layout.tsx call
sites — B4.

## 5. CONTEXT.md

Line ~262 **Connected accounting system** entry: "currently QuickBooks Online or Xero" →
"currently QuickBooks Online, Xero or Bigcapital" (glossary is stale the moment #329 ships if left
as two). Line ~265 **Built-in ledger** entry: delete (Bigcapital is no longer built-in/default —
it is a chosen connector like Xero/QuickBooks, already covered by the entry above once widened).
Line ~306 **Integrations & API** capability line: "sending reviewed data to the built-in ledger,
connected accounting systems, …" → "sending reviewed data to a connected accounting system (Xero,
QuickBooks or Bigcapital) and workspace-scoped external systems…" (ticket text said "Close the
books" for this line; the actual sentence with "built-in ledger" is the Integrations & API entry
at line 306 — Close the books, line 297-299, doesn't mention the ledger at all. Spec follows what
the file actually says, not the ticket's paraphrase.)

## States and ranges (fortify)

- **Zero providers configured on this deployment** (all three `enabled: false`): Accounting card
  omitted entirely (existing `anyProviderConfigured` guard, extended) — unchanged behaviour, just
  now false only when all three, not two, flags are off.
- **One workspace, three providers configured, none connected**: three "Not connected" rows.
- **One connected (any provider), the rest not connected**: mixed rows — no cross-provider
  exclusivity logic exists or is added; #292 doesn't ask for "only one provider connectable" and
  the data model (`IntegrationConnection` per provider) already allows several rows at once. This
  ticket does not add a guard preventing two simultaneous connections — out of scope unless #292
  is re-read as requiring it. (It doesn't: "which provider they picked" implies a UI/decision
  default, not a technical single-connection constraint.) Flagged for Part D.
- **Bigcapital job pending, tab closed and reopened**: `getWorkspaceProvisionJob` is read fresh on
  page load (server component), so a reload lands correctly in Authorising… or Connected without
  needing the client poll to have survived — the poll is a UX nicety for the same-session case
  only.
- **Bigcapital job fails repeatedly**: Needs-reconnect-equivalent "not_started"/"error" collapses
  to the same "Connect"/"Reconnect" control per #292's four-state list (no fifth "error" row is
  introduced — `job.errorCode` surfaces only via the toast at the moment of failure, not as
  persistent row text, matching decided states exactly).

## Accessibility

Poll interval's spinner row: `aria-live="polite"` region announcing "Authorising…" once (not
every poll tick) and again on the terminal state ("Connected" or the reconnect toast) — reuse the
`role={feedback.tone}` pattern already in `accounting-dashboard.tsx:122` rather than inventing a
new live-region convention (B4). Connect/Reconnect/Disconnect controls are real `<button>`/`<a>`
with visible text (no icon-only). Tab order: row-by-row, each row's controls in visual order.
