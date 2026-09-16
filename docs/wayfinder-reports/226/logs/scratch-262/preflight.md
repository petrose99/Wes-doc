# Pre-flight — #262 Keyboard shortcut set (filled before code)

Spec: `spec.md` beside this file. Surface: behaviour layer on the six queues + one dialog + account-menu item + rail
tooltips. Mode: Operate — all ten heuristics apply. Lessons applied: generic B5 focus lessons (#257/#258 — every action
names the element focus lands on and how it survives remount/navigation; probe `activeElement` live), #253 B5 disabled
opener, #261 keyboard-contract-as-probe, #252 `sr-only`-only explanation banned, #261 `sr-only` in buttons (detector).

## Part A — Excellence targets

| H | Target | What a 4 looks like here | Spec |
|---|---|---|---|
| H1 Status | **4** | The only mutation is the switch: it updates the switch, the account-menu mirror and the listener in the same tick (store event); the open row is `aria-current` + roving stop; route jumps announce the title; focus is always visible on a named element, never body | §3.2, §3.4, B2 |
| H5 Prevention | **4** | No key acts on data, so nothing to confirm; every letter is suppressed in fields, dialogs, menus, listboxes, with modifiers, while composing; `g f`/`g x` cannot misfire as `f`; the switch sits inside a dialog so no key flips it; unbuilt destinations have no key | §3.3, B1 |
| H2–H4, H6–H10 | 3 | solid: one vocabulary (B3), shell Dialog + queue switch markup (B4), Esc/return everywhere (B5), `?` + menu + tooltips for discoverability (H6/H10), no toasts or extra chrome (H8), errors impossible → nothing to recover (H9) | |

H7 is this ticket's reason; it is built to a strong 3 (shortcuts on the frequent moves, `?` sheet, bulk untouched) and may
land a 4 without extra work — not chased.

## Part B — Contracts

### B1 · Action reachability and reversal
| Action | Control | Destructive? | Consequence copy | Reversal |
|---|---|---|---|---|
| Jump to queue | `g ‹k›`; rail link (mouse/Tab) | no | — | rail / `g` back / browser Back |
| Go to Search | `/` | no | — | Back / `g ‹k›` |
| Focus filters | `f`; Tab | no | — | Tab away |
| Open dialog | `?`; account menu "Keyboard shortcuts" | no | — | Esc / × / outside click |
| Turn shortcuts off/on | switch in the dialog | no (reversible in place) | helper text says when to turn off | flip the switch back; menu shows "Off" so the state is findable |
| Move row focus / open row / select row | arrows, Home/End, Enter, ←/Space | no | — | — |
| Next/prev mismatch | `]` `[` | no | — | — |
Check: every key in `KEYS` has a dialog row; `grep -n "router.push" components/shell/keyboard-shortcuts.tsx` targets only hrefs from `destinations`; no `approve|reject|delete|archive|flag` call in the shortcut file.

### B2 · View freshness after every mutation
| Mutation | Views | Mechanism | Same tick |
|---|---|---|---|
| Switch toggled | switch `aria-checked` · account-menu "Off" · listener gate · other tabs | `useSyncExternalStore` on the store + `storage` event | yes (other tabs: on event) |
| Row opened by key | `aria-current` · roving `tabIndex` · pane · URL `?doc=` | existing `open()` + tabindex derived from `openId` | yes |
| Queue jump | URL · title · focused row · rail `aria-current` | router + `pendingFocus` consumed after rows render | on arrival |

### B3 · Vocabulary
| Concept | Term | Appears on | Casing |
|---|---|---|---|
| feature / dialog / menu item / switch | Keyboard shortcuts | title, menuitem, switch label, CONTEXT.md | sentence |
| groups | Go to · In a queue · In the Detail pane | dialog | sentence |
| off state | Off | menu trailing text, switch state | sentence |
| destinations | rail labels verbatim (Invoices, Purchase Orders, …, Admin, Search) | dialog rows, tooltips | Title (existing rail casing) |
Check: extract strings from the new files; every noun above matches; "shortcut"/"hotkey"/"accelerator" appear nowhere in UI text.

