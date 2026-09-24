# Area primer — Finance

#380 (map #376) deleted the in-house ledger (Bigcapital) entirely — its data was demo-only. The
`LedgerConnectionPanel` primitive, `models/bigcapital.ts`, and everything #248/#252/#257/#264/#268
built around it are gone. Decisions live on #226 and #376; do not re-decide here.

## Route
`app/(app)/workspaces/[workspaceId]/(chrome)/finance/page.tsx` — reduced to the glossary's
definition of Accounting and nothing more: a header, one `Panel` ("Ledger connection") saying once
that no ledger is connected, and a disabled "Connect" button with the reason as its `title`.
Connecting an external ledger (QuickBooks, Xero) from this page is a later ticket. `/accounting`
is a permanent redirect here (old bookmarks/mail links/callbacks).

## Data and actions
No ledger-specific model or action remains on this page — it reads only `getCurrentUser` and
`requireWorkspaceRole` to gate the "owners only" hint. `models/health/sync.ts` still syncs
`LedgerTransaction` rows from `quickbooks`/`xero` `IntegrationConnection`s (unrelated to this
page); posting on the queues stays offered nowhere while no ledger is connected — the queue banner
that says so lives in `components/queue/{document,invoice,receipt}-queue.tsx`, not here.

## Seed, dev server, capture
- Same dev workspace/DB/server recipe as Admin (`docs/agents/areas/admin.md`) — `DEV_AUTH_BYPASS`,
  `node .impeccable/live/dev.mjs start <ws>|stop` (dev server and the in-page detector
  together). Stop both before `tsc`/`eslint`/full suite/`next build`.
- The page is one Panel with one disabled button — no connected-state seed row is needed to
  capture it; there is no connected state to render yet.

## Conventions the bar checks
Vocabulary: "Ledger" not any provider name in user-facing copy — "no ledger is connected",
"Connect". One consequence line above a confirm dialog's footer, not duplicated as a dialog
subtitle (`components/queue/post-confirm-dialog.tsx`).
