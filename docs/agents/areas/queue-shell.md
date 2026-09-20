# Area primer — Queue shell (the six queues, desktop table + phone cards)

Read this before touching `components/queue/queue-screen.tsx` or any `*-queue.tsx`. Facts only; the history is on #225, #257, #258, #261, #262, #264.

## Routes
`app/(app)/workspaces/[workspaceId]/(queue)/{invoices,purchase-orders,receipts,bank-statements,exceptions,approvals/invoices,approvals/po-mismatches}/page.tsx` — each is a server page that loads rows and renders one `*Queue` client component; `loading.tsx` beside each renders `QueueLoading` (`components/queue/queue-loading.tsx`). Detail pane: `?doc=<id>` on ≥`lg`, a pushState sheet below (see `detail-pane.md`).

## Primitives — use these, never a bespoke one beside them
- `QueueScreen` (`queue-screen.tsx`): header (h1 `#queue-title`, `tabIndex=-1`), Views/Sort/facet chips (`#queue-facets`) ≥`md`, phone filter row `<md` (`viewsPhone` + `FilterButton#queue-filters-trigger` + `FilterSheet`), Override banner, bulk bar, the list (cards `<cards.below`, table above), the pane.
- Columns: `QueueColumn<T>` with `phone: "title" | "subtitle" | "trailing" | "pill"` feeding the card slots, `phoneRender` when the desktop cell carries desktop chrome (links, confidence marks), `priority: "low"` → `hidden lg:table-cell` in the md–lg band. A `phone` cell must not render an `<a>` — the card is one anchor.
- `QueueCard` + `joinSegments` (`queue-card.tsx`): the one card row; `cards.label(row)` is its comma-separated accessible name; `cards.render` only for a genuinely different card (none left after #261).
- Filters: `lib/queue/filters.ts` — `activeFilterCount`, `facetSelectedValues`, `clearFilterParams(searchParams, facets, sortParam)`; the chips' Clear, the sheet's Clear and the filtered-empty default Clear all call it. `FilterButton` label "Filters" / "Filters · n" (count spoken via `aria-label`, no sr-only span); sheet title "Sort and filter".
- Filtered-empty: "Nothing matches these filters." + hidden-row count + default **Clear filters**; focus hand-off `#queue-filters-trigger` → `#queue-facets button` → `#queue-title` (never body).
- Three-way empty (#264): `lib/queue/empty-state.ts` + `models/queue-outcome.ts` decide **first-use** (workspace-wide `workspaceDocumentCount === 0`) vs. **filtered** (existing filters active) vs. **done** ("Nothing needs you." + cross-type outcome sentence) — `QueueScreen` takes `empty` + `workspaceDocumentCount`; first-use outranks filtered. First-use renders `InboundAddressLine` (`components/intake/inbound-address-line.tsx`, shared with #266); its `<code>` pill is `max-md:break-all md:whitespace-nowrap` — don't reintroduce bare `break-all`. Arrival focus: `focusRow(null)` → `#queue-empty-title`.
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
App-wide five on every state (workspace-avatar palette ×2, Inter overused-font, dev-overlay `layout-transition` + `dark-glow`); `em-dash-overuse` on Receipts@1440 = the "—" empty-cell placeholder; 390 tab walks wrap past `nextjs-portal → body` at document end on short queues (dev overlay, not a trap). Dev-only console warning "unique key" on the Invoices list, both widths, unlocated (#261). `low-contrast … white on #0b8f66` on every state (#266): the compiled Tailwind CSS bundle still carries this utility class (from `file-hub-upload-button.tsx`/`install-prompt.tsx`, neither rendered on any queue page), and the in-page detector reads it out of the stylesheet rather than off a rendered element — the shipped Add-‹type› button (`components/intake/add-type-button.tsx`) uses `#087a54`/`#047857` (5.34:1, passes AA); regex `low-contrast.*#0b8f66` is in `residue.txt`.

## Add-‹type› button (#266)
`components/intake/add-type-button.tsx` — the one "Add ‹type›" entry point per queue, `md:inline-flex`/`hidden` <md (phone path is the dialog's email section via first-use empty state only). Fill is `linear-gradient(180deg,#087a54,#047857)`, not the `#0b8f66` top stop the original spec line named — deliberately darkened for AA contrast; don't revert to the spec literal.

## Conventions the bar checks
- Every mutation refreshes row + pane (`onMutated`); every ⚠ action confirms with its consequence.
- One term per concept: "Filters", "Sort and filter", "Clear filters", "Views"; state words from the label map only.
- Keyboard: skip link → shell/tab bar → Views → Filters/Sort → chips → rows; h1 focusable only programmatically; every control ≥44 px `<md` (`h-11`).

## Origin / "back to where you came from" (#268)
- `lib/navigation/origin.ts`: `withOrigin(href, from)` stamps `?from=<encoded queue url>` on a doc link; `readOrigin(searchParams)` decodes it back; `originLabel`/`labelForDestinationPath` name the origin queue for copy ("Back to Invoices", "Back to Exceptions, Vendor, ID").
- `lib/navigation/origin-server.ts`: `describeOrigin` resolves the strip's row segment server-side (Exceptions origins resolve the check id to its document, since check id ≠ doc id); `describeMissingRow`/`describeFilteredRow` produce the notice text when the row a link pointed at is gone or server-filtered out (`queueArrival`'s `unfilteredRowIds` feeds case-1 filtered wording: "… no longer matches these filters." + Show it, which drops the query param on purpose).
- `components/queue/origin-strip.tsx` + `queue-screen.tsx`'s `origin` slot / `initialMissing` prop render the strip and the moved/gone/filtered notices above the list; all seven queue pages wire it through `queueArrival`.
- Doc-detail pages (`documents/[documentId]/page.tsx` and peers) render the strip above `PaneFrame`; a `gone=` query redirects back to the origin queue with a notice; `not-found.tsx` covers the no-`from`, doc-missing case. `PaneFrame`'s old full-mode ArrowLeft back link was removed — the strip is the one back affordance now.
- On phone (<390) the detail sheet covers the strip while open; closing the sheet ("Back to Invoices") is the first hop, the strip is the second focusable control after — accepted two-step pattern, not a defect (see #268 close report).
- Known non-blocking gaps carried as #249 follow-up, not #268 defects: label-density mismatch between bare "Back to Invoices" and row-qualified variants; Finance's "Open on Invoices" link has no distinct visual weight inside its already-dense (#249) row.

## Keyboard shortcuts (#262)
- `components/shell/keyboard-shortcuts.tsx`: `KeyboardShortcuts` (one `document` keydown listener, mounted once in `Sidebar`, `md`+ gated via `matchMedia`) + `KeyboardShortcutsDialog` (opened by `?` or `openKeyboardShortcutsDialog()` from the account menu). `g <letter>` jumps rail destinations (`SHORTCUT_DESTINATIONS`); `/` → `/search` (empty `q` no longer redirects, see below); `f` focuses `#queue-facets button`; `]`/`[` cycle `button[aria-label^="Does not match the PO"]` inside `#${DETAIL_PANE_ID}`.
- Pending-focus handoff after a route change: `sessionStorage["docubite.pendingFocus"]` = `"rows"` (consumed by `queue-screen.tsx`) | `"search"` (consumed by `search-client.tsx`) | `"main"` (consumed by `KeyboardShortcuts` itself, on `pathname` change — Admin has no row list, so `g d` focuses `#main` this way instead of `"rows"`).
- `lib/shell/keyboard-shortcuts.ts`: the on/off store (`localStorage`, `useSyncExternalStore`), `?` always reachable even when off.
- `components/ui/switch.tsx`: the shared `role="switch"` track/thumb primitive, used by the shortcuts dialog's toggle. **Not yet wired** into the Override-mode menu item (`queue-screen.tsx` ~line 437) or `module-row.tsx`'s pill toggle — both still use bespoke `role="switch"` markup; a real B4 gap, left open pending a design pass (visual change to a menu row, not pure execution).
- `components/ui/dialog.tsx`: on close, focus returns to the opener, or to `#main` if the opener capture was `body` (never leaves focus stranded on `body` — a browse-mode/AT `?` press has no real opener). No CSS transitions/animations at all — `prefers-reduced-motion` is N/A-pass on this primitive, not "unverified".
- `components/shell/how-it-works.tsx` (#264): `openHowItWorksDialog()` / `HowItWorksDialog` (mounted in `Sidebar`) is the account-menu item **How DocuBite works** (replaces the old "Show welcome tour again"); below `md` there's no account menu (#252), so `HowItWorksButton` opens it from the Account page instead. Its footer's "Keyboard shortcuts" mention is a real button calling `openKeyboardShortcutsDialog()` (closes itself first) — never leave a cross-reference to another dialog as inert text.
- `"/workspaces/[workspaceId]/search/page.tsx"`: no longer redirects to the workspace root when `q` is empty (only `ask=1` with no `q` does) — the `/` shortcut needs to land on an empty, focused search page.
- Dev-server gotcha: a **cold** `next dev` compiles each route on first hit (took 50s+ for the very first request in this session); a keyboard probe that navigates through routes never hit yet will show false no-ops. Warm every route with a `curl` first, or run the capture round twice and trust the second pass.
