# Area primer — Finance

Shipped by #281 (rewrite + housekeeping deletion). Bigcapital ledger connect/post/reconcile is
#248/#252/#257/#264/#268. Decisions live on #226; do not re-decide here.

## Route
`app/(app)/workspaces/[workspaceId]/(chrome)/finance/page.tsx` — single-purpose page: one
`LedgerConnection` `Panel` (reused, `frame="panel"` mode) plus a "Default expense account" row.
No queue, no table — the entity-count/sync/accounts summary and the primary "Open ledger" action
live *inside* `LedgerConnectionPanel`, not duplicated on the page.

## Primitives — use these, never a second copy beside them (pre-flight B4)
- `components/finance/ledger-connection-panel.tsx` `LedgerConnectionPanel` (built #248, extended
  #252): `frame="panel"` mode renders its own primary "Open ledger" button top-right — a caller
  that also wants that action must not add a second button; the panel already owns it. Its
  connected/disconnected/error states, entity counts, and Sync now are also single-sourced here —
  don't rebuild any of them on the page.
- `AccountingErrorBanner`, shared `Panel` — same primitives as the rest of the app; nothing
  Finance-specific was added.

## Data and actions
`models/bigcapital.ts` `buildAndConnect` is the only path that ever writes an
`IntegrationConnection` row with `status: "active"`; it sets `externalTenantId` atomically (the
TS type requires it non-null). A row with `status: "active"` and `externalTenantId: null` cannot
come from production code — if a capture/dev session sees that shape, it's stale seed data, not
a code bug (see lesson below).

## Detector residue (report, do not chase)
App-wide five (workspace-switcher avatar palette ×2, Inter `overused-font`, dev overlay
`layout-transition` + `dark-glow` on `body`), plus the shell workspace-switcher truncate span
(`components/workspace/switcher.tsx:47`, class `block truncate text-sm font-medium
text-slate-800`) reading as `text-overflow` at 1440 — pre-existing shell chrome, unmodified by
#281, present on every page including Finance.

```residue
ai-color-palette
overused-font
layout-transition
dark-glow
text-overflow.*span\.block\.truncate\.text-sm\.font-medium\.text-slate-800
```

## Seed, dev server, capture
- Same dev workspace/DB/server recipe as Admin (`docs/agents/areas/admin.md`) — `DEV_AUTH_BYPASS`,
  `.impeccable/live/dev.mjs start|stop`, `.impeccable/live/livesrv257.mjs` for the in-page
  detector. Stop the dev server before `tsc`/`eslint`/full suite/`next build`.
- Capture round: `docs/wayfinder-reports/226/logs/scratch-281/round-281.mjs <tag>` (uses shared
  `capture-round.mjs`), gated with `scripts/wayfinder-autopilot/gate.mjs <shots> --baseline
  <prior> --residue-file residue.txt`.
- A seeded `IntegrationConnection` with `status:"active"` needs `externalTenantId` set to a real
  string for a connected-state capture to be trustworthy — check it directly
  (`SELECT status, "externalTenantId" FROM "IntegrationConnection"`) before relying on the
  connected state; `.impeccable/live/seed268.ts` (an older ticket's seed) can leave it null.

## Lessons this ticket surfaced
- A stale dev-seed connection row (`status:"active"`, `externalTenantId: null`) hid the
  "Open ledger" action entirely, reading as a P1 missing-feature finding until the row was
  inspected and repaired directly — the page's own guard (`status === "active" &&
  externalTenantId`) was correct; the seed data wasn't representative.
- Once the row was fixed, a real duplicate "Open ledger" CTA appeared: the page header and
  `LedgerConnectionPanel`'s own `frame="panel"` button both rendered it. Fixed by removing the
  page header's copy — the panel is the single owner of that action. Any future page that embeds
  `LedgerConnectionPanel` in `frame="panel"` mode must not add its own "Open ledger" button.

## Conventions the bar checks
Vocabulary: "Ledger" not "Bigcapital" in user-facing copy; "Open ledger", "Sync now",
"Not yet synced" are the exact strings (#248). One consequence line above a confirm dialog's
footer, not duplicated as a dialog subtitle (`components/queue/post-confirm-dialog.tsx` fixed
this in #281 — the `Dialog`'s optional `description` prop is for a *distinct* second line, not a
restatement of the footer line).
