---
target: "Exceptions queue as the Invoices → Exceptions hand-off — journey evidence for #239, map #226"
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:/home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/(queue)/exceptions/page.tsx"
target_fingerprint: "sha256:71ae7b29cd0059136dfd7997eecb979340c5f73fecc8c5363f1815fd1a7b530e"
target_path: /home/ubuntu/Dev/Wes-doc/app/(app)/workspaces/[workspaceId]/(queue)/exceptions/page.tsx
timestamp: 2026-09-15T22-25-51Z
slug: ces-workspaceid-queue-exceptions-page-tsx-980fcfc1
---
Method: dual-agent (A: general-purpose design-review subagent, Playwright screenshots at 1440/390 — list, row open, Checks tab, Resolve menu, False-positive dialog, 2 seeded rows · B: general-purpose detector subagent — static `impeccable detect --json` + in-page `detect.js` via headless Chromium against the running dev server, list and pane-open at both widths). Mode: Operate. Journey evidence for #239 (map #226): scored as the Invoices → Exceptions → back-to-invoice hand-off, not as a standalone screen.

## Design Health Score — 24/40

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Checks tab says "No open checks on this document." on an escalated check (ChecksTab reads `gates`, not escalations; `split-pane.tsx:131`); stage strip "Checks" neutral while Invoices row says "Needs attention · 1" |
| 2 | Match System / Real World | 2 | "In review" = escalation claimed (`exception-queue.tsx:69`) vs document processing state (`row-cells.tsx:55`); Acme Corp is "Open" here, "In review" on Invoices; row subtitle is the literal word "Document" (`:62`) |
| 3 | User Control and Freedom | 2 | No way back to the invoice row; only "Open document in a new tab" (`:123`); after Resolve the row drops, the pane vanishes, URL stays `/exceptions/<id>` (`:131` never `syncUrl(null)`) |
| 4 | Consistency and Standards | 2 | Amount "—" for TechSupply here (`:65`), "$1,380" on Invoices; Check message repeated in row, pane subtitle and row aria-label (`queue-screen.tsx:272`) |
| 5 | Error Prevention | 3 | Reason required (good); Resolve offered on an unclaimed Open row contradicting "Start the review to claim it" (`:106–112`); red Delete in the pane toolbar |
| 6 | Recognition Rather Than Recall | 1 | Row carries no invoice number, due/overdue state or anchored field (`models/exceptions.ts:13–28`); Details tab flags Subtotal for a duplicate-supplier check |
| 7 | Flexibility and Efficiency | 3 | ↑/↓/Esc, deep link, focus return (`queue-screen.tsx:139–150`); no Resolve shortcut, no resolve-and-next |
| 8 | Aesthetic and Minimalist | 3 | Four stacked status statements in the pane; hover-expanded rail overlays the Document column at 1440 |
| 9 | Error Recovery | 3 | Pane load/missing/error/boundary states exist (`detail-pane.tsx:94–108`) |
| 10 | Help and Documentation | 3 | Resolution options carry one-line consequences and tailored placeholders (`:17–21`); empty state explains how rows arrive |

## Design Specificity Verdict
Generic. Shared QueueScreen with a different column set; the one specific idea — a row is a check, not a document — lives in a code comment (`exception-queue.tsx:42–45`), not on the surface.

## Detector evidence (Assessment B)
Static: 0. In-page list: 9 @1440 (3 real: `text-occlusion` ×3 — th "Document" and row-1 title/subtitle under the hover-expanded rail, plus title/subtitle intra-cell overlap) · 5 @390 (0 real). Pane open: 6 @1440 (1 real: `cramped-padding` on the list column `queue-screen.tsx:237`) · 9 @390 (4 real: `clipped-overflow-container` ×4 in `detail-pane.tsx:93` and the split-pane's preview/fields stack). Baseline false positives: brand-emerald `ai-color-palette` ×2, Inter `overused-font`, `layout-transition` + `dark-glow` on body (dev indicator), switcher `truncate`.

## What's Working
- Resolve▾: three honest options with consequences, required reason, no silent close.
- Pane frame grammar: ↑/↓, "1 of 2", Esc, focus return, mobile back-arrow sheet.
- Rail badge matches the title count; "Needs attention" toggle exists on Invoices.
- Skeleton + error boundary keep the queue usable when the pane fails.

## Priority Issues
- **P0** Checks tab contradicts the row: "No open checks" on an escalated check.
- **P0** No way back to the invoice or to Invoices with origin context (CONTEXT.md "Origin context"); new-tab route's own Back goes to `/pipeline`.
- **P1** Row lacks invoice identity (number, due state, amount "—").
- **P1** "In review" collision across the two queues.
- **P1** Stale URL after resolve.
- **P2** Mobile toolbar: "Open — view review task" wraps to four lines, Delete overflows, footer under the avatar bubble.
- **P2** Destructive Delete in the exception pane; Resolve offered before claim.

## Persona Red Flags (bookkeeper, 50–500 docs/month)
- Resolves "Corrected" without correcting: Details does not point at the failing field and Checks says none are open.
- Loses the invoice after resolving; with 40 open invoices must find it again from memory.
- Misreads "In review" as "someone is reviewing the invoice" and skips it.
- Trusts "—" as "no amount".

## Hand-off defects (journey evidence)
- Carried from Invoices: invoice number, amount, due/overdue, anchored field, the "Needs attention · 1" pill, the filter/sort she was on.
- Same question answered six ways, two disagreeing: Invoices pill ↔ Exceptions row status ↔ stage strip ↔ Checks tab ↔ Details flag ↔ footer.
- Missing way back: no link to the invoice row, no origin restore, no post-resolve destination.

## Questions to Consider
- Does Exceptions stay a destination once the Checks tab resolves in place on every queue (Q4 on #239)?
