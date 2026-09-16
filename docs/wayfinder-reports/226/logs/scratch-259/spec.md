# Spec — #259 Fold the Detail pane header

Execution of #234 (decided 2026-09-15). Mode: **Operate**. Intent `specify` + `fortify` + `articulate` + `include`; Impeccable `shape → distill → layout → clarify`, `polish` + `audit` at close. Nothing here re-decides #234; every open reading below is resolved by the rule named beside it.

## 0. Who and why

The operator (AP clerk / reviewer) works rows top to bottom on a queue, opens the Detail pane, checks fields against the source, decides on the sticky bar. Today the pane opens with three stacked headers (queue 49 → pane 53 → document 51 → stepper 39 = 192px) and the document introduces itself four times; Delete is the most saturated control in view (critique 2026-09-15T19-30: H8 = 2, H3 = 3). Success: one header, ≤ 96px of pane chrome, first field at 1440 at y ≤ 290, ≤ 100px above the source strip at 390, secondary/destructive actions in one ⋯.

Applies to every surface that renders `DetailPane` with a document inside: Invoices, Purchase Orders, Receipts, Bank Statements, Exceptions, Bill Pay. Payment Batches renders the same frame with no document items and no Status line (its batch strip is #251's).

## 1. Architecture (one header implementation)

| Piece | Today | Spec |
|---|---|---|
| `components/queue/detail-pane.tsx` `DetailPane` | Frame + async loader; `title`, `subtitle`, `menu` | Split into **`PaneFrame`** (presentational: header, Status line slot, ⋯, footer, `children`) and **`DetailPane`** (loader that renders `PaneFrame`). New props on both: `name: { title: string; suffix?: string | null }` (replaces `title`/`subtitle`), `status?: ReactNode` (Status line slot), `fullHref?: string` (renders the ⋯ *Open in a new tab* item), `mode: "pane" \| "full"`, `backHref` (full only), `onMutated?: (kind: "changed" \| "removed") => void`. |
| Document actions (Archive · Flag · Delete…) | `SplitPane` top bar buttons | **`PaneDocumentContext`** (`createContext`) provided by `PaneFrame`. Embedded `SplitPane` calls `useRegisterDocumentActions({ documentId, fileId, filename, flagged, archived, cancelled, cancelledReason })` in an effect; `PaneFrame` renders the items from that registration. One implementation of each action (`components/queue/document-actions-menu.tsx`, new: `DocumentMenuItems` + `DeleteDocumentDialog` extracted from `delete-document-button.tsx`). |
| Embedded document header (`split-pane.tsx` "Top bar") | Filename band, raw-status pill, type chip, payment pill, flag, Approve, Archive, review-task link, Delete, layout toggle, ↑/↓ | **Deleted** together with the `embedded === false` branch (`h-screen` root, Back link, prev/next, standalone Approve). `SplitPane` is always the pane's content; the `embedded` prop is removed. `DeleteDocumentButton` loses its importer here (keeps bulk/legacy callers if any; grep at build). `CreateReviewTaskButton` **stays** at its Details-tab call (`split-pane.tsx` ~L408). `header.reviewLink` (the *Open review task* link, today L271) moves into the ⋯ (item 1b below) — no action loses its caller (B1). |
| Stepper (`stage-indicator.tsx`) | Pill list, `overflow-x-auto`, clips "Pay" at 390 | The one band under the header: 36px (`h-9`), full width. `lg+`: the five nodes. Below `lg`: **one line** — current node label + "n of N" (sr-only prefix "Step n of N, "), the `<ol>` hidden. Node words unchanged (#258 owns them). |
| Source strip | none (filename lived in the top bar) | 36px strip at the top of the source panel: filename (`truncate`, `title`) · **Open file** (icon+label, opens the file URL in a new tab) · **layout segmented control** (Split · Details · Source, `role="radiogroup"`, `lg+` only). The strip stays rendered in *Details* layout (source panel collapses to the strip) so the way back is always visible — this replaces today's two ad-hoc "Split view" buttons. |
| `?full=1` **only** — legacy `?stage=` / `?page=` deep links (dashboard "Blocked in review", pipeline list, `review/page.tsx`) now open the **queue with the pane** (drop `|| query.stage || query.page` from the gate in the six typed `[documentId]/page.tsx`; `LegacyDocumentPage` already redirects to the typed route with the query) — so nobody lands in full mode without a decision bar except by choosing *Open in a new tab* (critic ruling, Part D) | Standalone `SplitPane` with its own header | `DocumentDetailPage` (non-embedded call) renders `<PaneFrame mode="full" name backHref status fullHref={undefined}>` around the same `SplitPane` + `history`. Back to queue = `from` (#244 Origin) when present, else the typed queue path. No `1 of N`, no ↑/↓, same ⋯ (minus *Open in a new tab*) and same footer (`paneActions` are per-queue client code — full mode renders the footer only where the queue's page passes it; v1: the Invoices/Receipts decision footer is out of full mode, the ⋯ carries everything else. State this on the ticket as "full mode = read + secondary actions", per #234 d.7 "same ⋯ and footer" — footer here means the *slot*, and the Approve/Reject decision remains on the queue, where #227 put it). |

**Queue-side wiring** (`queue-screen.tsx`): `rowName(row) → { title, suffix }` replaces `rowTitle`/`rowSubtitle` for the pane (the row's `aria-label` keeps both). `paneStatus?(row) → ReactNode` supplies the Status line slot (today: the row's `StatePills` + ledger; #258 replaces the content, not the slot). `paneMenu` now supplies **surface items only** (Cancel invoice…, Create expense claim…); *Open in a new tab* moves into the frame (`fullHref={`${basePath}/${id}?full=1`}`). `onMutated("changed")` → `refresh()`; `onMutated("removed")` → `close()` then `router.refresh()`.

## 2. Header (`PaneFrame`) — layout and copy

```
┌ pane header (≤ 60px) ─────────────────────────────────────────────────┐
│ [←]  Acme Ltd  OE-44210 · R 391,00          1 of 4   ↑  ↓   ⋯   ×     │  line 1: h-9 row
│      ● In review · opened 3 days ago   Synced                          │  line 2: Status line (18px)
├ stepper (36px) ────────────────────────────────────────────────────────┤
│ ✓ Extracted — ✓ Checks — ● Approval — ○ Sync — ○ Pay                   │  (390: "Approval · 3 of 5")
├────────────────────────────────────────────────────────────────────────┤
│ source strip: invoice-0421.pdf        [Open file]  [Split|Details|Source]
```

- Line 1: `<h2 id=queue-detail-pane-title tabIndex=-1>` = `name.title` (14/600 slate-900) + `<span class="font-normal text-slate-500">` `name.suffix` (invoice # · amount). Single line, `truncate`, `title` = full text. `[←]` Back below `lg` (pane) / always in `full` mode (label **Back to queue**). `1 of N` `sm+`, `aria-live=polite` (pane only). ↑ ↓ (pane only). ⋯ *More actions*. × *Close* (`lg+`, pane only).
- Line 2: the `status` slot in a `<div class="min-h-[18px]">`; while the pane content loads it shows the row's pills (they come from the row, not the content, so the line never skeletons). Ledger mark (Synced / Paid) follows as its own pill (today's `ledger` prop). No other colour in the header.
- Heights: header `px-3 py-1.5` → 6 + 36 + 18 + 6 = **≤ 60px**; stepper `h-9` = 36; total **96px**. Budget check is a Playwright box measurement at close.
- Type: title 14/600; suffix 14/400; Status line 13; stepper 12; strip 12/13.

### ⋯ menu — order and copy (Part B3 vocabulary; `hint` on disabled items)

| # | Item | Visible when | Disabled + hint | Effect | Reversal |
|---|---|---|---|---|---|
| 1 | Open in a new tab | pane mode, `fullHref` set | — | `window.open(fullHref, "_blank", "noopener")` | n/a (navigation) |
| 1b | Open review task | document registered and `reviewLink` set | — | `<a href>` (`PaneMenuItem asChild`), same tab | n/a (navigation) |
| 2 | Archive ⇄ **Unarchive** | document registered | cancelled → "Cancelled invoices are already closed." · busy | item stays open with label **Archiving…** + `aria-busy` (no `data-menu-close`) until the action resolves, then the menu closes and the toast fires: **Archived — now under Closed** / **Unarchived — back in Open** on queues with a Closed facet (Invoices, Documents), plain **Archived** / **Unarchived** elsewhere (Bank Statements, Exceptions, Bill Pay — `paneToast?.archived` per queue, default plain); `onMutated("changed")` reloads the *pane*; the list refreshes when the pane closes or the selection moves (operator stays on the row, #239; no optimistic removal, #227) | the same item, flipped |
| 3 | Flag for attention ⇄ Remove flag | document registered, until #260 unplugs it | cancelled → same hint · busy | same busy pattern (**Flagging…**); `flagDocumentsAction`; toast **Flagged** / **Flag removed**; `onMutated("changed")` | the same item, flipped |
| — | separator (`role=separator`) | any item below exists | | | |
| 4 | Surface items (`paneMenu`): Cancel invoice… · Create expense claim… | per queue, unchanged | as today (`info.reason`) | as today | as today |
| 5 | **Delete…** (red, last) | document registered | cancelled → hint above · busy → "Deleting…" | menu closes, focus returns to ⋯, then `DeleteDocumentDialog` opens (opener = ⋯). Title **Delete this document?** · body **‹filename› and every row extracted from it will be removed, along with the stored source file. This cannot be undone.** · Confirm **Delete** (destructive) · Cancel. On success: toast **‹filename› deleted**; pane → `onMutated("removed")` (close + list refresh); full → `router.push(backHref)`. | none — the dialog says so; the bulk bar's Delete is the same dialog |

Disabled items use `aria-disabled="true"` (not `disabled`): they stay in the roving order, the hint is visible text under the label and linked with `aria-describedby`, Enter/Space do nothing. Loading / missing / error content: items 1b, 2, 3, 5 are absent (nothing registered); item 1 and surface items remain. Every item is a `PaneMenuItem` (`w-full`, `data-menu-close` unless it opens a dialog). Ellipsis only where a dialog follows (Delete…, Cancel invoice…). Flag never carries colour in the header (it is a menu item only).

### Source strip copy

| Control | Label | `title` / aria | Notes |
|---|---|---|---|
| Filename | the filename | `title` = full filename | `truncate`, 13/500 slate-700; long names (60+ chars) truncate, never wrap |
| Open file | **Open file** (icon `ExternalLink`) | `title="Open the source file in a new tab"` | `<a href=fileUrl target=_blank rel=noopener>`; the ⋯'s *Open in a new tab* is the *pane* — two objects, two labels (H4: one term per concept) |
| Layout | segmented **Split · Details · Source** | `role=radiogroup aria-label="Pane layout"`; each `role=radio aria-checked` | `lg+` only (below `lg` the panels stack, #225); ←/→ move the radio (↑/↓ are the queue's row keys; `[role=radiogroup]` is added to the queue keydown ignore list at `queue-screen.tsx` ~L158 so the strip never steps the row); state persists for the session per queue (`sessionStorage`, key `pane-layout`) |
| Missing / failed render | "Could not render this PDF. **Open it directly**." (unchanged, `provenance-pdf.tsx`) | | the strip still renders above it, so *Open file* is a second route to the same file |

## 3. Stepper

- `StageIndicator` renders both forms; CSS decides: `<ol class="hidden lg:flex …">` and `<p class="lg:hidden …"><span class="sr-only">Step n of N, </span>‹label› · n of N</p>` (an `aria-label` on a `<p>` has no role to hang on; the sr-only prefix is what is read). The current node = first step with state `current` or `blocked`; if none, the last `done`. `n` is its 1-based index, `N` = steps.length (4 for bank statements).
- Band: `h-9 border-b border-slate-200 px-3 flex items-center overflow-hidden` — no horizontal scroll; at `lg` the five pills fit in 830px (measured 2026-09-15: ~520px).
- Words: today's labels (#258 rewrites).

## 4. State inventory (`fortify`)

| # | State | Where | Rendering |
|---|---|---|---|
| S1 | Loading content | pane | line 1 + line 2 (row pills) render immediately; stepper band shows a 36px skeleton bar; body skeleton as today (`aria-busy` on the content region) |
| S2 | Missing document (`loadDetail` → null) | pane | header stays; body: "This document is no longer in the workspace. Close the pane and refresh the queue." + **Refresh queue** button (calls `onMutated("removed")`) — today's copy has no control (Dead End) |
| S3 | Load error / render error | pane | as today: message + **Retry**; ⋯ keeps *Open in a new tab* |
| S4 | Cancelled row | ⋯ | Archive · Flag · Delete… disabled, hint "Cancelled invoices are already closed." (noun from the queue: invoice / receipt / document) |
| S5 | Archived row (Closed facet) | ⋯ + Status line | item reads **Unarchive**; the ledger/state pills are the row's; the stepper unchanged |
| S6 | Missing / unrenderable source | source panel | strip renders (filename + Open file + layout); body shows provenance-pdf's error line |
| S7 | Long name / long filename | header, strip | `truncate` + `title`; suffix truncates before the title (title `shrink-0` up to 60%, suffix `min-w-0`) |
| S8 | Full mode, deleted document | `?full=1` | `notFound()` as today → route 404 in-shell |
| S9 | Full mode, no `from` | `?full=1` | Back to queue → typed queue path (`documentDestinationPath`) |
| S10 | Action failure (4xx/5xx/network) | ⋯ | toast error with the server's message or "Could not reach the server — nothing changed"; item re-enabled; menu closed; focus on ⋯ |
| S11 | Below `lg` (390) | header | `[←] Back to queue` replaces × ; ↑↓ stay; `1 of N` hidden; stepper one line; strip without the layout control; ≤ 100px above the strip |
| S12 | Payment Batches pane | frame | no `status`, no document items; header is line 1 only (40px) |
| S13 | Concurrency: another user archived/deleted/cancelled the row while open | ⋯ action | server action returns `success:false` with the reason → toast; `onMutated("changed")` reloads and the pane shows S2 or the new state. **Delete dialog, two branches:** not-found reason → dialog closes, toast "Already deleted by someone else", `onMutated("changed")` → S2; any other error → dialog stays open, busy off, error line inside the dialog |
| S14 | Reduced motion | all | no motion added; the layout `transition-[flex-basis]` honours `motion-reduce:transition-none` |

## 5. Keyboard and announcements (`include`)

- Focus order in the pane: `h2 → (↑) → (↓) → ⋯ → ×` (position span is not focusable; the Back button precedes the h2 below `lg`). Opening/moving selection focuses the `h2` (unchanged). Esc closes the pane (queue-level, unchanged).
- ⋯: `aria-haspopup="menu"`, `aria-expanded`; popover content `role="menu"`; items `role="menuitem"` (buttons), separator `role="separator"`. Open → focus the first item; ArrowUp/Down move (roving, wrap); Home/End; Esc closes and returns focus to ⋯; Tab closes and moves on. (Radix Popover gives trap + Esc + return; arrow handling is a 12-line `onKeyDown` on the content.)
- Delete…: dialog opens *after* the menu has closed and focus is back on ⋯ (`requestAnimationFrame`), so `ConfirmDialog`'s opener is the ⋯ button and Cancel/Esc returns there. Destructive → initial focus on Cancel (existing behaviour).
- Layout control: `radiogroup`, ←/→ change, one Tab stop; `[role=radiogroup]` joins the queue's keydown ignore selector. Open file: a real link.
- Stepper one-liner: sr-only prefix "Step 3 of 5, " before the visible text; the `<ol>` keeps `aria-label="Document lifecycle"`.
- Live: `1 of N` stays `aria-live=polite`; toasts are sonner's live region; after Archive/Flag the Status line re-renders from the reloaded pane (not announced beyond the toast).
- Targets: every header control 36×36; strip controls ≥ 28px tall, 44px hit on touch via padding below `lg`.

## 6. Contracts summary (Part B pointers)

- B1: every ⋯ item has a caller and a reversal row above; grep `archiveDocumentsAction|flagDocumentsAction|deleteDocumentsAction` → callers in `document-actions-menu.tsx` (+ bulk bar).
- B2: Archive/Flag → pane reload (`reloadKey`) + list refresh on close/move; Delete → close + refresh; no view shows the pre-mutation state after its own refresh.
- B3: one term each — *Open in a new tab* (pane) · *Open review task* · *Open file* (source) · *Archive/Unarchive* · *Flag for attention/Remove flag* · *Delete…* · *Back to queue* · *Close*; sentence case everywhere; no "document header", "detail sheet".
- B4: `Popover`, `ConfirmDialog`, `PaneMenuItem`, `StatePills`, `StageIndicator`, `Button` — no new primitive except `PaneFrame` (a split of the existing one) and the segmented layout control (three `role=radio` buttons in one bordered group; not a new design-system component).
- B5: table in preflight.
- B6: S13.

## 7. Out of scope here

Status-line content (#258), Flag removal (#260), stepper words (#258), queue header ⋯ keyboard model (unchanged, incumbent). Full mode carries no decision footer — ruled acceptable by the spec critic once `?stage=`/`?page=` land on the queue (Part D); recorded on the ticket.
