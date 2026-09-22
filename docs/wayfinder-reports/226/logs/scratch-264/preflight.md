# Pre-flight — #264 Three-way empty queue + How DocuBite works (filled before code)

Spec: `spec.md` beside this file. Surface: the empty-list area of the six queues (Invoices carries first-use copy), one
account-menu item, one dialog. Mode: Operate — all ten heuristics apply. Lessons applied: generic #250 (state inventory
before code → spec §6), #252 (`sr-only` never the only explanation — Copy has visible text), #253 B5 (dialog opener
that unmounts on click → focus returns to the chip, verified live), #258 (pending-focus consumer when the focused thing
does not exist → §8 focuses `#queue-empty-title`), #261 (`sr-only` inside buttons trips the detector → `aria-label`),
#262 (a new link to an existing route is audited for guards → `/pipeline` fallback has no redirect on `from=`; the
detector residue five is reported, not chased), project #261 (zero-row queries per queue for the filtered state come
from `probe-empty261.mjs`; first-use needs a **second, empty workspace** in the seed — `seed257b` never has zero
documents), project #252 (stop the dev server before tsc/eslint).

## Part A — Excellence targets

| H | Target | What a 4 looks like here | Spec |
|---|---|---|---|
| H1 Status | **4** | The state *is* the status: three sentences, each true by data the same tick the page renders; Copy flips to Copied in place; the first row replaces the first-use state through the existing poller; the done sentence carries the day's outcome (n, m) so the operator sees where the queue stands without a summary surface | §2, §3.3, B2 |
| H5 Prevention | **4** | Nothing on the surface can go wrong: no destructive control, the only mutation is a clipboard write with its own failure copy; the first-use state can never show while a document exists (counter-metric is the function's own branch); the phone never offers an upload it cannot do; intake-off never dangles a link to nothing | §2, §6, B1 |
| H2–H4, H6–H10 | 3 | glossary words only (B3); shell `Dialog`, existing empty column, `itemClass` menu row (B4); Esc/return on the dialog, Clear filters unchanged (H3); numbered `<ol>` earns its numbers (H8); H10 is the ticket's reason — first-use guidance + the help dialog reachable from every screen + the footer link to shortcuts | |

H10 is built to a strong 3 and may land 4 (help where it bites + a reopenable explanation + cross-link) — not chased.

## Part B — Contracts

### B1 · Action reachability and reversal
| Action | Control | Destructive? | Consequence copy | Reversal |
|---|---|---|---|---|
| Add invoices (dialog, #266 shipped) | `<button>` → `openAddDocumentsDialog` | no | — | dialog Cancel; an added row is deletable via ⋯ (#234) |
| Add invoices (fallback link) | `<Link>` to `/pipeline?from=invoices` (§3.1) | no | — | not a mutation — leaving: **← Back to Invoices** under the pipeline h1 (`from=invoices`) or the rail; an uploaded row is deletable via ⋯ (#234) |
| Copy address | `<button aria-label="Copy the email address">` | no | — | none needed (clipboard) |
| Clear filters | existing default button | no | — | re-apply a chip |
| Open How DocuBite works | account-menu item; no key (help is not data) | no | — | Esc / × / outside |
| (Approvals) N waiting link | `empty.done.action` | no | — | Back |
Check: `grep -rn "openHowItWorksDialog\|openAddDocumentsDialog\|InboundAddressLine" components app` — each export has ≥ 1 caller; `grep -n "resetOnboardingAction" components/shell/account-menu.tsx` → empty; no `<button` in the new files without an `onClick` or `type=submit`; the fallback `Link` target `app/(app)/workspaces/[workspaceId]/pipeline/page.tsx` has no `redirect(` on the `from` param.

### B2 · View freshness after every mutation
| Mutation | Views | Mechanism | Same tick |
|---|---|---|---|
| First document added (upload, email, another user) | list (rows replace the empty state) · h1 count · rail badge | server page re-render via the arrival poller / `router.refresh` — the count is a server prop | on refresh (existing queue contract) |
| Copy | Copy → Copied label | local state, 1.5 s | yes |
| Clear filters | filtered → done / first-use | URL change → `filtered` recomputed; `workspaceDocumentCount` unchanged | yes |
| Approve / Post that empties the view | rows → done with updated n/m | `onMutated` → `router.refresh` (existing) re-reads `getTodayOutcome` | on refresh |
Check: `workspaceDocumentCount` and `todayOutcome` are read in the server page (`grep -n "countWorkspaceDocuments\|getTodayOutcome" app/(app)/workspaces/\[workspaceId\]/(queue)/*/page.tsx` → every queue page); no client-side caching of either.

### B3 · Vocabulary
| Concept | Term | Appears on | Casing |
|---|---|---|---|
| the action | Add invoices | button, dialog step 1 | sentence |
| the address line | Or email them to ‹address› | first-use (both widths), later #266's dialog | sentence |
| copy control | Copy / Copied | button | sentence |
| done | Nothing needs you. · ‹n› approved today, ‹m› posted. | h2, body | sentence |
| help | How DocuBite works | menu item, dialog title | sentence |
| steps | Add · In review · Approve · Post | dialog `<strong>` | Title (single words) |
| state words in step copy | In review · Needs attention · Posted · Approved | dialog | from `PROCESSING_STATE_LABELS` / glossary |
Check: extract strings from `queue-empty.tsx`, `inbound-address-line.tsx`, `how-it-works.tsx`, `account-menu.tsx`; "upload", "tour", "welcome", "ledger" (as a verb phrase), "sent to" appear nowhere; "Posted"/"post" only.

### B4 · Primitive reuse
| Need | Primitive | New? |
|---|---|---|
| empty column | the existing block in `queue-screen.tsx` (mx-auto max-w-md px-6 py-16 text-center) → lifted into `components/queue/queue-empty.tsx` | extract, not duplicate (one renderer for three states) |
| primary button | the emerald filled button classes used by the queue's bulk bar / `ConfirmDialog` primary | no |
| secondary Copy | text button (desktop) / bordered `h-12` button (phone) — same classes as Clear filters' `h-11` bordered button family | no |
| address block | `components/intake/inbound-address-line.tsx` — new, shared with #266; `InboundEmailAddress` (Admin) stays | new: a second consumer is coming (#266) and Admin's has a different frame; fold-in noted as fog |
| dialog | `components/ui/dialog.tsx` | no |
| menu item | `AccountMenu` `itemClass` + `role=menuitem` + lucide icon | no |
| numbered list | `<ol>` with `tabular-nums` numerals — no card, no icon | — |
Check: `git diff --stat` shows no new file under `components/ui/`; `grep -rn "py-16 text-center" components/queue` → only `queue-empty.tsx`; `grep -n "toast.success" components/queue/queue-empty.tsx components/intake/*.tsx` → empty (no celebration).

### B5 · Focus, keys and failure path per interactive surface
| Surface | Initial focus | Trap + Esc + return-to | Keys | On failure |
|---|---|---|---|---|
| empty section (arrival via `g i`, skip link, Clear filters) | `#queue-empty-title` (`tabIndex=-1`) when `ids` is empty (§8) | — | Tab → Add / Copy → next band control | — |
| Add invoices (dialog form) | inside #266's dialog | #266's contract | Enter/Space | #266 |
| Add invoices (fallback link) | `/pipeline` page's own (h1) | return: **← Back to Invoices** link (`from=invoices`) → Invoices renders rows, focus `#queue-title` via the existing skip-link/`pendingFocus` path | Enter | 404/500 → the app's `error.tsx`/`not-found.tsx` in-shell (existing); leaving without uploading → first-use again, nothing stored |
| Copy | itself | — | Enter/Space | `toast.error("Could not copy the address")`, focus stays |
| How DocuBite works dialog | × (first focusable) — a read; nothing else to land on | shared `Dialog`: trap, Esc, return to `openerRef` = the account chip (menu `close()` refocuses the chip **before** `openHowItWorksDialog()` fires, same order as the shortcuts item) | Esc | none possible |
| Clear filters | unchanged #261 hand-off | — | — | — |
Check: keyboard probe entries `firstuse-tab-order-1440/390`, `firstuse-arrival-focus-1440` (`sessionStorage pendingFocus=rows` → `activeElement.id === "queue-empty-title"`), `help-open-focus-1440/390` (activeElement inside `[role=dialog]`), `help-esc-focus-return-1440/390` (activeElement is the chip `button[aria-haspopup=menu]`, never `body`).

### B6 · Time-axis and concurrency edges
| Entity | What can change | Surface does |
|---|---|---|
| workspace document count | first document arrives (any channel, any user) while first-use is shown | next render shows rows; nothing stored, nothing to invalidate |
| today's counts | midnight passes in `workspace.timezone`; another user approves/posts | recomputed per render; a stale number is at most one refresh old and never claims more than it did |
| inbound token | created lazily on first render (`ensureInboundEmailToken`) | idempotent; healthcare returns null → line omitted |
| clipboard | permission denied / insecure origin | error toast, label unchanged |
Check: `getTodayOutcome` uses `workspace.timezone`; `grep -n "new Date().setHours(0" models/queue-outcome.ts` → empty (no server-local midnight).

## Part C — Coverage by component type

| Type | States | Feedback | Exit | Prevention | Labels | Error copy |
|---|---|---|---|---|---|---|
| empty state (3 kinds × 2 widths × intake on/off) | §6 rows 1–8, 10, 14, 17, 18 | the sentence is the status | Add / Copy / Clear filters / rail | function-chosen; no dangling link | h2 + plain sentences | Copy failure toast |
| loading | `QueueLoading` (existing) | skeleton | — | never shows first-use mid-load | — | — |
| dialog | open · closed · reduced motion · phone | — | Esc / × / outside | nothing to break | title + `<ol>` | — |
| menu item | enabled only (never pending — no action runs) | dialog opens | Esc closes the menu | — | icon + text | — |
| toast | Copy failure only | — | auto-dismiss | — | — | names the problem; recovery = select the address text |
No GAP.

## Part D — Independent spec critic

Two rounds, fresh-context `Agent`, `model: sonnet` (no money/approval/schema/auth), foreground, given spec + this
file + the critique 0–4 guide + evaluate's severity scale.

**Round 1 — FAIL.** critique 29/40 (H3 = 2), evaluate P1 × 3, health ≈ 66, Clean.
| Finding | Sev | Spec change made |
|---|---|---|
| `filtered` outranked first-use: a zero-document workspace with URL params saw Clear filters | P1 | §2 branch order rewritten — first-use beats filtered; state row 20 |
| Fallback `/pipeline` link had no success/return path (B1 reversal and B5 rows optimistic) | P1 | §3.1: `from=invoices` renders **← Back to Invoices** under the pipeline h1; states 21–22; B1 split into dialog/fallback rows; B5 row carries the return + focus |
| Cross-type `workspaceDocumentCount` shows done (0/0) on Invoices for a receipts-only workspace | P1 → decided | #241 d.3 is a closed map decision; named as state 19 with rationale rather than re-decided |
| Admin `InboundEmailAddress` fold-in left as unowned fog | P2 | §3.1 assigns it to #266's `clarify` |

**Round 2 — PASS.** critique **33/40** (H1 4 · H2 3 · H3 3 · H4 3 · H5 4 · H6 3 · H7 3 · H8 4 · H9 3 · H10 3);
evaluate P0 0 · P1 0 · health **86** · Clean. Two P2 completeness lines closed in place: state row 23 (non-Invoices
queue visited directly on a zero-document workspace) and the fallback-ownership note under §6. B1–B4, B6 hold; B5's
dialog-opener ordering rests on the shortcuts-item analogy until the `help-esc-focus-return` probe confirms it live
(build-phase check, listed in B5).

Reconciled prediction (Part A ↔ critic): critique **33**, evaluate health **86**, P1 0, Clean. Gate met.

## Part E — Predict `evaluate`

### E1 · Worst issue per heuristic
| H | Worst issue the spec still permits | Sev | Fix |
|---|---|---|---|
| H1 | done counts can be one refresh stale after another user's action | 1 | B6 — accepted, every queue has it |
| H2 | "posted" assumes the operator knows the ledger word | 1 | dialog step 4 explains it; glossary |
| H3 | fallback `/pipeline` link leaves the queue (until #266) | 1 | `from=` renders **← Back to Invoices** on the pipeline page (§3.1, state 21–22); #266 removes the fallback |
| H4 | Admin's `InboundEmailAddress` and the new line differ in frame | 1 | owned by #266's `clarify`; noted on #266 at close |
| H5 | zero-document workspace with filter params would have seen Clear filters | 0 after fix | first-use outranks filtered in `emptyQueueState` (§2, state 20) |
| H1 | receipts-only workspace sees done with 0/0 on Invoices | 1 | decided #241 d.3 (state 19); sentence is true, Add is in the band |
| H6 | the address `<code>` is not obviously selectable text | 1 | Copy beside it |
| H7 | no keyboard accelerator for help (by decision — no key acts, and `?` is shortcuts) | 1 | footer line cross-links |
| H8 | zero-count done sentence ("0 approved today, 0 posted.") reads slightly flat | 1 | accepted — one function |
| H9 | Copy failure has no in-place recovery beyond the toast | 1 | address stays selectable |
| H10 | first-use copy exists only on Invoices; a fresh workspace landing on Receipts sees the generic "No receipts yet." | 1 | decided on #241 d.2 (home is Invoices, #237) |
Predicted heuristic sum: 9 · P0: 0 · P1: 0 · P2: 0 → health ≈ 88.

### E2 · Cognitive walkthroughs
| Task | Step | Try | Notice | Associate | Progress | Rating |
|---|---|---|---|---|---|---|
| Day-one owner adds the first invoice (1440) | read title + sentence | yes | yes (only content on the page) | yes | — | pass |
| | click Add invoices | yes | yes (only filled control) | yes | dialog / upload page opens | pass |
| | return to the queue, row appears | yes | yes | glyph explained by step 2 of the dialog | row + glyph | pass |
| Day-one owner on a phone, intake on | read | yes | yes | yes | — | pass |
| | tap Copy, paste into mail | yes | 48px button | "Copied" | Copied label | pass (1 hesitation: which mail client — outside the product) |
| Reviewer finishes the queue | sees "Nothing needs you. 3 approved today, 2 posted." | — | yes | yes | counts | pass |
| Reviewer over-filters | Clear filters | yes | yes | yes | rows return, focus on filters | pass |
| Anyone wants to know how the app works | account chip → How DocuBite works | yes (H10: the item is named as a question they have) | yes (menu of 4) | yes | dialog | pass |
| | Esc | yes | — | — | focus back on the chip | pass |
Estimated: completion 95 % · steps ≤ 3 · error points: mail client hand-off (outside), `/pipeline` fallback vocabulary (until #266).

### E3 · Anti-pattern sweep
No pre-selection, no hidden cost, no guilt copy, exit on every surface (Esc/×/outside; Clear filters), no continuity,
symmetric friction, labels say what they do. Obstruction Interstitial / Nagging / Artificial Incompleteness / Assumption
of Context: all absent by construction (no overlay, nothing repeats, no progress bar, the sentence explains the row it
predicts). Verdict predicted: **Clean**.

## Part F — Build checklist
Build from §3–§8 and the B tables; screenshot first-use at 1440 and 390 as it lands; run B1–B6 checks before the first
measurement (`scratch-264/part-b-checks.mjs`, to be written in the build phase on the #258 pattern).

## Part G — Predicted vs measured
(filled at measure/close)
