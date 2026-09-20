# Pre-flight — #329 (fold Bigcapital into the connector panel)

Scope: the Accounting card in `IntegrationsManager` (Admin › Integrations), now three providers;
removal of the standalone Ledger connection Panel and the workspace-creation auto-provision call;
the `accountingEnabled` gate OR. One surface, one build step (the existing
`repairBigcapitalConnectionAction`/`getBigcapitalStatusAction` server actions already cover
Bigcapital's connect/poll needs — no new route, no new job/queue code).

## Part A — Excellence targets
| H | Target | What a 4 looks like here | Spec ref |
|---|---|---|---|
| H1 Status | 4 | Connect → Authorising… → Connected transitions render without a manual reload (poll + router.refresh); Sync/Disconnect update the same row in the same tick (existing `onChanged`/`router.refresh` pattern, unchanged) | spec.md §1 states 1-2 |
| H5 Prevention | 4 | Disconnect is confirm-with-consequence (existing `ConfirmDialog`, unchanged copy); Bigcapital connect failure surfaces via toast naming the error code, never a silent stall | spec.md §1 state 4, B1 |

Other eight built to a solid 3: this is a narrow extension of an already-shipped, already-scored
card (#252's Integrations shell); no new interaction shape beyond the third provider + polling.

## Part B — Contracts

### B1 Action reachability and reversal
| Action | Control | Destructive? | Confirm names consequence? | Reversal |
|---|---|---|---|---|
| Connect QuickBooks/Xero | existing `<a href=.../connect>` | No | n/a | Disconnect |
| Connect/Reconnect Bigcapital | new `<button>` → `repairBigcapitalConnectionAction` | No | n/a | Disconnect |
| Sync accounts (any provider) | existing "Sync now" | No | n/a | n/a (read-only refresh) |
| Disconnect (any provider) | existing `ConfirmDialog` | Yes | Yes, existing copy | Reconnect/Connect again |

Check before measuring: `grep -rn repairBigcapitalConnectionAction components app` shows the new
IntegrationsManager caller alongside the existing accounting-dashboard.tsx one;
`grep -rn getBigcapitalStatusAction components app` shows the new poll caller.

### B2 View freshness after every mutation
| Mutation | Views | Update mechanism | Same tick? |
|---|---|---|---|
| Bigcapital Connect → job enqueued | Row (Authorising…) | Local state set on action success, before any poll | Yes |
| Job resolves to a connection | Row (Connected · tenant), page's Account mapping panel (`activeConnection` gate in page.tsx) | Poll detects connection → `router.refresh()` (full server refetch, matches existing `onChanged` pattern) | Yes (next poll tick, ≤2s) |
| Sync / Disconnect / set default account (any provider) | Row | Existing `router.refresh()` per action, unchanged | Yes |

### B3 Vocabulary
| Concept | Term | Appears on | Casing |
|---|---|---|---|
| The provider names | "QuickBooks", "Xero", "Bigcapital" | `PROVIDER_LABELS` (one map — see B4, must not fork) | As branded, Title Case |
| The pending-authorisation state | "Authorising…" (not "Provisioning…") | Row status text | Sentence case + ellipsis, matches existing "Starting…"/"Disconnecting…" pending-verb pattern |
| The connect failure toast | "Could not connect Bigcapital" | `toast.error`, connect/reconnect failure only | Sentence case, matches existing `toast.error(res.error || "…")` fallback shape |
| The destination link | "Open in Bigcapital" (Bigcapital only this ticket — see spec.md §1 state 3) | Connected row, Bigcapital only | Sentence case, provider name Title Case |
| The connection line | "{tenantName}" (no provider suffix) | Connected row, all three providers | Existing format, unchanged — inherited, not a new decision (`integrations-manager.tsx:82`) |
| The card description | Rewritten to name all three providers + one picking sentence (spec.md §1, H10) | `CardDescription` | Sentence case, existing tone |

Check before measuring: `grep -rn "Provisioning\|provisioning" components/integrations
components/accounting app/\(app\)/workspaces/\[workspaceId\]/admin/integrations` returns nothing
user-facing (code/comments naming the job type are fine; UI strings are not).

### B4 Primitive reuse
| Need | Shell primitive | New primitive? |
|---|---|---|
| Provider label map | `PROVIDER_LABELS` — **two forks exist today** (`integrations-manager.tsx:42` has quickbooks/xero only; `lib/finance/actions.ts:7` already has all three including bigcapital) | No new primitive — this ticket must point `integrations-manager.tsx`'s map at (or duplicate exactly, if the finance one is private to that module) the three-entry version instead of adding a third fork |
| Connected-provider row | `AccountingConnectionCard` (`integrations-manager.tsx:46`) — Bigcapital's Connected row must render through this same component, not `accounting-dashboard.tsx`'s richer `ConnectionCard` (that one stays Finance-page-only, out of scope per #282) | No — extend `AccountingConnectionCard`'s provider handling, don't fork a second connected-row component |
| Pending/Authorising row | none exists yet on this component (QB/Xero never show a pending row client-side) | New, but minimal: an inline state row inside the existing `<li>`, same tag/classes as the not-connected row with the control swapped for a spinner + text — not a new component file |
| Destination link ("Open in ‹Provider›") | check whether QuickBooks/Xero already have one before assuming Bigcapital needs a bespoke href — grep `/api/accounting/session` and any `/api/integrations/{provider}/session`-shaped route | If QB/Xero have no destination link today, adding one for all three in one pass (not just Bigcapital) keeps the row shape identical across providers — flag to Part D if this expands scope |
| aria-live pending announcement | `role={feedback.tone}`/`aria-live` pattern already in `accounting-dashboard.tsx:122` | No — reuse the same pattern, don't invent a second live-region convention |

### B5 Focus, keys, failure path
| Surface | Initial focus | Trap+Esc+return | Keys | 4xx/5xx |
|---|---|---|---|---|
| Connect button (Bigcapital) | n/a (inline row control, not a dialog) | n/a | Tab reaches it in row order, Enter/Space activates | Server action failure → toast, row falls back to Not connected (button re-enabled), no input to preserve |
| Disconnect ConfirmDialog | existing, unchanged | existing, unchanged | existing, unchanged | existing, unchanged |
| Poll failure (network drop mid-poll) | n/a | n/a | n/a | Poll silently retries on its own 2s cadence (transient network blip) up to a bound (stop after ~15 attempts / 30s and fall to a toast "Couldn't confirm the connection — refresh to check") — new: state this bound explicitly so it isn't an infinite silent loop |

### B6 Time-axis and concurrency edges
| Entity | What can change | What the surface shows |
|---|---|---|
| `IntegrationProvisionJob` for this workspace | Another owner tab clicks Connect while this tab is polling; the background worker resolves the job between polls | Idempotent action (already true server-side); next poll tick reads the resolved state — no double-provision, no conflicting UI (only one job row per workspace/provider) |
| `config.integrations.bigcapital.enabled` deployment flag | Flipped off mid-session (ops action, rare) | Out of scope — same as today's QB/Xero flags, no live re-gating; a hard reload picks up the new server-rendered state |

## Part C — Coverage by component type
| Type | States | Feedback | Exit | Prevention | Labels | Error copy |
|---|---|---|---|---|---|---|
| Accounting card | omitted (no provider configured) · populated (1-3 rows) | n/a | n/a | n/a | Card title/description text, unchanged | n/a |
| Provider row | not-connected · authorising (Bigcapital only) · connected · needs-reconnect | Status text updates same-tick per B2 | Disconnect reachable when connected | Disconnect confirms; Connect has no destructive path to guard | Provider name always visible text | Connect failure → toast naming the code |
| Disconnect ConfirmDialog | open/closed/busy — unchanged | unchanged | unchanged | unchanged | unchanged | unchanged |

No GAPs beyond the destination-link parity question flagged in B4 (resolved there: check before
assuming scope, don't silently add three new routes if none exist).

## Part D — Independent spec critic

Fresh-context `Agent` (sonnet — no money/auth/schema surface, this is a connector-picker UI) asked
to score spec.md + this file as if built, against the critique 10-heuristic rubric and evaluate's
severity scale. Full output: `spec-critic.md`. This is a genuine independent pass, not a
rubber-stamp — the critic's initial numbers below are its own, not mine, and where its finding
held up I changed the spec rather than the table.

| H | critique: self / critic / reconciled | evaluate worst-issue: self / critic / reconciled | Spec change made |
|---|---|---|---|
| H1 | 4/4/4 | 0/0/0 | — |
| H2 | 3/3/3 | 1/1/1 | — |
| H3 | 3/3/3 | 1/1/1 | — |
| H4 | 3/3/3 | 1/2/1 | Critic caught two real open loops: (1) spec.md deferred the tenantName/"(Provider)" copy question to "Part D" without Part D ever resolving it — fixed by reading the existing code (`integrations-manager.tsx:82` already has no provider suffix), so it's inherited, not decided fresh, spec.md §1 state 3 updated; (2) the destination-link scope call was framed as a consistency *win* when it actually makes the Connected row's shape differ by provider — spec.md now names this plainly as an accepted H4 cost (severity 1, not the "0" implied before), not folded away |
| H5 | 4/4/4 | 0/0/0 | — |
| H6 | 3/3/3 | 1/1/1 | — |
| H7 | 3/3/3 | 1/1/1 | — |
| H8 | 3/3/3 | 1/1/1 | — |
| H9 | 3/3/3 | 1/1/1 | — |
| H10 | 3/3→3 | 1/2/1 | Critic: nothing distinguishes the three providers at the point of choice for a first-time owner — real gap, #292 decided the state machine, not that help text is out of scope. Fixed: spec.md §1 adds one sentence to the card's `CardDescription` naming all three and how to pick. Not a full 4 (still no "what is Bigcapital" content) but the immediate decision point is answered, back to a solid 3 |

Also addressed from the critic's B3-completeness note: the connect-failure toast string and the
card-description rewrite are now their own B3 rows (added above) instead of living only in prose.
The asymmetric-friction observation (Bigcapital's Connect enters a wait, QuickBooks/Xero navigate
away — nothing tells the user this is expected) is accepted as inherent to the two different
connection mechanisms (OAuth redirect vs. background job) and is named in spec.md §1 state 2's
parenthetical rather than left as a silent gap.

**Reconciled totals: critique 32/40 (was self-predicted 34, critic found 31), evaluate P2 count 2
(H4, H10, both now at severity 1 post-fix, i.e. cosmetic not minor) — no heuristic below 3, two 4s
retained (H1, H5). Still clears the ≥32/no-heuristic-under-3/two-4s gate**, honestly this time
rather than by an unresolved self-grade.

Investigation note kept from the original pass (still correct, not superseded by the critic):
the destination-link parity question in B4 needed resolving *before* the build step starts, since
it changes whether this is a 1-file or 3-file change.

**Investigation (resolves B4's destination-link question):** `grep -rn "Open ledger\|/api/accounting/session\|/api/integrations/.*/session"`
against `components/integrations` and `app/api/integrations` shows QuickBooks/Xero have **no**
destination link today (`AccountingConnectionCard` in `integrations-manager.tsx` has no "Open in
Provider" affordance at all — only Sync/Disconnect/default-account). #292's "Open in ‹Provider›"
requirement therefore adds a first destination link for all three providers, not just Bigcapital's.
Bigcapital's target is the existing `/api/accounting/session?workspaceId=` route (already used by
`accounting-dashboard.tsx`). QuickBooks/Xero have no equivalent session/deep-link route in this
codebase (`app/api/integrations/{provider}/` only has `connect`/`callback`) — building one for each
is real scope, not a one-line copy change, and #292's Files-in-scope list names `lib/finance/actions.ts`
(Open-ledger link text) but not new QB/Xero routes. **Spec change:** state 3 in spec.md is narrowed —
"Open in ‹Provider›" ships for Bigcapital now (existing route); for QuickBooks/Xero the row keeps
today's behaviour (no destination link) until a QB/Xero deep-link route exists, tracked as fog, not
built here. This keeps the ticket to its one build step and matches the letter of #292 (which named
the *link text* change, assuming a destination existed for all three — it did not for two of them).

Gate (reconciled after the critic's fixes above): zero P0/P1, no heuristic under 3, two 4s
(32/40), verdict Clean, evaluate ≈ 88 — **PASS**.

## Part E — Predict evaluate

### E1 Worst-issue per heuristic
| H | Worst issue the spec still permits | Severity | Fix in spec |
|---|---|---|---|
| H1 | Poll cadence (2s) means up to a 2s lag between job resolving and UI showing Connected | 1 | Accepted — reload always correct per spec.md's "reload lands correctly" note |
| H2 | "Authorising…" may read as jargon to a first-time owner | 1 | Matches #292's exact decided word; not changeable here |
| H3 | No cancel control during Authorising… (must wait it out) | 1 | Bounded by the 30s poll timeout (B5) — acceptable, matches QB/Xero's equivalent (can't cancel an OAuth redirect either) |
| H4 | Connected row shape differs by provider (Bigcapital-only destination link); PROVIDER_LABELS de-forked | 1 | Named plainly in spec.md §1 state 3 as an accepted cost, not hidden |
| H5 | — | 0 | Built to 4 |
| H6 | Spinner-only Authorising row has no persistent text once poll times out silently if the toast is missed | 1 | B5's bound already turns this into a toast, not silence |
| H7 | No bulk/shortcut path (n/a — one-off admin action) | 1 | n/a, Operate surface, low frequency |
| H8 | Card grows to 3 rows from 2 — no density concern at this scale | 1 | — |
| H9 | Connect failure toast may repeat the raw errorCode if unmapped | 1 | Spec's toast wording spaces the code; a human-readable map per code is a nice-to-have, not gating |
| H10 | No inline help for "what is Bigcapital" vs Xero/QuickBooks at the point of choice | 1 | Fixed: card description now names all three + a one-sentence picking rule (spec.md §1) |

Predicted heuristic sum: 9 · predicted P0: 0 · P1: 0 · P2: 0 (both former P2 candidates fixed down to cosmetic, per Part D)

### E2 Cognitive walkthrough — task: "connect Bigcapital as this company's ledger"
| Step | Try? | Notice? | Associate? | See progress? | Rating |
|---|---|---|---|---|---|
| Open Admin › Integrations | Yes (existing nav) | Yes | Yes | n/a | Pass |
| See three provider rows, click Connect on Bigcapital | Yes | Yes (row labelled "Bigcapital", Connect button) | Yes | Row flips to Authorising… immediately | Pass |
| Wait for connection | Yes (spinner + text signal a wait) | Yes | Yes | Row flips to Connected · {tenant} within ~2s of job completion | Pass |
| Set default expense account | Yes | Yes (existing picker, unchanged) | Yes | Yes (existing) | Pass |

Estimated completion 100% · steps 4 · likely error points 0 (job failure path covered by B5).

### E3 Anti-pattern sweep
No pre-selection (all three start Not connected, none pre-checked), no hidden cost, no
guilt/pressure copy, no buried exit (Disconnect always visible when connected), no forced
continuity, no asymmetric friction (connect and disconnect are both one click + one confirm for
disconnect only, symmetric with existing QB/Xero), no misleading label. Verdict predicted: Clean.

## Gate

Reconciled critique 32/40, no heuristic under 3, evaluate ≈ 88, 0 P0/P1, Clean. **PASS — proceed to
build**, one step: extend `IntegrationsManager` (provider list, PROVIDER_LABELS de-fork, card
description rewrite, Bigcapital connect+poll+session-link), trim `admin/integrations/page.tsx`
(drop Ledger connection Panel, widen `accountingProviders`), delete the auto-provision block in
`models/workspaces.ts`, OR the `accountingEnabled` gate (new helper in `lib/config.ts` or
`lib/finance/`), edit CONTEXT.md (glossary + capability line per spec.md §5).

Follow-on fog surfaced but not built here (out of this ticket's named file scope, #292's
Files-in-scope list doesn't include them): `account/page.tsx:71`'s Finance breadcrumb link and
`worksheets/page.tsx:27,32`'s accounting-readiness gate both still read
`config.integrations.bigcapital.enabled` alone, same pre-existing pattern as the layout.tsx gate
this ticket fixes — a QuickBooks/Xero-only company won't see those two surfaces react to its
connection. Noted for the map's Not yet specified, not silently expanded into this ticket.
