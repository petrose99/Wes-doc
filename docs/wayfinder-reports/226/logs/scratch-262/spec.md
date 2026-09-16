# Spec — #262 Keyboard shortcut set (roving rows · g-sequences · f / ? / `/` · Keyboard shortcuts dialog)

Map #226 · decided on #240 · inputs from #245 (`/` search key) and #250 (next-mismatch key). Mode: **Operate**.
Intent skills run: `specify` (this file), `fortify` (§6), `articulate` (§7), `include` (§8). Impeccable: `shape` confirmed
(brief in §0), `clarify` (§7), craft-floor read; `layout`/`typeset` apply only to the dialog (§5).

## 0. Brief (shape)

- **Job and audience.** The desktop Reviewer (#239) working a queue for an hour at a time: reach the rows without Tabbing
  through the rail (14 stops) and the header band (10), traverse rows, jump to another queue, open the filters, learn the
  keys. Mouse-free, and equally usable from a screen reader in focus mode. The Approver's phone lane (#232) has no keyboard.
- **Outcome and proof.** Tabs from load to the first row ≤ 3 (incumbent 28); every `g` sequence lands on the first row of
  the destination; `?` opens the dialog, `Esc` returns focus to the opener; off switch → letters do nothing, arrows still
  work. `evaluate` H7 ≥ 3, critique ≥ 32/40.
- **Direction.** No new visual world: the surface is a behaviour layer plus one centred dialog on `components/ui/dialog.tsx`,
  three groups of label + `<kbd>` rows, the switch at the foot. Emerald focus ring already on the row buttons; no new colour;
  no motion beyond the shared dialog transition.
- **Scope.** Six queues (`invoices`, `purchase-orders`, `receipts`, `bank-statements`, `exceptions`, `approvals/*`) plus the
  two Payments queues and Admin as *destinations*; the account menu; the collapsed rail tooltips; `CONTEXT.md` already
  carries the glossary term. **Untouched:** the Detail pane's `Enter` field-confirm, the document-wide `↑/↓/Esc` with the
  pane open, `global-search.tsx` (stays unmounted, #245/#270), server-side persistence (#252 if asked), phone tab order (#261).
- **Anti-goals.** No key acts on data (no approve / reject / delete / edit / select-all). No badges, no onboarding nag, no
  faux key caps, no sheet, no page.

## 1. Vocabulary (B3)

| Concept | Term | Where |
|---|---|---|
| The feature | **Keyboard shortcuts** | dialog title, account-menu item, switch label, CONTEXT.md |
| A two-key jump | `g` then `‹letter›`; rendered `g i` | dialog rows, rail tooltip `Invoices · g i` |
| The switch | "Keyboard shortcuts" with helper "Turn off if a key fires while you dictate or use a screen reader." | dialog foot only (CONTEXT.md: *one* switch) |
| Groups | **Go to** · **In a queue** · **In the Detail pane** | dialog |
| Off state on the menu | trailing "Off" beside the menu item | account menu |

Casing: sentence case everywhere; key glyphs lower-case letters, `↑ ↓ ← → Home End Enter Esc Space ? /` as written.

## 2. Components and files

| Piece | File | Notes |
|---|---|---|
| Shortcut store | `lib/shell/keyboard-shortcuts.ts` | `localStorage["docubite.keyboardShortcuts"]` = `"off"` \| absent; `useKeyboardShortcutsEnabled()` via `useSyncExternalStore` (a `storage` + custom event so the dialog switch and the menu mirror update in the same tick, B2). `setKeyboardShortcutsEnabled(bool)`. SSR snapshot = on. |
| Shortcut hook + dialog host | `components/shell/keyboard-shortcuts.tsx` | `KeyboardShortcuts({ destinations })` rendered once by `Sidebar` (it owns the rail item list). Registers the single `keydown` listener; owns `dialogOpen`, the pending-`g` state, the 1.5 s timer; renders `KeyboardShortcutsDialog`. Desktop gate: `matchMedia("(min-width: 768px)")` — below `md` the listener is not attached (and `Sidebar` is `hidden md:flex`, but the listener gate is explicit, not layout-derived). |
| Dialog | same file, `KeyboardShortcutsDialog` | on `Dialog` (`width="max-w-lg"`, `placement="center"`); opened by `?` and by the account-menu item; `open` state lives in the host so both openers share it. Focus returns to the opener via `Dialog`'s own `openerRef` (`?` → the element focused when pressed, or `#main` if `body`; menu item → the account chip, see B5). |
| Account menu item | `components/shell/account-menu.tsx` | `role=menuitem` "Keyboard shortcuts" (Keyboard icon) after "Show welcome tour again", trailing `Off` (`text-slate-500`) when disabled; `onClick` → `close()` then dispatch `open-keyboard-shortcuts` custom event (the host listens; no prop drilling through `Sidebar`). |
| Rail tooltips | `components/shell/sidebar.tsx` | `title={compact ? (key ? `${label} · g ${key}` : label) : undefined}`; the `key` comes from `SHORTCUT_KEYS` map: `invoices:i, purchase-orders:p, receipts:r, bank-statements:b, exceptions:e, approvals:a, payments:y, admin:d`, keyed by rail item; each letter targets the rail item's own `href` — one letter, one landing: `g a` → `approvals/invoices`, `g y` → `payments/bill-pay` (the rail's Payments landing; Payment Batches is reached from Bill Pay's segment as by mouse), `g d` → Admin › Configuration. The dialog row names the landing: "Payments (Bill Pay)", "Approvals (Invoices)". An item not on the rail (Payments when `paymentsItem` is absent, Admin when hidden) has no key and no dialog row. |
| Roving rows | `components/queue/queue-screen.tsx` | row buttons form the roving group; checkboxes `tabIndex=-1`, reached with `←` from the row button (`→` returns); `Home/End`; `Enter`/`Space` on the button opens (native); focus-on-arrival from a jump. |
| Skip link | `app/(app)/workspaces/[workspaceId]/layout.tsx` | second skip link **"Skip to the list"** → `#queue-list` (focus lands on the open row else the first row button; when the queue is empty, on `#queue-title`). The link must precede the rail in DOM order (Tab 2), so it lives in the layout; it is `hidden` unless a queue is mounted — `QueueScreen` sets `document.body.dataset.queueList = "1"` in a `useLayoutEffect` (cleared on unmount) and the link renders `[data-queue-list] &` visible (Tailwind `[[data-queue-list]_&]:block` on the `sr-only` link, `hidden` otherwise). Activation → `pendingFocus = "rows"` applied at once (no navigation). |
| Search key | `components/shell/keyboard-shortcuts.tsx` | `/` → `router.push(`${base}/search`)` then focus `input[type=search], input` on arrival (same pending-focus mechanism as rows, target selector differs). Registered because `app/(app)/workspaces/[workspaceId]/search/page.tsx` exists today; #270 inherits and re-points it when Search moves to the rail. |
| Mismatch keys | host (`components/shell/keyboard-shortcuts.tsx`) | `]` / `[` move focus to the next / previous `button[aria-label^="Does not match the PO"]` (rendered by `components/documents/po-compare.tsx` in the View PO row of an invoice pane, #250) inside `#detail-pane`, wrapping. **Scope: an invoice pane with a View PO row** (Invoices, Approvals › PO Mismatches). No-op, no feedback, when the pane is closed, is not such a pane, or has no `≠` — the dialog row carries the scope note "Invoices with a PO" so silence reads as "nothing here", never as a broken key. Focus only; opens nothing. |

## 3. Behaviour

### 3.1 Roving tabindex on rows (always on, not a shortcut)
- Group = the row buttons in DOM order. Exactly one carries `tabIndex=0`: the open row if any, else the last row focused
  in this mount, else the first row. All others `-1`. `aria-current="true"` stays on the open row.
- With focus on a row button: `↓/↑` move focus to the next/previous row (no wrap, `preventDefault`); `Home/End` first/last;
  `Enter`/`Space` open (native click); `←` moves to the row's checkbox (if `selectable`), `→` from the checkbox back to
  the button; `Space` on the checkbox toggles selection (native). Arrow keys on the checkbox: `↓/↑` move to the
  adjacent row's checkbox (same column), `preventDefault`.
- With the pane open, `↑/↓` still *move the open row* (existing document-wide handler) — and the roving index follows
  `openId`, so the newly opened row's button becomes the tab stop; `Esc` closes and returns focus to that button (exists).
  Conflict rule: when focus is on a row button and the pane is open, the document handler wins (it opens the next row);
  the roving handler does not fire twice (the row handler checks `openId !== null` and returns).
- `Tab` from a row leaves the group forward (to the pane's Close when open, else the page after the table); `Shift+Tab`
  leaves backward to the select-all checkbox.
- Card rows below `md` are `<a>` in a `<ul>` — untouched (#261); the roving group is the desktop table only.

### 3.2 Arrival focus
- After a `g` jump, `/`, or the "Skip to the list" link: focus lands on the open/first row button (`#queue-title` if the
  queue is empty; `input` on Search). Mechanism: `sessionStorage["docubite.pendingFocus"] = "rows" | "search"` written
  before `router.push`; consumed by `QueueScreen` (or `search-client`) in a `useEffect` after the rows render, then
  removed. The same route → `router.push` is skipped and the focus applied immediately.
- Next.js's route announcer reads the new `<title>` after the jump; no extra live region.

### 3.3 Shortcuts (single listener, `keydown`, capture = false, on `document`)
Ignore the event when any of: `event.defaultPrevented`; `metaKey|ctrlKey|altKey` held; `event.isComposing`;
`target.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=alertdialog], [role=listbox], [role=menu], [role=radiogroup]")`;
viewport < `md`; shortcuts switched off (except the `?` dialog is *still* reachable from the account menu, never from the key).

| Key | Action | Then |
|---|---|---|
| `g` | start a sequence: `pending = true`, timer 1.5 s | `aria-live="polite"` region (`#shortcut-status`, visually hidden) announces nothing — a sequence is silent; the timer expiring clears `pending` silently |
| `g` + `i p r b e a y d` (only keys in `destinations`) | `router.push(href)` with `pendingFocus = "rows"` (Admin → focus `#main`); if already on that destination, focus the rows in place | clears `pending` |
| `g` + any other key | clears `pending`; the second key is **not** re-interpreted (so `g f` does not open the filters) | — |
| `f` | ≥`md` only: focus `#queue-facets button` (first chip). No facets on this page → focus `#queue-title` (nothing else explains the list) | — |
| `?` (`Shift+/`, checked by `event.key === "?"`) | open the dialog; if open, no-op (Esc closes) | — |
| `/` | go to Search (§2) | — |
| `]` / `[` | next / previous ≠ glyph in an open invoice pane with a View PO row (§2); otherwise no-op | — |
| `Esc` | not registered here (pane / dialog own it) | — |

Modifier note: `?` on most layouts is `Shift+/` — Shift is *not* in the modifier list; only `meta/ctrl/alt` cancel.

### 3.4 Off switch
- `role="switch"` at the dialog foot, label "Keyboard shortcuts", helper text under it, `aria-describedby` → helper.
  Default on. Toggling writes `localStorage` and dispatches the store event; the account-menu "Off" mirror and the
  listener read the same store in the same tick (B2). Off disables `g`-sequences, `f`, `?`, `/`, `]`, `[`. Roving
  arrows/Home/End/Enter/Esc and the pane's `↑/↓/Esc` are unaffected. The switch itself is inside a `[role=dialog]`, so no
  key can flip it back by accident; the dialog stays open after toggling (the operator sees the state and closes with Esc).
- `localStorage` unavailable (private mode throwing): store falls back to in-memory for the session; the switch works,
  helper gains no extra text (silent degrade — nothing the operator can act on).

### 3.5 Dialog content (three groups, static list; rows for unregistered destinations are omitted)
**Go to** — Invoices `g i` · Purchase Orders `g p` · Receipts `g r` · Bank Statements `g b` · Exceptions `g e` ·
Approvals (Invoices) `g a` · Payments (Bill Pay) `g y` · Admin `g d` · Search `/`
**In a queue** — Next / previous row `↓ ↑` · First / last row `Home End` · Open the row `Enter` · Select the row
`← Space` · Filters `f`
**In the Detail pane** — Next / previous row `↓ ↑` · Close `Esc` · Next / previous mismatch — Invoices with a PO `] [`
(the scope note is part of the row label, `text-slate-500`, so the key is never read as universal)
Foot: the switch. Description under the title: "Letters work when you are not typing in a field. Arrows and Enter always work."

## 4. Layout and type (dialog only; `layout` / `typeset`)
- `Dialog` centred, `max-w-lg`; title `text-base font-semibold` (the primitive's); description `text-sm text-slate-600`.
- Groups: `h3` `text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600` (the rail's "Today" label style —
  shell primitive, not a kicker: it labels a list, it is not above a heading); rows `grid grid-cols-[1fr_auto] gap-x-6 py-1.5`
  `text-sm text-slate-800`; groups separated by `mt-4`. Two-column groups at `md`+ (`md:grid-cols-2 gap-x-8`) so the
  dialog stays under one viewport height at 1440×900 with 20 rows; single column below.
- `<kbd>`: `font-mono text-[12px] leading-none text-slate-700 rounded-[4px] border border-hairline bg-white px-1.5 py-0.5`,
  no shadow, no gradient (craft-floor: no faux key caps). Sequences are two `<kbd>` with a `text-slate-400` "then"
  rendered as a thin space — `g` `i` side by side, gap `0.25rem`.
- Switch row at the foot: `border-t border-hairline pt-4 mt-4`, label left, switch right (existing `role=switch` styling
  from `queue-screen.tsx` Override toggle, extracted to `components/ui/switch.tsx` if it is not a primitive yet — B4:
  reuse the queue's markup, one new file only because it is the same control in a third place).
- Focus: the dialog's `initialFocus` = the × close button (first focusable) — the content is read, not operated; the
  switch is the last stop. Emerald ring as everywhere.

## 5. Rail tooltips
`title` on the compact rail's links: `Invoices · g i`. `title` only (native tooltip); the expanded rail shows the label
and no key — the dialog is the source of truth, the tooltip a hint (H6 recognition for the collapsed state).

## 6. State inventory (`fortify`)

| State | Rendering / behaviour |
|---|---|
| Shortcuts on (default) | all keys live; menu item without "Off" |
| Shortcuts off | letters ignored; dialog opens only from the menu; menu item shows "Off"; switch reads off |
| Dialog open | trap + Esc + return focus (Dialog); queue handler defers (`[data-inner]`); letters inside ignored (`[role=dialog]`) |
| Sequence pending | 1.5 s window; expiry silent; any non-letter key ends it |
| Sequence expired | next key is a fresh key |
| Focus in a field / menu / listbox / radiogroup | nothing fires (guard) |
| Pane open | roving stop follows the open row; `↑/↓` move the open row; `Esc` closes → row button |
| Pane closed | `↑/↓` on a row move focus only; `Enter` opens |
| Destination not built / not on the rail | no key, no dialog row, no tooltip suffix |
| Already on the destination | no navigation; rows focused in place |
| Queue empty (any of the three empty states) | arrival focus → `#queue-title`; arrows do nothing (no rows); `f` still works when facets exist |
| Loading (`loading.tsx` skeleton) after a jump | `pendingFocus` waits for the rows effect — consumed on the first render with rows or with the empty state, never lost |
| Viewport < `md` | listener not attached; dialog unreachable (no account menu below `md`); roving arrows still on the table when it is rendered (md–lg has the table) |
| Modifier held / IME composing | ignored |
| Screen reader browse mode | letters consumed by the AT before the page; focus mode → roving arrows work; the switch exists for the residual case |
| `localStorage` blocked | in-memory fallback |
| Two tabs | each tab reads storage on the `storage` event → both mirror the switch |
| Route change with dialog open | `Dialog` unmounts with the host? No — host is in `Sidebar`, persistent across routes: dialog stays open; fine (a modal over the new page, Esc closes). Guard: close the dialog on `pathname` change to avoid a trapped focus over a page the operator did not see. |
| Reviewer holds `↓` (key repeat) | each repeat moves one row; `preventDefault` stops page scroll; row scrolled into view (`scrollIntoView({block:"nearest"})`) |
| 200+ rows | roving group is the rendered table; `End` jumps and scrolls; no virtualisation change |

## 7. Copy (`articulate` / `clarify`) — every string
- Dialog title: **Keyboard shortcuts**
- Dialog description: **Letters work when you are not typing in a field. Arrows and Enter always work.**
- Group headings: **Go to** · **In a queue** · **In the Detail pane**
- Rows (label → keys): Invoices · Purchase Orders · Receipts · Bank Statements · Exceptions · Approvals · Payments · Admin
  (rows: Approvals (Invoices), Payments (Bill Pay)) · Search · Next or previous row · First or last row · Open the row · Select the row · Filters · Close · Next or
  previous mismatch — Invoices with a PO
- Switch label: **Keyboard shortcuts** · helper: **Turn off if a key fires while you dictate or use a screen reader.**
- Switch accessible name: "Keyboard shortcuts" (`aria-describedby` helper); state via `aria-checked`.
- Account menu item: **Keyboard shortcuts** (+ trailing **Off** when off; the item's accessible name becomes
  "Keyboard shortcuts, off").
- Skip link: **Skip to the list**
- Rail tooltip: `‹Label› · g ‹key›`
- No toasts, no confirmations (nothing is destructive; the switch is its own visible state).

## 8. Accessibility (`include`)
- Roving tabindex per WAI-ARIA grid/listbox practice; one tab stop per table; `aria-current` on the open row unchanged.
- Skip link order: "Skip to content" → "Skip to the list" → rail. Both `sr-only focus:not-sr-only`.
- Dialog: `role=dialog aria-modal aria-labelledby aria-describedby` from the primitive; `<kbd>` read by AT as the key
  text; a sequence reads "g i" — acceptable; `aria-label="g then i"` on the sequence wrapper for clarity.
- Switch: `role=switch aria-checked`, label + helper, ≥ 24×24 px target (desktop only surface; 44 px not required).
- Focus visible: emerald ring on every stop (rows, chips, dialog controls, switch).
- Announcements: route change → Next.js announcer; row focus → the button's accessible name (`title · suffix`); no
  polite region for the `g` sequence (a silent 1.5 s window is the Gmail/GitHub convention; an announcement per `g`
  would be noise).
- Reduced motion: dialog transition is the primitive's; nothing new.
- WCAG 2.1.4: single-character keys have a turn-off mechanism (the switch) — compliant; arrows/Enter/Home/End are
  focus-scoped and exempt.

## 9. Origin context (`from=`)
`g` jumps are rail-equivalent hops and carry no `from=` (#244: rail links are bare). `/` search: bare too. `]`/`[`
navigate nothing.

## 10. Tests (build phase)
- `lib/shell/keyboard-shortcuts.test.ts`: store default on, toggle, storage event, fallback when `localStorage` throws.
- `components/shell/keyboard-shortcuts.test.tsx`: `g i` pushes; `g` + unknown clears; timeout clears; guard inside
  input/dialog/menu; modifier ignored; off switch blocks letters; `?` opens; `f` focuses first chip; `<md` not attached.
- `components/queue/queue-screen` roving test: one `tabIndex=0`; `↓` moves focus; `Home/End`; `←` to checkbox;
  pane open → document handler moves the open row; `Esc` returns to the row button; `pendingFocus` consumed.
- Live probes (measure phase, `capture-round.mjs` keyboard entries): Tab count to first row at 1440 ≤ 3 (skip → skip →
  Enter); each `g` sequence lands + `activeElement` is a row button; `?` open/`Esc` return; off → letters no-op, arrows work;
  390: no listener, table absent, cards untouched.
