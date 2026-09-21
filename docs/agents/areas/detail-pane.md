# Area primer — Detail pane (`PaneFrame` / `DetailPane`)

Shipped by #259: the shared header/menu/actions frame every `QueueScreen` detail surface renders
inside — pane mode (right-hand pane below the queue, full-screen sheet below `lg`) and full mode
(the standalone `?full=1` route). Mode: Operate. Decisions live on #226 (map), #257 (phone lane the
pane frame reuses), #234 (full-mode scope: no frame-level document actions beyond *Open review
task*), #244 (back-to-queue precedence). Do not re-decide here.

## Routes
No routes of its own — `PaneFrame`/`DetailPane` render inside every `(queue)` page's `QueueScreen`
(`invoices`, `payments/batches`, `receipts`, `purchase-orders`, `approvals/*`, `exceptions`, …) and
inside each queue's standalone `[documentId]?full=1` route.

## Primitives — use these, never a bespoke one beside them (pre-flight B4)
- `components/queue/detail-pane.tsx` `PaneFrame` (shared header/menu/status/content chrome for both
  modes) and `DetailPane` (pane-mode wrapper: ↑/↓ row nav, "n of N", Close). Header is one line —
  name + suffix (number · amount, `hidden lg:inline`) — never repeated across stacked headers.
  Below `lg` in pane mode the header shows `←` (`lg:hidden`, replaces Close) instead of `×`
  (`hidden lg:inline-flex`) — the two are mutually exclusive by breakpoint, not simultaneous.
- `PaneMenu` — the one ⋯ for every secondary/destructive action: *Open in a new tab* (pane mode
  only) → `DocumentMenuTopItems` (Archive/Unarchive, Flag) → the queue's own `paneMenu` items →
  *Delete…*, always last, red. Roving `role=menu` with ArrowUp/Down/Home/End + wrap; Escape and
  outside focus close it (Radix `Popover`).