### B4 · Primitive reuse
| Need | Primitive | New? |
|---|---|---|
| dialog | `components/ui/dialog.tsx` (`data-inner`, trap, return focus) | no |
| switch | markup of the Override `role=switch` in `queue-screen.tsx` → extracted to `components/ui/switch.tsx`, queue-screen re-imports it | yes: same control in a third place (B4 rule: extract, not duplicate) |
| menu item | `AccountMenu` `itemClass` + `role=menuitem` | no |
| kbd | one `Kbd` component inside the shortcuts file (only user) | local |
| group heading | the rail "Today" label style | no |
| skip link | the layout's existing skip-link classes | no |
| tooltips | native `title` (existing) | no |
Check: `git diff --stat` shows no new file under `components/ui/` except `switch.tsx`; `grep -rn "role=\"switch\"" components` → all import `Switch`.

### B5 · Focus, keys, failure path
| Surface | Initial focus | Trap + Esc + return | Keys | Failure |
|---|---|---|---|---|
| Shortcuts dialog | × (first focusable) | Dialog primitive; return to opener: `?` → the element focused at keypress (row button / chip / `#main` when body); menu → account chip (menu `close()` refocuses the chip *before* the dialog opens, so `openerRef` records the chip) | Tab cycle; Esc | none possible (static content) |
| Roving table | open/first row | n/a (not modal) | ↓↑ Home End Enter Space ← → | empty queue: arrival → `#queue-title` |
| Queue jump | first row on arrival | n/a | — | 404/unplugged route: cannot happen (keys only from rail items); slow route: skeleton, focus applied when rows render |
| Search jump | search input | n/a | — | page has no input → `#main` |
| Account menu | existing | existing | existing | — |
| Switch | itself when tabbed | inside dialog | Space/Enter | storage throws → in-memory |
Check: keyboard probe prints `activeElement` after `?`, Esc, each `g` sequence, `/`, `f`, skip link, switch toggle — `BODY`/`DIV` fails.

### B6 · Time-axis and concurrency
| Entity | What can change | Shown / done |
|---|---|---|
| `g` window | 1.5 s elapses; second key never comes | pending cleared silently; next key fresh |
| Route during pending | operator clicks elsewhere mid-sequence | `pathname` change clears pending and closes the dialog |
| Rows during arrival | rows load after the effect; row filtered away | `pendingFocus` consumed on the first render with rows *or* an empty state; falls back to `#queue-title` |
| Switch in another tab | flipped elsewhere | `storage` event updates this tab |
| Rail items change | Payments/Admin gated by capabilities | destinations derived per render from the rail list |

## Part C — Coverage by component type
| Type | States | H1 feedback | H3 exit | H5 prevention | H6 labels | H9 error copy |
|---|---|---|---|---|---|---|
| Listener (invisible) | on · off · pending · expired · guarded · <md | focus moves / title announced | Esc n/a | guards, modifiers, IME | dialog + tooltips | n/a (nothing fails) |
| Dialog | open · closed · off-state | switch state visible | Esc/×/outside → opener | inside `[role=dialog]` | title, groups, kbd | n/a |
| Table rows | empty · loading · filtered-empty · 1 row · 200 rows · pane open | ring + aria-current | Tab out | no data keys | row name | existing empty copy |
| Menu item | on · off | "Off" mirror | existing | — | "Keyboard shortcuts" | — |
| Skip link | queue mounted · not | focus lands on a row | — | hidden off-queue | "Skip to the list" | — |
No GAP.

## Part D — Independent spec critic (sonnet, fresh context, 2026-09-16)

