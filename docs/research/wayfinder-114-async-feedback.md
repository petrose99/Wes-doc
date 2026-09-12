# Wayfinder research — async feedback and recovery states

Ticket: [03 — Define async feedback and recovery states](https://github.com/petrose99/docubite/issues/114)

## Question

What shared state and feedback model should users see for uploads, extraction, syncing, review assignment, worksheet placement, and accounting pushes? Define progress, partial success, retry, cancellation, stale data, failure explanation, and accessible status announcements.

## Repository evidence

- `components/extract/use-extraction-progress.ts` polls tracked documents every 2.5 seconds, pauses while the tab is hidden, stops when work settles, and refreshes surrounding route data after a terminal transition.
- Extraction currently announces success, needs-review, and failure with Sonner toasts. Poll errors are intentionally silent and retried on the next tick.
- `components/health/sync-ledger-button.tsx` disables the trigger while syncing, changes the label to `Syncing…`, and reports only a terminal success or error toast.
- `components/workspace/review-inbox.tsx` already uses optimistic status changes with rollback on failure and toasts for outcomes; this is a useful local precedent for mutation feedback.
- `components/ui/sonner.tsx` mounts one app-wide Sonner instance, so transient notifications are available across authenticated routes but are not sufficient as the only durable record of long-running or partially successful work.

## Primary-source findings

1. WCAG 2.2 Success Criterion 4.1.3 requires status messages to be programmatically determinable and presented to assistive technology without moving focus. Dynamic success, waiting, progress, and error messages therefore need an explicit status mechanism, not only visual changes or a toast implementation that may not expose a live region. Source: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [Understanding Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages).
2. WAI-ARIA defines `status` as a polite live region for advisory updates, `alert` as an assertive live region for important time-sensitive messages, and `progressbar` for long-running work. A known progress value should expose `aria-valuenow`; an indeterminate operation should omit it. A region being populated can use `aria-busy` while the work is active. Source: [WAI-ARIA Roles Model](https://www.w3.org/TR/wai-aria-1.2/#status).
3. W3C's alert guidance says alerts should not move keyboard focus and should not disappear too quickly; an interruptive `alertdialog` is the pattern when the user must stop and respond. Source: [WAI-ARIA APG Alert Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/).
4. Nielsen Norman Group recommends communicating completed work plus remaining steps or time for waits over roughly ten seconds, making progress discoverable, allowing long work to continue in the background, and making completion feedback salient when the user returns. Source: [Designing for Long Waits and Interruptions](https://www.nngroup.com/articles/designing-for-waits-and-interruptions/) and [Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/).
5. Nielsen Norman Group's error-message guidance recommends highly visible, constructive messages that explain the problem and a recovery path, while distinguishing critical blockers from informational updates. Source: [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/).

## Decision-ready model

Represent every async operation with a shared lifecycle:

`queued → running → succeeded | partially_succeeded | failed | canceled`

Each operation should expose a stable user-facing record containing the subject, current step, counts or progress when known, started/updated time, whether data is stale, a plain-language outcome, and the next action. Keep this record visible in the initiating surface and in a compact activity/status area so navigating away does not erase the operation's outcome.

- For known work, show completed/total progress and current step. For unknown work, show an indeterminate progressbar plus the current step and a clear statement that the duration is unknown.
- For batches, preserve per-item results and distinguish succeeded, needs-review, skipped, canceled, and failed items. Never collapse a mixed result into a single success or failure.
- Offer cancel only where the operation can safely stop; label it as canceling until the server confirms cancellation. Do not imply cancellation succeeded merely because the user clicked.
- Make retry explicit and scoped: retry only failed or canceled items when safe, preserve successful results, and state whether retry is idempotent or may create duplicates.
- When source data or a view is stale, say what is stale, what action refreshes it, and whether the user's local edits are safe. Do not silently overwrite an in-progress edit with a refresh.
- Error copy should state what failed, identify the affected item or stage, give the next action, and provide a support/reference identifier when useful. Keep technical details available behind disclosure rather than replacing the recovery path with an error code.
- Use `role=status`/polite announcements for ordinary queued, progress, success, and partial-success updates; reserve `role=alert` for actionable failures and warnings that need attention. Keep announcements concise and deduplicated. Use an actual `progressbar` for measurable progress and do not move focus for routine updates.
- Toasts remain useful as a prompt, but durable outcomes belong in the page or activity record. A toast should link or point to the detailed result for long-running, batch, partial, or failed work and should remain available long enough to be discovered.

## Acceptance bar for the authenticated workflows

- Upload/extraction: shows queued/running state, current step, batch counts, per-document terminal outcome, needs-review state, retry for failed items, and a durable result after the overlay closes.
- Sync/publish: disables duplicate submission, exposes running state, keeps the user informed if work continues in the background, reports partial success by item, and provides a safe retry or reconciliation action.
- Review assignment and worksheet placement: confirms the mutation, rolls back optimistic UI on failure, preserves the user's selection/context, and identifies stale data when a concurrent change invalidates the view.
- Every dynamic update is available to screen readers without focus theft; failures are understandable by color-independent visual and textual cues.

