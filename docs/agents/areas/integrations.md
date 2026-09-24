# Area primer — Integrations (Accounting connectors, API keys, Webhooks)

Shipped by #329 (Accounting connector picker; demotes Bigcapital to a
provider beside QuickBooks/Xero, execution of #292's ledger-stance
decision). #380 (map #376) then deleted Bigcapital entirely — its data was
demo-only — so QuickBooks and Xero are the only accounting providers left.
Mode: Operate. Decisions live on #292, #226, #376; do not re-decide here.
Provider-link parity (#332) and first-run framing (#333) are open decision
tickets, not code gaps.

## Routes
`app/(app)/workspaces/[workspaceId]/admin/integrations/page.tsx` — server
component, gathers `accountingProviders` (which of quickbooks/xero are
configured on this deployment) and `connections` (this workspace's
`IntegrationConnection` rows), passes to the client `IntegrationsManager`.
Same page also owns API Keys and Webhooks (unrelated sections, same
component file).

## Primitives — use these, never a bespoke one beside them (B4)
- `components/integrations/integrations-manager.tsx`: `IntegrationsManager`
  (top-level, all three sections) and `AccountingConnectionCard` (one
  provider row: Sync accounts, default-expense-account picker, Disconnect,
  provider-specific destination link where one exists).
- `PROVIDER_LABELS` (`quickbooks`/`xero` → display name) is duplicated
  once, deliberately, in `lib/finance/actions.ts` (module-private there,
  can't import a client component) — keep both in sync by hand if a
  provider is ever renamed or added.
- `components/ui/confirm-dialog.tsx` `ConfirmDialog` gates Disconnect
  (consequence-first, H5). Escape and a visible Cancel both close without
  disconnecting (`confirm-dialog.tsx:87`, shared by every destructive
  action app-wide — don't re-verify per caller).
- The Accounting card's `CardDescription` is state-dependent: full
  4-sentence onboarding copy pre-connection, one short line once any
  provider connection exists (any status) — added #329 close, H8. Don't
  revert to always-on prose; it competes with the status change on
  Authorising/Needs-reconnect states.
- Neither provider has a destination link (`Open in <provider>`) in this
  codebase — the one Bigcapital had (`/api/accounting/session`) was
  deleted with it in #380 (spec §1.3, named trade-off, decision ticket
  #332).

## Data and actions
`app/(app)/workspaces/[workspaceId]/integration-connection-actions.ts`
(disconnect, list expense accounts, set default account, sync accounting
entities — all workspace-owner-gated server-side). No separate
provider-specific OAuth/status action file remains — QuickBooks and Xero
both use the shared connect flow (see `lib/integrations/`).

## States
not-connected · authorising (spinner, `aria-live="polite"`, no controls
mid-poll) · connected (active) · connected-disconnect-confirm · needs
reconnect (`status: "needs_reauth"`, red suffix). Connect/Reconnect gated
server-side to owners; non-owners see static text, no control.

## Detector residue (report, do not chase)
App-wide five (see `admin.md`) plus nothing integrations-specific as of
#329's r0/r1 rounds — gate CLEAN both rounds, 19/19 keyboard probes pass.

## Capture
Round script pattern: `docs/wayfinder-reports/226/logs/scratch-329/round-329.mjs`
— 9 states × 1440/390. Same dev-server/live-server/warm-route caveats as
`admin.md`. As of #329's close session, this sandbox refused every attempt
to start `next dev`/`live-server` in the background ("requires approval",
no human present) — if that recurs, re-score existing captures via a fresh
reader agent for text/class-only changes rather than blocking on a new
capture round.
