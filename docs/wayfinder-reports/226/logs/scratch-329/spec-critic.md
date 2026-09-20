# Independent spec critique — #329 (fold Bigcapital into the connector panel)

Scoring the spec (spec.md) + preflight (preflight.md) as if this were the built surface. This is a
fresh read, not a rubber-stamp of preflight's own Part D (which is a self-graded exercise embedded
in the same document being scored — I've treated its conclusions as claims to verify, not facts).

## 1. Heuristic scores (critique scale, 0-4)

| H | Score | Rationale |
|---|---|---|
| H1 Status visibility | 4 | Connect→Authorising…→Connected fully covered: local optimistic state on action success, 2s poll, `router.refresh()`, bounded to ~30s with an explicit toast fallback so the poll cannot run indefinitely (B5). This is the one place the spec closes a loop I'd normally expect it to leave open. |
| H2 Match real world | 3 | "Authorising…" and provider-named links are honest. No complaint beyond the pre-decided vocabulary (out of scope to re-litigate here). |
| H3 User control/reversal | 3 | Disconnect always reachable when connected; Reconnect symmetric with Connect. No cancel during Authorising…, but that's argued as matching QuickBooks/Xero's own uncancellable OAuth redirect — a fair analogy, not a free pass (a user still can't affirmatively back out of a Bigcapital connect attempt, only wait it out), so it costs a point rather than none. |
| H4 Consistency | 3 | The PROVIDER_LABELS de-fork is a real, correctly-scoped fix. But two things keep this off the preflight's claimed 4 (see §3 below): (a) the tenantName/"(Provider)" copy reconciliation the spec itself flags as needing resolution in Part D is never actually resolved anywhere in preflight.md; (b) the destination link ships for Bigcapital only, producing three rows that are visibly different shapes for what the UI presents as three equal choices. Both are consistency risks the spec identifies and then doesn't close. |
| H5 Error prevention | 4 | Idempotent connect/reconnect action prevents double-provisioning by construction; Disconnect is confirm-with-consequence; Bigcapital failures surface via a named-error toast rather than a silent stall. |
| H6 Recognition not recall | 3 | Provider name always visible as row label; states are self-explanatory without requiring the user to remember prior screens. |
| H7 Flexibility/efficiency | 3 | No shortcuts, but this is a correctly low-frequency admin action; not a real gap. |
| H8 Aesthetic/minimalist | 3 | Card growing from 2 to 3 rows is trivial; no clutter introduced. |
| H9 Error recovery | 3 | Toast names `job.errorCode`; row falls back to a workable Reconnect state. Docked one point because the raw error code may be surfaced un-translated to the user ("spaced" formatting is cosmetic, not a human-readable mapping) — acknowledged in preflight as a "nice-to-have," but for a P1-adjacent recovery path that's underselling it. |
| H10 Help/docs | 2 | Nothing anywhere explains to a first-time owner what Bigcapital *is* or why they'd pick it over QuickBooks/Xero — the three rows are presented as interchangeable buttons with no differentiating information at the point of decision. Preflight dismisses this as "#292's UI, not re-litigated," but #292 decided the *state machine*, not that provider-choice help text is permanently out of scope; folding a third option into a picker without any distinguishing copy is a real recognition/help gap for anyone who isn't already a Bigcapital customer. |

**Total: 31/40** (preflight predicted 34/40; the 3-point gap is the H4 and H10 items above).

## 2. Evaluate worst-issue severities (0-4) and anti-pattern sweep

| H | Worst issue | Severity |
|---|---|---|
| H1 | ≤2s lag between job resolving and UI update if poll ticks late | 0 (explicitly accepted, reload always correct) |
| H2 | none beyond pre-decided wording | 1 |
| H3 | No cancel during Authorising… | 1 |
| H4 | Unresolved tenantName copy reconciliation (spec.md promises Part D resolves it; it doesn't) + Bigcapital-only destination link makes rows structurally asymmetric | **2** |
| H5 | none | 0 |
| H6 | none material | 1 |
| H7 | n/a | 1 |
| H8 | none | 1 |
| H9 | Un-translated error code in toast | 1 |
| H10 | No differentiation help at the moment of provider choice | **2** |

**Predicted P0: 0. Predicted P1: 0. Predicted P2: 2** (H4, H10) — up from preflight's "0-1" P2 estimate.

**Anti-pattern sweep:** No pre-selection, no hidden cost, no guilt copy, no buried exit, no forced
continuity, no misleading label — agree with preflight on all of these. I'd add one item preflight
didn't name: a mild **asymmetric friction** between providers that isn't disclosed to the user —
QuickBooks/Xero's Connect is an immediate navigation (href), Bigcapital's Connect is a button that
enters an indeterminate wait (spinner, up to 30s) before landing anywhere. Nothing in the row
communicates *why* one provider takes longer than the other; a user who has connected QuickBooks
before and now tries Bigcapital has no signal that this is expected. Not disqualifying (it's an
honest reflection of the two different connection mechanisms), but it's asymmetric friction the
spec doesn't message, so I'm not calling it fully resolved either.

## 3. Where I diverge from preflight.md's Part D

Preflight's own "Part D — Independent spec critic" table claims H4 was reconciled to a clean 4
because the PROVIDER_LABELS de-fork "removes the two-map drift." That's true for the *label* map,
but it doesn't touch the two things spec.md itself flagged as open under H4:

- **spec.md line 68** explicitly says the "Connected · {tenantName}" vs "Connected · Acme Ltd
  (Xero)" question should be "flag[ged] as a Part D reconciliation point, see below." Preflight's
  Part D section never returns to this. It resolves a *different* open question (the destination-
  link scope) in detail, but the tenantName question is dropped, not resolved. That's a spec that
  promises its own review will close a loop and then doesn't — the loop is still open going into
  build.
- The destination-link resolution itself (Bigcapital gets "Open in Bigcapital," QuickBooks/Xero
  get nothing, tracked as fog) is a defensible scope call, but it is being scored by preflight as a
  consistency *win* ("keeps the row shape identical across providers" was the goal before the
  investigation; the actual outcome is the opposite — row shape now *differs* across providers).
  Preflight's own gate language undersells this: it's an acceptable scope decision, not a
  consistency improvement, and should be scored as a minor (severity 2) H4 cost, not folded
  silently into a "no new spec text needed" conclusion.

Neither of these is a P0/P1. But both are the kind of thing that should be written into spec.md
directly (not left as an unresolved forward-reference to a document that didn't resolve it) before
a builder starts, because both affect exact copy/row markup that will otherwise be decided ad hoc
mid-build.

## 4. Other genuine gaps checked for and not found

- **Indefinite poll:** fully specified — bounded, with a named toast fallback and cleanup on
  unmount. No gap.
- **B4 primitive reuse for the connected row:** correctly resolved (extend
  `AccountingConnectionCard`, don't fork). No gap.
- **Vocabulary table completeness:** B3 covers provider names, "Authorising…", "Open in
  ‹Provider›", "Connected · {tenantName}" — but does **not** include the Disconnect confirm body
  text change (if any) or the "Could not connect Bigcapital" failure string as a first-class B3
  row; it's mentioned only in spec.md's copy list. Minor completeness gap in the vocabulary table
  itself (B3), not a functional problem.
- **Multi-tab / concurrent connect (B6):** covered, idempotent server-side, no double-provision.
  No gap.

## 5. Verdict

**Not fully Clean.** Predicted 31/40, no heuristic below 2, 0 P0, 0 P1, 2 P2s (H4, H10). This is a
narrow, well-bounded ticket and the polling/timeout/idempotency work is genuinely done to a 4 — but
it should not be waved through as "PASS, one step" without closing the two loops above first.

**Single most important thing to change before code:** resolve the tenantName/"(Provider)" copy
question that spec.md itself defers to Part D — write the actual decided string into spec.md now
(not "flagged for Part D," actually decided), since it affects existing QuickBooks/Xero row copy,
not just the new Bigcapital row, and leaving it open means a builder decides live-user-facing copy
unreviewed mid-implementation.