- `components/queue/document-actions-menu.tsx`: `PaneDocumentProvider`/`PaneDocumentContext`
  (the loaded document a `SplitPane` registers, read by the frame's ⋯, now including `currentType`
  — the *raw* `docType`, not the template-resolved one, #297), `DocumentMenuTopItems`,
  `DocumentMenuDeleteItem`, `DeleteDocumentDialog`, `MoveDocumentMenuItem`/`MoveDocumentDialog`
  (#297: move a document to another typed queue or Library; radiogroup lists valid targets minus
  `currentType`; `bank_statement` is deliberately never a target).
  **Contract**: any dialog opened from a `PaneMenuItem` click must be rendered *outside*
  `PopoverContent`, with its open-state owned by a component above the `Popover` — Radix unmounts
  `PopoverContent` (and everything inside it) the instant the menu closes, which happens on the
  same click that requests the dialog. A dialog whose state lives inside the menu item never
  renders (#259 close-phase fix: `DeleteDocumentDialog` moved from `DocumentMenuDeleteItem` up into
  `PaneMenu`, `deleteOpen` state lifted with it).
  **Focus-restore contract (#297)**: pass `restoreFocusTo` as the trigger's `RefObject`, never
  `.current` — `ConfirmDialog` reads `.current` inside its own effect (after the popover that owns
  the trigger has settled), not at the caller's render time. Passing `.current` directly is a
  `react-hooks/refs` ESLint **error** ("Cannot access ref value during render"), not just a lint
  nit — it also silently breaks the `document.activeElement` fallback race the prop exists to fix.
- `components/queue/pane-resize-grip.tsx` `PaneResizeGrip`/`usePaneResize` (#360): the shared
  desktop drag-to-resize divider between the queue list and the detail pane — replaces the old
  layout-control radiogroup. Visible at rest (`border-x`, glyph), not just on hover/focus/drag —
  a bare hover-only affordance is a P1 (evaluate) on a draggable control. Reuse this for any future
  two-pane split (#362/#364/#365) rather than a bespoke divider.
- `components/queue/split-pane.tsx` `SplitPane`: source strip toggle (`sessionStorage["dp.source"]`),
  layout-control radiogroup, tab strip (Details · Note · Approval · Audit · Checks — order per
  queue), `useRegisterDocumentActions` (calls `PaneDocumentContext.setDoc`).
  `stage-indicator.tsx` renders the status band under the header.
- **Status vocabulary (#258)**: one word per state everywhere — `StatePill`s in rows, the pane's
  `status-line.tsx`, the stepper words and the Approval tab (built from the audit log) all derive
  from `processingState()`; never hand-write a status label (`row-cells`, `status-line`,
  `history-tabs` tests pin this). The Save review button is `#save-review-submit`
  (`components/pipeline/document-detail/split-pane.tsx`).
- `components/queue/queue-screen.tsx`: `rowName`/`paneStatus`/`fullHref`/`onMutated` props feed the
  frame; callers migrated to this shape (invoices, payments/batches, receipts, purchase-orders,
  approvals/invoices, approvals/po-mismatches, exceptions, library).
- `components/pipeline/document-detail/bill-pane.tsx` `SupplierCard` (#362): the bill-only
  supplier-trust/payment-terms/recent-invoices `Panel`, unmatched state renders "No supplier
  matched — the document doesn't identify one" and nothing else — no fixture in this repo's dev
  seed resolves to a matched supplier, so the matched branch (trust pill, disclosure, recent
  invoices) is untested by any capture round; a future ticket touching this needs a matched-
  supplier seed fixture first.
- `BillReadOnlyContext` (`split-pane.tsx`, consumed by `field-row.tsx`, `line-items-section.tsx`;
  defaults `false` outside a `Bill` provider): the one gate for "this bill is Paid/Cancelled/
  Touchless, no field may be editable or Tab-reachable." Text/number/date `<input>`s get
  `disabled={billReadOnly}` **separate from** the admin-configured `readOnly` prop (which keeps
  its own HTML `readOnly` — focusable/copyable, #252's intentional exception); checkbox/`<select>`
  get `disabled={readOnly || billReadOnly}`. Never fold a new "locked" condition into an existing
  `readOnly` var for an input that must also leave the tab order — `readOnly` doesn't remove tab
  stops, `disabled` does (see generic lessons #362).

## Data and actions
No model of its own — reads whatever `RegisteredDocument` the queue's `SplitPane` registers
(`workspaceId`, `documentId`, `fileId`, `filename`, `flagged`, `archived`, `cancelled`,
`cancelledReason`, `reviewLink`). Actions: `archiveDocumentsAction`, `flagDocumentsAction`
(`pipeline-actions.ts`), `deleteDocumentsAction` (`app/(app)/workspaces/[workspaceId]/actions.ts`).
Delete's consequence copy is explicit: "‹filename› and every row extracted from it will be removed,
along with the stored source file. This cannot be undone." — never soften this on a future queue.

## Seed, dev server, capture
Same as [approvals](approvals.md): dev workspace `af91555d-7450-4b21-a8ac-73db092617c8`,
`DEV_AUTH_BYPASS=true`, `npm run dev` (:3000), `~/.impeccable/bin/0.1.5/impeccable live-server
--background` (:8400, spawn via `node` `spawn(..., {detached:true})` — a plain shell `&` gets killed
with the parent). Capture with the shared runner:
`scripts/wayfinder-autopilot/capture-round.mjs` (`round({out, base}, async ({width, state, keyboard}) => ...)`)
— write one `.mjs` per round in the ticket's scratch folder, tile with `contact-sheet.mjs`. To
exercise a destructive-action confirm dialog, wait ≥2s after opening the pane before opening the ⋯
menu — the registered-document context populates asynchronously and a fast click sequence finds an
empty menu (Archive/Flag/Delete all silently absent, not just Delete).

## Detector residue (report, do not chase)
App-wide four (`ai-color-palette`, `overused-font`, `dark-glow`, `layout-transition`).
`clipped-overflow-container` recurs on the pane's own scroll/motion scaffolding at 390
(`overflow-hidden` on the sheet's flex containers, required for the slide-in animation and internal
scroll regions) — structural, not a content-clipping bug; don't chase without a screenshot showing
actually-clipped content. Also pre-existing, confirmed shell chrome (#297): `text-overflow` on the
pane-title `h2.min-w-0.flex-1.truncate` at 390 and on the Library type-line
`span.block.truncate.text-sm.font-medium.text-slate-800` at both widths, and `undersized-ui-text`
("10.5px functional text") on the Library pane's count badge — none introduced by #297's
Direction-row/Move-dialog work, all present before it and outside its diff. #361 adds two more,
both unidentified/unlocated after a targeted live-DOM scan (`low-contrast` "#90a1b9 on #f8fafc" and
`first-viewport-column-overflow` on `div.flex.min-h-0.flex-1.flex-col.overflow-hidden.lg:flex-row`)
— both only fire on a fallback capture state (seed doc not in the expected status), may be a
transient/mid-animation detector read; re-capture before chasing further.
Cross-pane visual grouping (#362, H1/H9, not a detector finding): `provenance-pdf.tsx`'s "Could
not render this PDF. Open it directly." and `SupplierCard`'s unmatched-state text can land close
together in a stacked capture with no rule between them — two different components, two different
tickets' ownership; a real fix needs a layout decision at the pane level, not a one-file patch.

## Seed data is mutable across sessions
A round that captures a status-gated dialog (e.g. reject-confirm) depends on a seed document
staying in that exact status — it can drift (get approved/rejected by an earlier round) and leave
later sessions unable to reproduce the state at all (#361: `rejectDoc` had no open review task left,
0 of 33 invoices reject-eligible). Re-query eligibility immediately before the capture, don't assume
a fixture holds across sessions.

## Conventions the bar checks
One `←`/`×` per breakpoint, never both (see Primitives) — **known regression (#367, found on #361):**
at 390px `PaneFrame`'s Close (`hidden lg:inline-flex`) computes `display: flex` despite the `hidden`
class, so both render simultaneously; reproduces on every queue (confirmed on `/exceptions/<id>`,
untouched by #361). Fix lives on #367, not on whatever ticket next captures this state — don't
re-diagnose it, cite #367. Every destructive `PaneMenuItem` opens a
`ConfirmDialog` naming the concrete consequence, and that dialog must survive the menu closing (see
the Contract above — test it, don't assume it from the code alone; #259's first close-phase capture
round never actually got the dialog to render and treated the gap as "just needs recapture" before
the second round proved it was a real bug). Tab order in the header: name → ↑ → ↓ → ⋯ → Close/Back;
at a list boundary the disabled button is skipped, so Tab #1 landing on the next enabled control is
correct, not a defect. Esc inside the ⋯ menu returns focus to the ⋯ trigger.
**Reload-focus contract (#258)**: `onMutated("changed")` bumps `DetailPane`'s `reloadKey`, which
tears the content down through the loading skeleton and rebuilds it — any focused control inside is
destroyed. `pendingReloadFocus` re-focuses `#save-review-submit` (else the pane heading) once
`state === "ready"`; a new mutating control inside the pane needs a stable id and a line there, and
the round's keyboard probe must assert `activeElement` is a `BUTTON`, not a `DIV`. Capture-tooling
note: `capture-round.mjs` parks the mouse at the right edge before each snap — Playwright's default
`(0,0)` sits on the collapsed rail and hover-expands it over the content (a false P0 on #258).
