# Area primer — Queue shell (the six queues, desktop table + phone cards)

Read this before touching `components/queue/queue-screen.tsx` or any `*-queue.tsx`. Facts only; the history is on #225, #257, #258, #261.

## Routes
`app/(app)/workspaces/[workspaceId]/(queue)/{invoices,purchase-orders,receipts,bank-statements,exceptions,approvals/invoices,approvals/po-mismatches}/page.tsx` — each is a server page that loads rows and renders one `*Queue` client component; `loading.tsx` beside each renders `QueueLoading` (`components/queue/queue-loading.tsx`). Detail pane: `?doc=<id>` on ≥`lg`, a pushState sheet below (see `detail-pane.md`).

## Primitives — use these, never a bespoke one beside them
- `QueueScreen` (`queue-screen.tsx`): header (h1 `#queue-title`, `tabIndex=-1`), Views/Sort/facet chips (`#queue-facets`) ≥`md`, phone filter row `<md` (`viewsPhone` + `FilterButton#queue-filters-trigger` + `FilterSheet`), Override banner, bulk bar, the list (cards `<cards.below`, table above), the pane.
- Columns: `QueueColumn<T>` with `phone: "title" | "subtitle" | "trailing" | "pill"` feeding the card slots, `phoneRender` when the desktop cell carries desktop chrome (links, confidence marks), `priority: "low"` → `hidden lg:table-cell` in the md–lg band. A `phone` cell must not render an `<a>` — the card is one anchor.
- `QueueCard` + `joinSegments` (`queue-card.tsx`): the one card row; `cards.label(row)` is its comma-separated accessible name; `cards.render` only for a genuinely different card (none left after #261).
- Filters: `lib/queue/filters.ts` — `activeFilterCount`, `facetSelectedValues`, `clearFilterParams(searchParams, facets, sortParam)`; the chips' Clear, the sheet's Clear and the filtered-empty default Clear all call it. `FilterButton` label "Filters" / "Filters · n" (count spoken via `aria-label`, no sr-only span); sheet title "Sort and filter".
- Filtered-empty: "Nothing matches these filters." + hidden-row count + default **Clear filters**; focus hand-off `#queue-filters-trigger` → `#queue-facets button` → `#queue-title` (never body).
- Saved views: `SavedViewPicker` (`components/typed-destinations/saved-view-picker.tsx`), `variant="select"` for `viewsPhone`; only queues with desktop saved views pass it (Invoices, Receipts, Approvals). Renders nothing with zero views.
- Status words: `models/processing-state.ts` (`processingState()`, label map) — never hand-written. Pills: `StatePills`/`PoChip` in `row-cells.tsx` / `documents/po-compare.tsx`.
- Phone tab bar `MobileTabBar` sits before `#main` in the workspace layout (DOM order = tab order).

## Seed, dev server, capture
- Dev server: `node .impeccable/live/dev.mjs start|stop|status` (heap-capped); devdb :55433 (`docker start docubite-devdb` after a reboot); workspace `af91555d-7450-4b21-a8ac-73db092617c8`; seed `npx tsx --env-file .env .impeccable/live/seed257b.ts` (idempotent).
- Live-server for the in-page detector: `node .impeccable/live/livesrv257.mjs` (prints pid + port 8400); kill the pid at the end.
- Rounds: `docs/wayfinder-reports/226/logs/scratch-257/pw/round261-r2.mjs` on `scripts/wayfinder-autopilot/capture-round.mjs`; contact sheet via `contact-sheet261.mjs`. Warm routes first with `.impeccable/live/probe252.mjs <paths>` (h1 counts there are SSR totals, not filtered counts).
- Zero-row filter queries (client-side filtering, so probe with `probe-empty261.mjs`): invoices `aging=90%2B`, purchase-orders/bank-statements `status=failed`, receipts `status=cancelled`; Exceptions and Approvals have none in the seed — extend the seed before probing their filtered-empty.
- Tests: `npx vitest run components/queue lib/queue components/typed-destinations` (30 tests, ~11 s).

## Detector residue (report, do not chase)
App-wide five on every state (workspace-avatar palette ×2, Inter overused-font, dev-overlay `layout-transition` + `dark-glow`); `em-dash-overuse` on Receipts@1440 = the "—" empty-cell placeholder; 390 tab walks wrap past `nextjs-portal → body` at document end on short queues (dev overlay, not a trap). Dev-only console warning "unique key" on the Invoices list, both widths, unlocated (#261).

## Conventions the bar checks
- Every mutation refreshes row + pane (`onMutated`); every ⚠ action confirms with its consequence.
- One term per concept: "Filters", "Sort and filter", "Clear filters", "Views"; state words from the label map only.
- Keyboard: skip link → shell/tab bar → Views → Filters/Sort → chips → rows; h1 focusable only programmatically; every control ≥44 px `<md` (`h-11`).
