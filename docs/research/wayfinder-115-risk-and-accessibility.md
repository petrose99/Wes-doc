# Wayfinder research — risky actions and accessibility standards

Ticket: [04 — Define risky-action and accessibility standards](https://github.com/petrose99/docubite/issues/115)

## Question

What interaction patterns and acceptance criteria should govern risky data and financial actions plus shell accessibility? Decide confirmation/review/undo behavior for deletes, approvals, close actions, and ledger pushes, and define the minimum keyboard, focus, contrast, labeling, target-size, and responsive checks for the authenticated experience.

## Repository evidence

- `components/ui/confirm-dialog.tsx` already provides a portalled `alertdialog` with `aria-labelledby`, `aria-describedby`, `aria-modal`, focus trapping, Escape-to-cancel, body scroll locking, focus return, and busy-state protection.
- `components/ui/dialog.tsx` provides the corresponding non-destructive modal pattern with focus trapping, focus return, Escape, and labelled/described content.
- `components/documents/delete-document-button.tsx` gives a specific irreversible-delete description and a destructive action label, then navigates to the pipeline after success.
- `components/documents/push-to-accounting-card.tsx` currently lets a user push directly to each connected provider; it disables duplicate clicks while the transition runs, reports queued/succeeded/failed status, and offers retry after failure, but has no review/confirmation step or durable preflight summary.
- `components/integrations/integrations-manager.tsx` still uses native `window.confirm` for disconnect, API-key revoke, and webhook deletion, creating an inconsistent accessibility and focus model.
- `components/shell/sidebar.tsx` exposes navigation links, badges, workspace switching, and an immersive-page pulse view. The shell therefore needs checks for visible focus, active/current-page semantics, badge meaning, and overlay/header obstruction across desktop and mobile.

## Primary-source findings

1. WCAG 2.2 SC 3.3.4 applies to financial transactions and to modifying or deleting user-controllable data. At least one safeguard is required: reversible submission, checked input with correction, or review/confirmation before finalization. Source: [W3C Understanding Error Prevention (Legal, Financial, Data)](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data).
2. The WAI-ARIA modal dialog pattern requires focus to move into the dialog, Tab and Shift+Tab to remain within it, Escape to close, and focus to return to the invoking control or a logical successor when that control no longer exists. It also requires an accessible name and `aria-modal="true"`. Source: [W3C APG Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
3. W3C identifies `alertdialog` as the pattern for a modal confirmation or error that interrupts the workflow and requires a response. Source: [W3C APG Alert and Message Dialogs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/).
4. WCAG 2.2 requires keyboard focus to be visible (2.4.7) and not entirely hidden by author-created content (2.4.11). This matters for the fixed shell, sticky mobile controls, toasts, and immersive overlays. Sources: [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible) and [Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum).
5. WCAG 2.2 sets the AA visual baseline at 4.5:1 contrast for normal text, 3:1 for large text, and 3:1 for visual boundaries and states of user-interface components. Color cannot be the only way to convey meaning. Sources: [Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum), [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast), and [Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color).
6. WCAG 2.2 SC 2.5.8 sets a 24 by 24 CSS-pixel minimum pointer target, with spacing and equivalent-control exceptions. Source: [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).
7. WCAG 2.2 SC 1.4.10 requires content to reflow at a 320 CSS-pixel viewport without two-dimensional scrolling except where the content itself requires it, such as a data table. Source: [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow).
8. Nielsen Norman Group recommends confirmations for serious or irreversible consequences, but not for routine actions; dialogs should state the specific consequence and use action labels such as “Delete file” rather than generic “Yes.” It also recommends undo wherever practical. Source: [Confirmation Dialogs Can Prevent User Errors](https://www.nngroup.com/articles/confirmation-dialog/), supported by [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).

## Decision-ready policy

Use a risk-tiered policy rather than confirming every mutation:

- **Routine, reversible edits:** save directly with immediate success feedback and an undo path where the product can safely provide one. Do not interrupt with a confirmation dialog.
- **Destructive or hard-to-reverse data changes:** use a specific `alertdialog` that names the object/count and consequence, offers a non-destructive Cancel action, and uses an action-specific destructive label. Prefer a server-backed undo/recovery window; if none exists, say plainly that the action cannot be undone. For exceptionally broad or irreversible actions, require an intentional typed phrase or equivalent second factor, but reserve this for rare high-severity cases.
- **Approval/rejection and close-period actions:** show the exact scope and resulting state before commit. Require confirmation for bulk approval, rejection with durable downstream effects, period close, or any action that locks or publishes data. Preserve a reviewable audit record and make the next state explicit.
- **Ledger pushes:** provide a preflight summary (provider, count, amount, currency, destination/account, and duplicate/idempotency behavior) before an external financial write. Require an explicit, provider-specific confirmation when the push creates or changes an external record. Keep the push idempotent, surface pending/succeeded/failed/duplicate outcomes per item, and offer a scoped retry without re-pushing successful items.
- **Connection/security changes:** replace native `window.confirm` with the shared dialog so the interaction has the same accessible naming, focus, keyboard, and consequence-copy behavior everywhere.

## Minimum authenticated-shell acceptance bar

- Keyboard-only: every interactive control is reachable in logical order; no positive `tabindex`; modal focus is trapped while open; Escape cancels where cancellation is safe; focus returns to the opener or a logical successor; there is no keyboard-only dead end.
- Focus: every interactive state has a visible focus indicator with sufficient contrast; focused controls are not fully hidden behind the fixed rail, sticky mobile bar, dialogs, or toasts; current navigation uses `aria-current="page"` or an equivalent programmatic state.
- Names and semantics: icon-only buttons have accessible names; controls expose their state (`aria-expanded`, `aria-pressed`, checked, disabled, or busy) when applicable; form inputs have labels; error text is associated with the field; headings and landmarks remain meaningful at mobile widths.
- Feedback: risky outcomes use text plus non-color cues; dynamic status follows the shared status model from ticket 114; failures identify the affected object and next action; no critical result exists only in a transient toast.
- Visual: normal text meets 4.5:1, large text meets 3:1, non-text controls/focus boundaries meet 3:1, and status is not communicated by color alone. Test default, hover, focus, disabled, error, selected, and dark/alternate surfaces where they exist.
- Targets and responsive behavior: pointer targets are at least 24×24 CSS px or have compliant spacing; shell and dialogs work at 320 CSS px without accidental horizontal page scrolling; data tables may scroll within their own region and retain headers/labels.
- Verification matrix: run automated accessibility checks plus manual keyboard and screen-reader passes on desktop and mobile layouts for dashboard, pipeline, document detail, worksheet, finance, settings, delete, approval, close, and push flows.

