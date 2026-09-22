# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary authenticated user is a finance lead or bookkeeper at a small or midsize business who reviews roughly 50–500 documents per month and needs to move extracted work toward a ledger. A secondary user is an accountant managing repeatable workflows for multiple clients. This audience is inferred from the existing product context and Wayfinder map and should be validated with real users.

## Product Purpose

DocuBite turns uploaded PDFs and images into reviewable structured records with visible confidence, source provenance, checks, approvals, and accounting destinations. In the authenticated workspace, people need to find the right typed work queue, review it, and move it toward a ledger without losing the surrounding workspace context.

## Positioning

DocuBite combines document extraction with explainable checks, human review, approvals, close controls, and ledger handoff in one workspace. The product's user-facing information architecture is explicitly typed: Invoices, Purchase Orders, Receipts, and Bank Statements are destinations; Document is the underlying storage and extraction primitive, not a destination.

## Operating Context

Users work inside a persistent workspace shell with a left rail, mobile navigation, typed document queues, document detail views, Worksheets, Finance, Archive, Activity, Health Checks, and Settings. The primary workflow is intake → extraction → review/checks → approval or matching → ledger placement/publish. Legacy routes and bookmarks must continue to land on the correct typed destination where possible.

## Capabilities and Constraints

- The canonical document types already exist in `lib/doc-types.ts`: `invoice`, `purchase_order`, `receipt`, `bank_statement`, and five secondary types.
- The four top-level typed destinations are ordered and grouped as Invoices + Purchase Orders, then Receipts + Bank Statements. Remaining types use the existing Archive destination at `/library`.
- `/bills` is the existing Invoices implementation and retains its aging and payment-run behavior. `/expenses` is absorbed into Receipts as a later row action; this ticket relocates the entry point only and does not change the data model.
- Legacy document detail/table routes must resolve the document type and preserve the existing split-pane detail experience at the typed destination.
- Upload-time type assertion and page-range tagging are out of scope for this work.
- Accessibility is a product constraint: navigation needs semantic links, clear current-page state, visible keyboard focus, and a responsive route that still works at narrow widths.

## Brand Commitments

The existing authenticated workspace visual system is the authority for this extension. Product language follows the typed vocabulary in `CONTEXT.md`; do not reintroduce a generic user-facing Documents destination or invent a second name for Touchless.

## Evidence on Hand

- `CONTEXT.md` defines the authenticated workspace vocabulary and typed destinations.
- `docs/vic-ai-ux-tour-findings.md` and Wayfinder issue 177 record the AP-oriented destination model and the decision to prefer typed destinations over generic Documents.
- Existing route implementations in `app/(app)/workspaces/[workspaceId]` and `components/shell/sidebar.tsx` are the incumbent behavior to preserve unless this ticket explicitly changes it.

## Product Principles

- Use the user's work vocabulary at the point of navigation.
- Keep a typed work item in one obvious destination; avoid duplicate routes to the same queue.
- Preserve origin context and existing records when renaming or redirecting legacy routes.
- Make workflow state and recovery paths legible without implying that AI is infallible.
- Keep the persistent workspace identity visible while users move through immersive detail work.

## Accessibility & Inclusion

Target WCAG 2.2 AA practices already established in the project: semantic landmarks and links, keyboard-visible focus, accessible current-page state, no color-only state communication, and responsive layouts that remain usable at narrow viewports. Dense operator queues must not reduce row controls below the project's target-size constraints.
