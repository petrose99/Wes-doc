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
  (the loaded document a `SplitPane` registers, read by the frame's ⋯), `DocumentMenuTopItems`,
  `DocumentMenuDeleteItem`, `DeleteDocumentDialog`.
  **Contract**: any dialog opened from a `PaneMenuItem` click must be rendered *outside*
  `PopoverContent`, with its open-state owned by a component above the `Popover` — Radix unmounts
  `PopoverContent` (and everything inside it) the instant the menu closes, which happens on the
  same click that requests the dialog. A dialog whose state lives inside the menu item never
  renders (#259 close-phase fix: `DeleteDocumentDialog` moved from `DocumentMenuDeleteItem` up into
  `PaneMenu`, `deleteOpen` state lifted with it).
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
actually-clipped content.

## Conventions the bar checks
One `←`/`×` per breakpoint, never both (see Primitives). Every destructive `PaneMenuItem` opens a
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
