# Spec — #261 Phone Queue screen: card rows and the Filters sheet on all five queues

Mode: **Operate**, phone (`<md`, 390) with a tablet band (`md`–`lg`, 768–1023). Desktop (`≥lg`) is untouched.
Decisions: #235 (all twelve), #232 §5/§12/§15–16, #257's shipped primitives (area primer `docs/agents/areas/approvals.md`), #240's phone input (tab-bar DOM order), #250's input (PO chip folds into the card). Users: the Reviewer on a phone (read, look up, open a row, resolve what the pane allows) — not the bulk operator (#239 Q7; no selection `<md`).

## 0. What is built, in one paragraph

`QueueScreen` gains a **generic card renderer driven by column `phone` slots**, so each of the five queues (Invoices, Purchase Orders, Receipts, Bank Statements, Exceptions) declares four slots on its existing columns and gets the same two-line card `<md` — no bespoke card per queue. The `min-w-[720px]` scroller is retired: `<md` cards, `md`–`lg` the table with `priority: "low"` columns hidden, `≥lg` the full table. Sort and facets sit behind #257's `FilterButton` + `FilterSheet` `<md`; Views become a native select in the same row. The inline stat is already hidden `<md`. Filtered-empty gets a default **Clear filters** action on every width. Loading skeletons ship per queue route. The phone tab bar moves before the queue in DOM order. Row tap opens the existing `<lg` Detail pane sheet (pushState; Back/Escape close — already shipped).

## 1. Primitives and their changes (B4)