| H | critique: self / critic / reconciled | evaluate worst: self / critic / reconciled | Spec change made |
|---|---|---|---|
| H1 | 4 / 3 / 4 | 1 / 2 / 1 | `]`/`[` scope stated in §2, §3.3, §3.5 — silence now means "nothing here", the dialog row says where the key applies |
| H2 | 3 / 3 / 3 | 1 / 3 / 1 | dialog row "Next or previous mismatch — Invoices with a PO"; group no longer implies universality |
| H3 | 3 / 4 / 3 | 0 / 0 / 0 | — (kept 3 in the prediction; a 4 is welcome) |
| H4 | 3 / 3 / 3 | 1 / 3 / 1 | one letter → one landing: `g y` → Bill Pay, `g a` → Approvals › Invoices; dialog rows name the landing (§2, §3.5, §7) |
| H5 | 4 / 4 / 4 | 0 / 0 / 0 | — |
| H6 | 3 / 3 / 3 | 1 / 1 / 1 | — |
| H7 | 3 / 3 / 3 | 1 / 1 / 1 | — |
| H8 | 3 / 3 / 3 | 1 / 1 / 1 | — |
| H9 | 3 / 2 / 3 | 0 / 2 / 1 | same fix as H1/H2: an inapplicable key is documented as scoped, not silent-broken |
| H10 | 3 / 3 / 3 | 1 / 1 / 1 | — |

Critic's P1s (2): `g y` ambiguous between two Payments queues; `]`/`[` listed as universal. Both removed by spec text
(no code involved). Walkthrough failure (`g y`) → pass after the landing is named. Verdict Clean (both).
**Gate after reconciliation: predicted critique 32/40 (H1, H5 = 4; none under 3) · evaluate sum ≈ 8, P0 0, P1 0 · Clean → met.**

## Part E — Predict `evaluate`

### E1
| H | Worst issue the spec still permits | Sev | Fix |
|---|---|---|---|
| H1 | silent `g` window (no indicator that a sequence is pending) | 1 | accepted convention (Gmail/GitHub); dialog description explains |
| H2 | `g y` for Payments is a non-mnemonic letter (p taken) | 1 | tooltip + dialog carry it |
| H3 | none: Esc/return on the dialog; switch reversible | 0 | — |
| H4 | `Kbd` styling local to one file | 0–1 | single user |
| H5 | `?` on layouts where it is not Shift+/ (e.g. some AZERTY) — still `event.key === "?"` | 0 | key-based, layout independent |
| H6 | expanded rail shows no key hints | 1 | dialog is the source; `?` discoverable via menu |
| H7 | no key for bulk / select-all (by decision) | 1 | decided on #240 |
| H8 | dialog lists 17 rows | 1 | two-column at md+ |
| H9 | none possible | 0 | — |
| H10 | first-run has no hint that shortcuts exist (H10 rides on #264) | 1 | menu item + tooltips |
Sum ≈ 7 · P0 0 · P1 0 · P2 0 → health ≈ 88–92.

### E2 walkthroughs
| Task | Steps | try | notice | associate | progress | Rating |
|---|---|---|---|---|---|---|
| Reach the first row from load (Tab, Tab, Enter) | 3 | yes | skip link visible on focus | "Skip to the list" | ring on row | pass |
| Work down the queue with the pane open (↓ ↓ Enter Esc) | 4 | yes | ring/aria-current | arrows = rows | pane follows | pass |
| Jump Invoices → Exceptions (`g e`) | 2 | yes (learned from `?`/tooltip) | tooltip on collapsed rail | letter = label initial | new title + row focused | pass (1 hesitation first time) |
| Learn the keys (`?`, read, Esc) | 3 | yes | menu item | dialog title | focus returns | pass |
| Turn shortcuts off while dictating (`?` → switch → Esc) | 3 | yes | switch at foot with helper | helper text | menu shows Off | pass |
Estimated completion 95 % · error points: forgetting `g` prefix (dialog teaches it).

### E3 anti-patterns
Pre-selection: switch on by default is the ticket's decision and is reversible in one place, not consent → not Prechecked Consent. Hidden cost/guilt/buried exit/forced continuity/asymmetric friction/misleading label: none. Verdict: **Clean**.

## Predicted scorecard (self, before the critic)
critique: H1 4 · H2 3 · H3 3 · H4 3 · H5 4 · H6 3 · H7 3 · H8 3 · H9 3 · H10 3 = **32/40**. evaluate ≈ 90, 0 P1, Clean.
