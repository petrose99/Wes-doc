# Spec — #264 Three-way empty queue on Invoices (first use · done · filtered) + *How DocuBite works*

Map #226 · decided on #241 · inputs from #243 (address block, no "turn on" link), #248 (**posted**, not "sent to the
ledger"), #258/#261 (H10 = 2 rides here). Mode: **Operate**. Intent run: `specify` (this file), `fortify` (§6),
`articulate` (§7), `include` (§8). Impeccable: `onboard` (§0, §3), `clarify` (§7), `adapt` (§5); craft-floor read.
Primer: `docs/agents/areas/queue-shell.md`.

## 0. Brief (onboard)

- **Aha moment.** The first row appearing on the Invoices queue with its Processing glyph. Everything on the first-use
  state exists to get the operator there in one action; nothing teaches beyond that.
- **Users.** The workspace owner on day one (a finance lead who has just signed up; desktop, exploring, 5 minutes) and,
  later, the Reviewer/Approver who finishes the day's queue (done) or over-filters (filtered). Phone: the Approver (#232),
  who cannot upload (#243 decision 6).
- **Outcome and proof.** `evaluate` H10 ≥ 3 and health ≥ 85 on the Invoices landing; critique ≥ 32/40 with no heuristic
  under 3; the first-use state never renders while the workspace holds any document (counter-metric, #241 d.10).
- **Direction.** No new visual world. One centred column on the existing queue list area; existing type scale; the only
  filled emerald is the primary; no illustration, no icon, no motion. The help dialog is `components/ui/dialog.tsx`.
- **Scope.** `QueueScreen`'s `empty` prop becomes three-way and every queue inherits done/filtered; only Invoices passes
  first-use copy with an action. The account menu's *Show welcome tour again* item becomes **How DocuBite works**.
  **Untouched:** the tour code (`components/onboarding/*`, `lib/onboarding.ts`, `onboarding-actions.ts`) — removal is
  #263; `reset-tour-button.tsx` on Settings › Workspace stays where it is.
- **Anti-goals.** No flag, no dismissal, no stored state, no toast on the first row, no spotlight/overlay, no checklist,
  no progress bar (Artificial Incompleteness), no "turn on email intake" link (#243 d.5 — nothing in-product to link to).

## 1. Vocabulary (B3)

| Concept | Term | Where |
|---|---|---|
| The three states | **Empty queue** — first use · done · filtered empty | CONTEXT.md (already), code comments |
| First-use title | **No invoices yet** | h2 |
| The action | **Add invoices** (never Upload / New / Import; #243 d.9) | primary button |
| The address line | **Or email them to ‹address›** + **Copy** / **Copied** | secondary line (#243 d.5 wording) |
| The address | **Inbound address** (glossary) | code, docs; never shown as a label |
| Done title | **Nothing needs you.** | h2 |
| Done outcome | **n approved today, m posted.** (Post/Posted per #248) | body |
| Filtered title/body/action | **Nothing matches these filters.** · existing hidden-row sentence · **Clear filters** | unchanged (#261) |
| The help item / dialog | **How DocuBite works** | account-menu item, dialog title |
| Steps | **Add** · **In review** · **Approve** · **Post** | dialog rows (state words from the label map: *In review*, *Approved*, *Posted*) |

Casing: sentence case everywhere; the four step names are Title-cased because they are one-word verbs/states.

## 2. Data → state (the one function)

`lib/queue/empty-state.ts` — `emptyQueueState({ workspaceDocumentCount, rowCount, filtered })`:

```
rowCount > 0                                   → null (rows render)
workspaceDocumentCount === 0 && hasFirstUse    → "first-use"   (nothing exists to filter — beats `filtered`)
filtered                                       → "filtered"
otherwise                                      → "done"
```

- **Order matters (critic finding 1b):** a never-populated workspace that arrives with filter params in the URL (a
  bookmarked saved view, a shared link) must see first-use, not *Clear filters* — there is nothing to clear. First-use
  therefore outranks `filtered`. `hasFirstUse` is whether the queue passed `empty.firstUse`; a queue without it (§4)
  falls through to `filtered` / `done` exactly as today.
- `filtered` is `QueueScreen`'s existing `facets.some(param in searchParams)` (a saved view that sets params is
  filtered — Clear filters is the right offer there).
- **Cross-type count is decided, not an oversight (#241 d.3):** first-use means "the workspace has never held a
  document" of any type. A workspace with receipts but no invoices is past day one — home is Invoices (#237), so day
  one always lands here first — and sees *Nothing needs you. 0 approved today, 0 posted.* on Invoices: true, and the
  band above it still carries the Add button (#266). State row 19 names it; it is not a build error.
- `workspaceDocumentCount` = `prisma.document.count({ where: { workspaceId } })` — every type, every status, including
  cancelled and still-processing: "never held a document" (#241 d.3). Server page computes it; `models/documents.ts`
  gains `countWorkspaceDocuments(workspaceId)` (one line, `cache`d).
- Done counts: `models/queue-outcome.ts` → `getTodayOutcome(workspaceId)`: `approvedToday` = `reviewTask.count`
  where `status = "approved"` and `resolvedAt ≥ startOfToday`; `postedToday` = `integrationPush.count` where the push
  succeeded (`status = "succeeded"`, the literal `models/integrations.ts:280` uses) and
  `completedAt ≥ startOfToday`. "Today" is midnight in `workspace.timezone` (schema line 118; default UTC) — one
  helper `startOfTodayIn(tz)`; no per-user zone exists. Read for every queue page that shows a done state; cheap
  (two counts).
- The first-use state ends itself: the arrival poller / `router.refresh` re-renders the page, the count is 1, rows
  render. Nothing to clear.

## 3. Screens

### 3.1 First use — Invoices, ≥ md (1440)

Inside `#queue-list`, replacing the row table. Header band above it unchanged (Views · Sort · chips · Touchless stat ·
⋯; #266's Add button arrives later in the same band).

```
<section aria-labelledby="queue-empty-title" class="mx-auto max-w-md px-6 py-16 text-center">
  <h2 id="queue-empty-title" class="text-[15px] font-semibold text-slate-900">No invoices yet</h2>
  <p class="mt-2 text-sm text-slate-600 max-w-prose mx-auto">Add an invoice and DocuBite extracts it into a row here.
     You check it beside the source, approve it, and post it.</p>
  <div class="mt-5 flex flex-col items-center gap-3">
    <button class="h-11 md:h-9 px-4 rounded-md bg-emerald-700 text-white font-medium …">Add invoices</button>
    <p class="text-[13px] text-slate-500">Or email them to <code>‹address›</code> <button>Copy</button></p>   ← only when inboundEmail.enabled
  </div>
</section>
```

- Sentence per #241 d.4 with #248's word: *…approve it, and post it.* (was "send it to the ledger").
- **Add invoices** → `openAddDocumentsDialog({ type: "invoice" })` from #266's module. **If #266 has not shipped when
  the build phase runs**, the button is `<Link href="/workspaces/{id}/pipeline?from=invoices">` (the one working upload
  today), same label and look, with a `// TODO(#266)` and a line on the ticket; #266 swaps it for the opener when it
  redirects `/pipeline`. Never a button that does nothing (Dead End).
- **Fallback success path (critic finding 2):** `/pipeline` is an in-shell route (rail stays), and its upload keeps the
  operator on `/pipeline`, where the arrival poller shows the new row. When `searchParams.from === "invoices"` the
  pipeline page renders one `<Link href="/workspaces/{id}/invoices">` **← Back to Invoices** directly under its h1
  (`text-sm text-emerald-700`, `h-9` hit area) — the way back is on the page, not only in the rail. Returning lands on
  the Invoices queue with `workspaceDocumentCount ≥ 1`, so rows render and the first-use state is gone; focus lands on
  `#queue-title` through the existing skip-link/`pendingFocus` path (B5 row). Nothing to reverse: a document added by
  mistake is deleted from its row's ⋯ menu (#234), the same as any other upload.
- Address line: the shared block `components/intake/inbound-address-line.tsx` (`InboundAddressLine({ address })`) —
  *Or email them to* `‹address›` **Copy**; Copy → clipboard, label flips to **Copied** for 1.5 s (button keeps its
  size; `aria-live="polite"` on the label only), on clipboard failure `toast.error("Could not copy the address")`.
  The ticket's #243 comment says build it once on #266; whichever ticket ships first creates the file, the other
  imports it. Existing `InboundEmailAddress` (Admin › Intake) stays; folding it into the shared line is **owned by
  #266** (its `clarify` pass — recorded on #266 at this ticket's close, not left as unowned fog).
- Address value: `${await ensureInboundEmailToken(workspaceId)}@${config.inboundEmail.domain}`; when
  `ensureInboundEmailToken` returns `null` (healthcare workspace) the line is omitted exactly as when intake is off.
- Omitted when `config.inboundEmail.enabled` is false — no replacement text, no link (#243 d.5).

### 3.2 First use — Invoices, < md (390)

Same section, `px-6 py-12`; title 15/600, body 14. No Add button (#243 d.6).
- Email intake on: the address line **is** the action — `<p>` 14px slate-700 *Or email them to* + `<code>` wrapping
  onto its own line + **Copy** as a 48px-tall button (`h-12 px-4`, border, full label).
- Email intake off: one line, *Add invoices from a computer.* — plain `<p>`, no button, no link.

### 3.3 Done — every queue, both widths

```
<section aria-labelledby="queue-empty-title" class="… py-16 max-md:py-12">
  <h2>Nothing needs you.</h2>
  <p>‹n› approved today, ‹m› posted.</p>          ← Invoices, Receipts, Bank Statements (postable queues)
</section>
```
- Non-postable queues (Purchase Orders, Exceptions, Approvals) pass their own one-sentence body; default when none is
  given: *Nothing in this view needs you.* Approvals keeps its existing `action` (the "N waiting on other approvers"
  link) under the done body — `empty.done.action`.
- Zero counts render as *0 approved today, 0 posted.* — one sentence, one function, no branch (H8).
- Pluralisation is not needed: the nouns are participles.

### 3.4 Filtered empty — unchanged from #261

Title *Nothing matches these filters.*, hidden-row sentence, default **Clear filters** with the existing focus hand-off
(`#queue-filters-trigger` → `#queue-facets button` → `#queue-title`). `empty.filteredTitle/Body/Action` keep their
names.

### 3.5 *How DocuBite works* — account menu + dialog

- Account menu (`components/shell/account-menu.tsx`): the *Show welcome tour again* item (RotateCcw, `resetOnboardingAction`)
  is replaced by `<button role="menuitem">` **How DocuBite works** with `CircleHelp` (lucide), between Security and
  Keyboard shortcuts. `onClick: close(); openHowItWorksDialog()`. The import of `resetOnboardingAction` and the
  `useTransition` go with it (the action file itself stays, #263).
- `components/shell/how-it-works.tsx`: `openHowItWorksDialog()` + `HowItWorksDialog` on the same pattern as
  `keyboard-shortcuts.tsx` (module-level listener, mounted once in `Sidebar` beside `KeyboardShortcutsDialog`).
  `Dialog` primitive, `title="How DocuBite works"`, `width="max-w-md"`, centred at every width (`placement="center"`;
  it is a read, not a form — no sheet).
- Body: `<ol class="mt-1 space-y-3 text-sm">`, four `<li class="flex gap-3">`: a 20px tabular numeral in slate-400 (the
  sequence *is* the information, so numbering is earned — craft-floor) + `<span><strong>Step</strong> — sentence</span>`:
  1. **Add** — Drop invoices on the queue, add them with **Add invoices**, or email them to the workspace's address.
  2. **In review** — DocuBite extracts each one into a row. Open it to check the fields beside the source.
  3. **Approve** — Approve it yourself or start an approval flow; Needs attention marks anything a check blocked.
  4. **Post** — Post the approved invoice to your ledger. It stays on the queue as a Posted row.
  Footer line 13px slate-500: *Keyboard shortcuts are under the account menu, or press ?* — one link to the other
  help surface (H10), no button.
- Esc / × / outside click close; focus returns to the account chip (the opener at open time was the menu item, which
  unmounts on `close()` — so `openHowItWorksDialog()` is called **after** `close()` returns focus to the chip, the same
  order the Keyboard shortcuts item already uses; B5 verifies live).
- No spotlight, no steps state, no "don't show again" — nothing stored.

## 4. `QueueScreen` API change

```ts
empty: {
  /** First use — the workspace has never held a document. Optional: queues without first-use copy fall to `done`. */
  firstUse?: { title: string; body: string; action?: ReactNode; phoneAction?: ReactNode }
  /** Rows exist in the workspace, none in this view. Title defaults to "Nothing needs you." */
  done?: { title?: string; body?: string; action?: ReactNode }
  filteredTitle?: string; filteredBody?: string; filteredAction?: ReactNode
}
workspaceDocumentCount: number
```
- Migration of the six callers is mechanical: today's `{ title, body }` becomes `firstUse: { title, body }`
  (their existing "No ‹noun›s yet." copy is their first-use copy — unchanged words, now shown only when the workspace
  is empty), plus `done` where a queue has an outcome sentence. `DocumentQueue` (POs, Receipts, Bank Statements) takes
  `todayOutcome?: { approvedToday, postedToday }` and passes `done.body` for Receipts/Bank Statements only.
- The rendering moves out of the JSX into `components/queue/queue-empty.tsx` (`QueueEmpty`), one component with a
  `state` prop; the list area is otherwise untouched.
- `phoneAction` renders `<md` in place of `action` (Invoices: the address line or the *from a computer* sentence).

## 5. Rendering (adapt, layout, typeset)

| | 1440 | 390 |
|---|---|---|
| column | `mx-auto max-w-md px-6 py-16 text-center` | `px-6 py-12` (24px sides) |
| h2 | 15/600 slate-900 | same |
| body | 14/400 slate-600, `max-w-prose` | same, wraps |
| primary | `h-9 px-4` filled `bg-emerald-700` white, ring `emerald-600` | not rendered |
| secondary line | 13 slate-500, Copy as text button `h-9 px-2` emerald-700 underline on hover | 14 slate-700; Copy `h-12 px-4` bordered, block under the address |
| done body | 14 slate-600 | same |
| dialog | `max-w-md`, `space-y-3`, numerals `tabular-nums` | same, `placement="center"`, scrolls inside if needed |

Type steps: 15 → 14 → 13 is the existing queue scale (h1 is 18 on desktop / 16 phone); no new sizes. Touch targets
≥ 44 (desktop) / ≥ 48 (phone) on every control. Contrast: slate-500 on white = 4.6:1 (passes at 13px). No motion.

## 6. State inventory (`fortify`)

| # | State | Renders |
|---|---|---|
| 1 | first-use · intake on · ≥ md | title, sentence, **Add invoices**, address line + Copy |
| 2 | first-use · intake off · ≥ md | title, sentence, **Add invoices** — no second line |
| 3 | first-use · intake on · < md | title, sentence, address line + Copy (48px) |
| 4 | first-use · intake off · < md | title, sentence, *Add invoices from a computer.* |
| 5 | first-use · healthcare workspace (no token) | as 2 / 4 |
| 6 | done · Invoices/Receipts/Bank Statements | *Nothing needs you.* + counts (incl. 0, 0) |
| 7 | done · PO / Exceptions / Approvals | *Nothing needs you.* + queue body (Approvals keeps its link) |
| 8 | filtered empty (any queue, any width) | unchanged #261 |
| 9 | loading | `QueueLoading` skeleton (route `loading.tsx`) — unchanged; never the first-use text mid-load |
| 10 | documents exist but all still processing (`received/queued/processing`) | done with counts; the arrival poller brings the rows |
| 11 | first-use while an upload is in flight (#266 dialog open) | dialog over the first-use state; on Done the page refreshes → rows |
| 12 | Copy fails (no clipboard permission, insecure context) | `toast.error("Could not copy the address")`, label stays Copy |
| 13 | count query fails (DB error) | the page's `error.tsx` — the queue page already throws on model failure; no half state |
| 14 | long address (token + long domain) at 390 | `<code>` `break-all`, Copy on its own line |
| 15 | dialog opened from a phone (< md account menu) | centred dialog, same content |
| 16 | reduced motion | Dialog's shared transition honours it; nothing else moves |
| 17 | another user adds the first document while the owner looks at first-use | next refresh shows rows; no stale-state risk beyond what every queue has |
| 18 | after Clear filters on a workspace with zero documents | cannot occur: first-use outranks filtered (§2), so Clear filters is never offered there |
| 19 | workspace holds receipts/POs, zero invoices ever | Invoices shows done: *Nothing needs you. 0 approved today, 0 posted.* — decided #241 d.3; Add lives in the band (#266) |
| 20 | zero-document workspace arrives with filter params in the URL | first-use (§2 order); the chips still render in the band so the params are visible |
| 21 | fallback `/pipeline?from=invoices`: upload completes | row appears on the pipeline list; **← Back to Invoices** under the h1; Invoices then renders rows |
| 22 | fallback `/pipeline?from=invoices`: operator leaves without uploading | Back link / rail → Invoices, still first-use; nothing changed, nothing stored |
| 23 | zero-document workspace, non-Invoices queue visited directly (rail) | existing "No ‹noun›s yet." title+body as `firstUse`, no action — unchanged behaviour, home is Invoices (#237); the help dialog is one menu away |

Fallback ownership: if #266 has not shipped by this ticket's close, the `TODO(#266)` and the pipeline Back link are
listed on #266's ticket as its swap-out step at close — the fallback is tracked, never silently permanent.

No offline state beyond the app's own (server page).

## 7. Copy matrix (`articulate` / `clarify`)

| Key | String |
|---|---|
| first.title | No invoices yet |
| first.body | Add an invoice and DocuBite extracts it into a row here. You check it beside the source, approve it, and post it. |
| first.primary | Add invoices |
| first.email | Or email them to ‹address› |
| first.copy / copied | Copy · Copied |
| first.copyError | Could not copy the address |
| first.phoneOff | Add invoices from a computer. |
| done.title | Nothing needs you. |
| done.body.postable | ‹n› approved today, ‹m› posted. |
| done.body.default | Nothing in this view needs you. |
| filtered.* | unchanged |
| menu.help | How DocuBite works |
| dialog.title | How DocuBite works |
| dialog.steps | see §3.5 |
| dialog.footer | Keyboard shortcuts are under the account menu, or press ? |

Voice: present tense, second person, quieter tone; no exclamation marks; no "welcome"; no "get started".

## 8. Accessibility (`include`)

- Empty section: `<section aria-labelledby="queue-empty-title">` with `<h2>` — the queue's h1 stays `#queue-title`;
  heading order h1 → h2. No live region (the state is the page, not an update). The #262 pending-focus consumer:
  when `rows` are empty it focuses `#queue-empty-title` (`tabIndex=-1`) instead of a row — one line in the existing
  effect; the *Skip to the list* link and `g i` then land somewhere visible, never on `body`.
- **Add invoices**: `<button type="button">` (or `<Link>` in the fallback) — visible text is the name.
- Copy: `<button aria-label="Copy the email address">`, visible text Copy/Copied; `<code>` is plain text, selectable.
- Phone: Copy `h-12`; the address `<code>` is a text node, not a control.
- Dialog: `Dialog` primitive gives trap, Esc, initial focus (× first), return to opener (the chip, see §3.5); `<ol>`
  so a screen reader announces "list, 4 items"; step names in `<strong>` are not headings.
- Colour never carries meaning (no glyph on the empty state).
- Keyboard probes (round script, both widths): Tab from `#queue-title` reaches Add / Copy in order; Enter on the
  menu item opens the dialog with focus inside; Esc returns to the account chip, never body.