| Piece | File | Change |
|---|---|---|
| `QueueColumn<T>` | `components/queue/queue-screen.tsx` | + `phone?: "title" \| "trailing" \| "subtitle" \| "pill"` — which card slot this column feeds `<md`. + `phoneRender?: (row) => ReactNode` — card-specific rendering when the cell renderer carries desktop-only chrome (TitleCell's filename subtitle, ConfidenceField). + `priority?: "low"` — hidden `md`–`lg` (`hidden lg:table-cell` on `th` and `td`). |
| `QueueScreen.cards` | same | `render` becomes optional. Without it the screen renders `QueueCard` from the slot columns. + `label?: (row) => string` — the card's accessible name; default `[rowName.title, rowName.suffix].join(", ")`. + `viewsPhone?: ReactNode` at the top level — rendered in the phone filter row. |
| `QueueCard` (new) | `components/queue/queue-card.tsx` | The one card: `<a href={`${basePath}/${id}`} aria-label aria-expanded aria-controls onClick(preventDefault → open)>` · leading mark (the queue's `leading(row)`) · line 1 `title` (15px semibold, truncate) + `trailing` (15px semibold tabular-nums, shrink-0) · line 2 `subtitle` (13px slate-600, truncate; `line-clamp-2` variant for Exceptions) · line 3 `pill` (12px, existing pill markup) · `min-h-16 px-4 py-3 gap-3`, `aria-current` styling `bg-emerald-50/60` when open, `focus-visible:ring-inset`. ApprovalCard/MismatchCard (#257) **migrate onto `QueueCard`** via `cards.render` — mandatory, not optional (critic D1): same anatomy, they pass their own `subtitle`/`pill` nodes. After the build `grep -n "<a href" components/queue/*.tsx` shows card anchors only inside `queue-card.tsx`. |
| Table `min-w-[720px]` | `queue-screen.tsx` | Removed. `md`–`lg`: `priority: "low"` columns hidden. Tailwind literals: `"hidden lg:table-cell"`. Header `th` and body `td` both. |
| `FilterButton` / `FilterSheet` | `components/queue/filter-sheet.tsx` | Label **"Filters"** / **"Filters · n"** (CONTEXT.md "Queue screen", #235 d11). Sheet title **"Sort and filter"** (#235 d11 — the sheet holds Sort). Footer stays **Clear · Show n rows** (#257; "Show n rows" is Apply naming its consequence — H1/H5 — and Escape/Back/Close is the sheet's Cancel). Approvals inherits the two renamed strings (one primitive, one term). |
| `Dialog` close button | `components/ui/dialog.tsx` | The X gets a ≥44px hit area below `md` (`max-md:-m-2 max-md:p-3` or equivalent) — the sheet's only Cancel affordance must be tappable (#235 d9; SC 2.5.8). |
| `SavedViewPicker` | `components/typed-destinations/saved-view-picker.tsx` | + `variant="select"`: a native `<select aria-label="View">` (h-11, 16px text so iOS does not zoom) listing the views, `Views` placeholder option when none selected; `onChange` navigates exactly as `selectView` does; **renders nothing when `views.length === 0`** (critic D6 — a select with one placeholder option explains nothing). No create/rename/share on the phone (management is desktop, #232 §5). Queues pass `viewsPhone={<SavedViewPicker variant="select" …/>}`. |
| Filtered-empty action | `queue-screen.tsx` | Default `filteredAction` when the caller passes none: a **Clear filters** button that strips every facet param (and `sort`) via `router.push(pathname)` — the same routine `FacetFilters`' Clear filters uses (extract `clearFilterParams(searchParams, facets, sortParam)` into `lib/client/queue-filters.ts` so the chips, the sheet's Clear and the empty state share one function). PO Mismatches drops its own `<Link>` and takes the default (critic D2) — one mechanism. |
| Loading | `app/(app)/workspaces/[workspaceId]/(queue)/{invoices,purchase-orders,receipts,bank-statements,exceptions}/loading.tsx` | Each renders `QueueLoading` (new, `components/queue/queue-loading.tsx`, extracted from `approvals/loading.tsx` which now renders it too): header bar skeleton + 8 rows, **62px `≥md`, 64px `<md`** (`max-md:h-16`), `aria-busy aria-label="Loading ‹title›"`. |
| Tab bar order | `app/(app)/workspaces/[workspaceId]/layout.tsx` | `<MobileTabBar>` moves **before** `#main` in DOM order (`fixed` — no visual change); its `<nav aria-label="Primary workspace navigation">` landmark then precedes every row in Tab order (#240 input). |
| `phoneReadOnly` | `queue-screen.tsx` | Unchanged; still used by deep-link pages of queues before cards. After this ticket no caller needs it on the five queues — leave the prop, remove the five callers' use if any (none found). |

## 2. Slot matrix per queue (#235 d7; "no new data")

Leading mark = existing `leading(row)` (processing glyph; Exceptions' warning triangle). Pill = the queue's existing State/Status cell markup.

| Queue (component) | title | trailing | subtitle | pill | `priority:"low"` (hidden md–lg) | card `label` |
|---|---|---|---|---|---|---|
| Invoices (`InvoiceQueue`) | Supplier (`phoneRender`: name or "Unknown supplier", no filename) | Amount (`formatMoney` or "No amount") | `Invoice # · Due ‹date›` (`phoneRender` on the `number` column) | State pill **and** `PoChip` when `po` (#250 input; `Likely PO-2088`, `PO-2088 · 3 mismatches`, `PO removed`) — the `po` column takes `phone: "pill"`; the pill line is `flex flex-wrap gap-1.5` so a chip wraps rather than truncates (critic D4: the mismatch count is never the clipped segment) | `number`, `aging` | `Supplier, Amount, Invoice #, Due ‹date›[, overdue], ‹PO subtitle›, ‹state word›` |
| Purchase Orders (`DocumentQueue purchaseOrders`) | Supplier | Amount | `PO # · Received ‹date›` (document receipt date; the `goods_received` column is relabelled **Goods received** so one word no longer carries two referents — critic D5) | Consumption (`Open` / `Open · n lines over` / `Fully invoiced`) | `invoiced`, `goods_received` | `Supplier, Amount, PO #, Received ‹date›, ‹consumption›` |
| Receipts (`ReceiptQueue`) | Merchant | Amount | `Receipt # · ‹purchase date›` | State; when `claimStatus` is set the Claim pill follows on the same line | `number`, `claim` | `Merchant, Amount, Receipt #, ‹date›, ‹state›[, claim ‹status›]` |
| Bank Statements (`DocumentQueue showInstitution`) | Institution (falls back to filename) | Amount | `Received ‹date› · Category` | State | `institution` (duplicates title), `category` | `Institution, Amount, Received ‹date›, Category, ‹state›` |
| Exceptions (`ExceptionQueue`) | Supplier (`row.vendor ?? filename`) | Amount | Check message (`row.message`, `line-clamp-2`) | Status (`Open` / `In review`) | `invoiceNumber`, `assignee`, `escalated` | `Supplier, Amount, ‹message›, ‹status›, ‹doc type›` |

Deviation from #235 d7 recorded: Bank Statements has no closing balance / period field and Exceptions no severity field on the row (`models/exceptions.ts`); the card uses the data the row has (d7's own rule, "no new data"). `Amount` on Bank Statements is the row's `total` string as the table shows it.

## 3. Layout `<md` (390)

```
[h1 ‹Queue› n]                                  [⋯]      ← row 1: 44px; Views/Sort/chips/stat hidden
[View ▾ select h-11] [Filters · n h-11]                    ← filter row: px-4 py-2, gap-2
[● Supplier                              R 12,400.00]
[  INV-2031 · Due 30 Sep · PO-2088 · 3 mismatches ]
[  (Needs attention)                              ]      ← card: min-h 64, 16px gutters, border-b slate-200
…
[tab bar fixed bottom, 72px]                              ← precedes #main in DOM
```
Type: h1 20px (`text-xl md:text-lg`, shipped), title/trailing 15px semibold, subtitle 13px, pill 12px — three steps above 13px body per #257's lesson; controls ≥44px, cards ≥64px. Overdue due-date text `text-red-700` + ", overdue" in the label. Amounts `tabular-nums`. No hover-only affordance: the whole card is the `<a>`.

`md`–`lg`: table, no scroller, low-priority columns hidden, Sort select + chips + stat visible as today, selection on. `≥lg`: unchanged.

Detail pane `<lg`: the shipped full-screen sheet (pushState; Back "Back to ‹title›"; ↑/↓ replace history — #232 §12, shipped). Opening a card sets `aria-current` on it; closing returns focus to that card's `<a>` (shipped `triggerRefs` — the card registers itself the same way the table's first-cell button does).

## 4. States (`fortify`)

| State | Rendering |
|---|---|
| Loading (route suspense, filter/sort navigation) | `QueueLoading` skeleton: 64px rows `<md`, 62px `≥md`, `aria-busy` |
| Empty — first use / done | Existing `empty.title/body` per queue (#241 owns the three-state Invoices copy on #264; not changed here) |
| Filtered empty | "Nothing matches these filters." · "‹n› rows are hidden by the filters." · **Clear filters** (default action, every width). On the phone the Filters button also shows "Filters · n" so the cause is visible above the message |
| Partial data | title fallback "Unknown supplier/merchant/‹label›"; amount "No amount" (Invoices) / "—" elsewhere as the table already does; missing due date "Due —" is **not** rendered — the segment is omitted (`[number, due].filter(Boolean).join(" · ")`) |
| Long content | title truncates (1 line), trailing never shrinks, subtitle truncates (Exceptions: 2 lines), pill wraps under |
| Zero results after sort change | same as filtered-empty (sort counts as an active filter on the button only when non-default) |
| Offline / network error on open | The pane's own `NETWORK_ERROR` sentence (shipped); the card stays `aria-current` |
| Deep link to a filtered-out row | shipped `initialMissingNotice` line above the list |
| Overflow (> 200 rows) | plain list, no virtualisation (matches the table); the loading skeleton bounds the perceived wait |
| Override Mode on | shipped amber banner stays between the filter row and the list; the banner's Turn off button is ≥44px `<md` (`max-md:h-11`) |

## 5. Copy (`articulate`) — every new string

| Where | String |
|---|---|
| Filter button | `Filters` · `Filters · 2` (sr: ", 2 active") |
| Sheet title | `Sort and filter` |
| Sheet footer | `Clear` · `Show 12 rows` / `Show 1 row` (unchanged) |
| View select | `aria-label="View"`, placeholder option `Views`; options are the saved view names |
| Filtered-empty action | `Clear filters` |
| Loading | `aria-label="Loading Invoices"` etc. (the queue title) |
| Card label | as §2, comma-separated, state word from `PROCESSING_STATE_LABELS` / the pill's own text |
| Missing values | `Unknown supplier` · `Unknown merchant` · `No amount` · `—` — the table's existing words, no new ones |

Casing: sentence case everywhere; queue titles as they are (`Purchase Orders`, `Bank Statements` are the rail's proper names).

## 6. Keys and focus (`include`)

- Tab order `<md`: mobile header → **tab bar (4 links)** → h1 → ⋯ → View select → Filters → cards (each one `<a>`) → nothing after (tab bar already passed).
- Card: Enter/Space opens (native `<a>` + onClick); focus ring inset; `aria-expanded` + `aria-controls=DETAIL_PANE_ID`.
- Filters sheet (shipped): initial focus on the checked Sort radio, ↑/↓ within a radiogroup, Escape closes and returns focus to the Filters button, `Show n rows` applies and returns focus to the Filters button (the shipped `Dialog` returns to its opener).
- View select: native; change navigates; focus stays on the select after navigation (same element, re-rendered).
- Clear filters (empty state): a `<button>`; the list re-renders and the button unmounts, so the handler focuses, in order, `#queue-filters-trigger` (`<md`), the first chip in `#queue-facets` (`≥md`), else the **queue `<h1>`** (`tabIndex=-1`, stable id `queue-title`) — never body (critic D3). The keyboard probe runs this on a queue with zero facets too. B5 row.
- Detail sheet: shipped (Back to ‹title›, siblings inert, Escape innermost).
- Targets: all ≥44×44, cards ≥64px tall (SC 2.5.8 met with margin).
- Names: every composite `<a>` has an explicit comma-separated `aria-label` (#257 lesson); `<ul aria-label="‹title›">`; the loading region `aria-busy`.

## 7. Detector and residue

Named residue (primer): rail avatar palette ×2, Inter overused-font, dev overlay ×2; at 1440 rail hover text-occlusion on Supplier, `hidden lg:table` "children flush", detail tab strip flush, source panel clipped-overflow. Watch for: `flat-type-hierarchy` at 390 (15/13/12 scale is deliberate), `cramped-padding` on the filter row, `nested-cards` if the pill inherits a fill inside the card (pill is text-on-tint, no border box), `text-overflow` on long merchant names (truncate is intentional; label carries the full name).

## 8. Test plan

- `components/queue/queue-card.test.tsx`: renders four slots from columns; omits empty subtitle segments; `aria-label` from `cards.label`; `aria-current` when open; `<ul>` has the queue's name.
- `lib/client/queue-filters.test.ts`: `clearFilterParams` strips facet params and the sort param only, keeps `view`.
- Existing `row-cells.test.tsx` unchanged; `filter-sheet` string change updates any snapshot.
- Capture round (measure phase): 5 queues × {list, pane-open, filters-open, filtered-empty} at 390 + {list, pane-open} at 1440 + Invoices list at 900 (md–lg band) = 27 states, on `capture-round.mjs` with the #257 scratch harness's seed (`seed257b.ts`) plus one filtered-empty query per queue.
