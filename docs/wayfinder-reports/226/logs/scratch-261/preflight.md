# Pre-flight — #261 Phone Queue screen (filled 2026-09-16, spec phase)

Spec: `spec.md` beside this file. Surface: Operate, phone `<md` + tablet band on five queues. Not "beyond the bar" — two 4-targets.

## Part A — Excellence targets

| H | Target | What a 4 looks like here | Where in the spec |
|---|---|---|---|
| H1 Status | **4** | Filters button carries the active count at all times; sheet's live "Show n rows" + `aria-live` count; h1 count `aria-live`; card `aria-current` while its pane is open; loading skeleton per route so no route ever paints blank; filtered-empty states how many rows are hidden | spec §1 FilterButton/Loading, §4 |
| H5 Prevention | **4** | Nothing on this surface mutates data: cards open, filters filter, Clear filters is reversible by re-applying. The only ⚠ actions reachable from a phone card are the shipped pane actions (#257/#259), each already confirmed with its consequence. No selection/bulk `<md` (#235 d6) so no accidental bulk act on a phone. Sort/facet changes are a URL — Back reverses them | spec §1, §4, B1 |
| H2 | 3 | Row order and words = table's; queue names = rail's | §2, §5 |
| H3 | 3 | Escape/Back/Close on the sheet and pane; Clear filters everywhere; Back closes the pane (pushState) | §6 |
| H4 | 3 | One `QueueCard` for five queues (+ Approvals migrated); one FilterButton string set; one clear-filters function | §1 B4 |
| H6 | 3 | Filters count visible, not only in `sr-only`; View select labelled; state as pill text not colour alone | §3, §5 |
| H7 | 3 | View select + Filters give the phone the desktop's lookups; ↑/↓ inside the pane; keyboard shortcuts desktop-only by decision (#262) — stated | §6 |
| H8 | 3 | Four slots, no filename, no duplicate institution/title, stat hidden | §2 |
| H9 | 3 | Filtered-empty names the cause and the fix; pane's network sentence shipped | §4 |
| H10 | 3 | Empty-state copy per queue; Override banner explains itself; first-run help is #264's | §4 |

Predicted: 4+4+8×3 = **32**, none under 3.

## Part B — Contracts

### B1 · Action reachability and reversal
| Action | Control | Destructive? | Consequence copy | Reversal |
|---|---|---|---|---|
| Open row | `QueueCard` `<a>` | no | — | Back / Escape / Back-to-‹title› (pushState) |
| Sort / facet change | FilterSheet "Show n rows" | no | button names the result count | Clear (sheet), Clear filters (empty state), browser Back |
| Clear filters | empty-state button (default `filteredAction`) | no | — | re-open Filters |
| Change view | View select | no | — | pick another view / Views placeholder |
| Tab-bar navigation | `MobileTabBar` links | no | — | Back |
| Pane actions (Approve, Resolve, Archive, Delete…) | shipped pane bar / ⋯ | per action | shipped confirms (#257/#259) | shipped |
Check: `grep -rn "clearFilterParams" components lib` ≥ 3 callers (chips, sheet, empty state); no server action added by this ticket; `window.confirm|alert(` grep empty in touched files.

### B2 · View freshness
| Mutation | Views showing it | Mechanism | Same tick |
|---|---|---|---|
| Filter/sort applied | Filters · n button, h1 count, list, empty state, sheet count | URL params → `useSearchParams` re-render | yes |
| Clear filters | same five | `router.push(pathname)` | yes |
| View change | select value, list, Filters · n (view's filters become params) | `router.push` | yes |
| Pane mutation (archive/decide) | card pill, pane header, h1 count | shipped `onMutated` → `refresh()`/`router.refresh()` | yes (shipped) |

### B3 · Vocabulary
| Concept | Term | Appears on | Casing |
|---|---|---|---|
| The filter control | **Filters** / **Filters · n** | button (phone), CONTEXT.md "Queue screen" | sentence |
| The sheet | **Sort and filter** | sheet title | sentence |
| Apply | **Show n rows** | sheet footer | sentence |
| Reset | **Clear** (sheet) / **Clear filters** (chips and empty state) | three places | sentence |
| Views | **Views** placeholder, `aria-label="View"` | select, desktop picker trigger "Views" | sentence |
| Missing values | Unknown supplier · Unknown merchant · No amount · — | card, table | as table |
Check: extract strings from `queue-card.tsx`, `filter-sheet.tsx`, `queue-screen.tsx`, `saved-view-picker.tsx`; grep `"Filter"` (bare) must be gone; CONTEXT.md already names "Filters button".

### B4 · Primitive reuse
| Need | Shell primitive | New? |
|---|---|---|
| Card list | `QueueScreen.cards` `<ul>` + new `QueueCard` | `QueueCard` is the first shared card; ApprovalCard/MismatchCard migrate onto it — mandatory |
| Filter sheet / button | `FilterSheet`, `FilterButton` | no |
| Bottom sheet | `Dialog placement="sheet"` | no (close hit-area fix only) |
| View select | `SavedViewPicker variant="select"` | variant, not a new component |
| Loading | `QueueLoading` extracted from `approvals/loading.tsx` | extraction, one source |
| Pill | existing state cell markup per queue | no |
| Clear filters | `clearFilterParams` helper shared by chips/sheet/empty | extraction |
Check: `grep -rn "min-w-\[720px\]" components` empty; `grep -rn "role=\"radio\"\|<ul" components/queue` shows one card `<ul>`; no second Dialog implementation.

### B5 · Focus, keys, failure path
| Surface | Initial focus | Trap + Esc + return | Keys | On failure |
|---|---|---|---|---|
| Card `<a>` | — | n/a; opening moves focus into the pane sheet (shipped), Back returns to the card via `triggerRefs` | Enter/Space | pane shows NETWORK_ERROR sentence; card keeps `aria-current` |
| Filters sheet | checked Sort radio | shipped Dialog: trap, Esc, return to Filters button | ↑/↓ in group, Tab between groups | none (client-only) |
| View select | — | native | native | navigation error → Next error boundary (existing) |
| Clear filters button | — | unmounts on success → handler focuses `#queue-filters-trigger` (`<md`) → first chip in `#queue-facets` (`≥md`) → `#queue-title` h1 (`tabIndex=-1`) — never body | Enter | none |
| Tab bar | — | — | Tab | — |
| Loading skeleton | not focusable, `aria-busy` | — | — | — |
Check: keyboard probe prints `activeElement` after Clear filters and after sheet Apply; `BODY`/`DIV` fails.

### B6 · Time-axis edges
| Entity | What can change | Shown |
|---|---|---|
| Row set | another user archives/decides a row while the list is open | on next navigation/refresh the card is gone; deep link to it → `initialMissingNotice` (shipped) |
| Saved views | a view is deleted on desktop while selected on phone | select shows `Views` placeholder; params stay applied; no error |
| Filter count | facets change between render and apply | sheet counts from the same `rows` array the list renders (shipped `filterRows`) |

## Part C — Coverage by type
| Type | States | H1 | H3 | H5 | H6 | H9 |
|---|---|---|---|---|---|---|
| Card list | loading · empty ×3 · partial · long · overflow | count + aria-current | Back/Esc | no mutation | labelled `<ul>`, explicit names | — |
| Card | partial values · overdue · no amount | pill = state | — | — | full name in label | — |
| Filter row | 0 facets ("Nothing to filter"), n active | Filters · n | Clear | — | count visible | — |
| Sheet | shipped | live count | Esc/Close/Clear | — | grouped labels | — |
| View select | no views (hidden), selected, dirty | value | placeholder | — | aria-label | nav error boundary |
| Empty state | first-use · done · filtered | hidden-count sentence | Clear filters | — | — | names cause + fix |
| Loading | — | aria-busy | — | — | aria-label | — |
| Tab bar | shipped | badges | — | — | — | — |
No GAP.

## Part D — Spec critic (sonnet, fresh context, 2026-09-16)

| H | critique: self / critic / reconciled | evaluate worst: self / critic / reconciled | Spec change made |
|---|---|---|---|
| H1 | 4 / 3 / 4 | 1 / 2 / 1 | none — pill lag after a pane mutation is the shipped refresh path (#257/#259 scored it 4); B2 row stands |
| H2 | 3 / 3 / 3 | 1 / 1 / 1 | `goods_received` column relabelled **Goods received** (one word, one referent) |
| H3 | 3 / 2 / 3 | 2 / 3 / 0 | Clear-filters focus chain gets a final fallback (`#queue-title` h1); probe runs on a zero-facet queue |
| H4 | 3 / 2 / 3 | 0 / 3 / 0 | ApprovalCard/MismatchCard migration made mandatory; PO Mismatches drops its own Link for the default Clear filters |
| H5 | 4 / 4 / 4 | 0 / 0 / 0 | — |
| H6 | 3 / 3 / 3 | 1 / 1 / 1 | View select renders nothing with zero views (was E1 only; now §1) |
| H7 | 3 / 3 / 3 | 1 / 0 / 1 | — |
| H8 | 3 / 2 / 3 | 1 / 2 / 1 | `PoChip` moves from the truncating subtitle to the wrapping pill line |
| H9 | 3 / 3 / 3 | 0 / 0 / 0 | — |
| H10 | 3 / 3 / 3 | 0 / 0 / 0 | — |

Gate after reconciliation: predicted critique **32** (H1, H5 at 4; none under 3) · P0 0 · P1 0 · P2 0 · verdict Clean · evaluate ≈ 90. **Gate met.**

## Part E — Predict evaluate

### E1
| H | Worst issue the spec still permits | Sev | Fix |
|---|---|---|---|
| H1 | none beyond cosmetic: pill text may lag a pane mutation until `refresh()` resolves (shipped behaviour) | 1 | — |
| H2 | "Received" as a date on PO cards vs "Received —" goods column hidden — one word, two meanings on desktop only | 1 | low-priority column hidden on tablet |
| H3 | Clear filters unmounts itself; focus chain ends at the h1, never body | 0 | B5 |
| H4 | none once migration is mandatory and PO Mismatches takes the default Clear filters | 0 | §1 |
| H5 | none (no mutation on the surface) | 0 | — |
| H6 | View select with only a placeholder when no view saved — hide it when `views.length===0` | 1 | §1 variant hides itself |
| H7 | no phone accelerators (by decision #262) | 1 | stated |
| H8 | Exceptions subtitle at two lines makes a 3-line + pill card ~88px | 1 | accepted |
| H9 | none new | 0 | — |
| H10 | Override banner copy refers to "Checks tab" the phone pane still has | 0 | — |
Predicted sum ≈ 4 · P0 0 · P1 0 · P2 0 → health ≈ 90.

### E2 Walkthroughs
| Task | Step | Try | Notice | Associate | Progress | Rating |
|---|---|---|---|---|---|---|
| Find an overdue invoice on the phone | open Invoices tab | y | y (tab bar) | y | list paints (skeleton) | pass |
| | tap Filters | y | y (44px, labelled) | y | sheet opens, focus on Sort | pass |
| | pick Due date sort, Show n rows | y | y | y (count) | list re-orders, Filters · 1 | pass |
| | tap the top card | y | y | y | pane sheet slides in | pass |
| Check a PO's consumption | Purchase Orders via Account › Also in this workspace | y | hesitation: PO queue is not on the tab bar (#232 decision) | y | — | pass (1 hesitation) |
| | read the Consumption pill on the card | y | y | y | — | pass |
| Recover from an empty filtered list | see "Nothing matches" | y | y | y | hidden count | pass |
| | tap Clear filters | y | y | y | list returns, focus on Filters | pass |
| Resolve an exception from the card | tap card → pane → Resolve | y | y | y | shipped result | pass |
Estimated completion ~95%, 3–4 steps, likely error point: finding PO/Bank/Receipts on the phone (Account page link) — a #232 decision, not this ticket's.

### E3 Anti-patterns
No pre-selection, no hidden consequence, no pressure copy, exits everywhere (Back, Esc, Close, Clear), symmetric friction. **Clean.**

## Part G — (close phase)
