// One-shot reconciliation edits from the Part D critic (2026-09-16). Kept for the record.
import fs from "node:fs"
const dir = "docs/wayfinder-reports/226/logs/scratch-261/"
const p = dir + "spec.md"
let s = fs.readFileSync(p, "utf8")
const rep = (a, b) => { if (!s.includes(a)) throw new Error("miss: " + a.slice(0, 50)); s = s.replace(a, b) }
rep("ApprovalCard/MismatchCard (#257) **migrate onto `QueueCard`** via `cards.render` → the migration is a drop-in: same anatomy, they pass their own `subtitle`/`pill` nodes. If the migration costs more than ~30 lines, leave them and record it on the close (B4 P2 risk named up front).",
  "ApprovalCard/MismatchCard (#257) **migrate onto `QueueCard`** via `cards.render` — mandatory, not optional (critic D1): same anatomy, they pass their own `subtitle`/`pill` nodes. After the build `grep -n \"<a href\" components/queue/*.tsx` shows card anchors only inside `queue-card.tsx`.")
rep("PO Mismatches' own `<Link>` stays (it already is one).", "PO Mismatches drops its own `<Link>` and takes the default (critic D2) — one mechanism.")
rep("`Views` placeholder option when none selected; `onChange` navigates exactly as `selectView` does.", "`Views` placeholder option when none selected; `onChange` navigates exactly as `selectView` does; **renders nothing when `views.length === 0`** (critic D6 — a select with one placeholder option explains nothing).")
rep("| `Invoice # · Due ‹date›` + `PoChip` when `po` (#250 input; `Likely PO-2088`, `PO-2088 · 3 mismatches`, `PO removed`) — `phoneRender` on the `number` column; the `po` column has no phone slot (it rides in the subtitle) | State (existing `state` column) |",
  "| `Invoice # · Due ‹date›` (`phoneRender` on the `number` column) | State pill **and** `PoChip` when `po` (#250 input; `Likely PO-2088`, `PO-2088 · 3 mismatches`, `PO removed`) — the `po` column takes `phone: \"pill\"`; the pill line is `flex flex-wrap gap-1.5` so a chip wraps rather than truncates (critic D4: the mismatch count is never the clipped segment) |")
rep("| Supplier | Amount | `PO # · Received ‹date›` |", "| Supplier | Amount | `PO # · Received ‹date›` (document receipt date; the `goods_received` column is relabelled **Goods received** so one word no longer carries two referents — critic D5) |")
rep("- Clear filters (empty state): a `<button>`; after clearing, focus moves to the h1 count? No — it stays on the button's replacement: the list re-renders and the button unmounts, so the handler focuses the **Filters button** (`<md`) or the first facet chip (`≥md`) via a stable id `queue-filters-trigger` / `queue-facets`. B5 row.",
  "- Clear filters (empty state): a `<button>`; the list re-renders and the button unmounts, so the handler focuses, in order, `#queue-filters-trigger` (`<md`), the first chip in `#queue-facets` (`≥md`), else the **queue `<h1>`** (`tabIndex=-1`, stable id `queue-title`) — never body (critic D3). The keyboard probe runs this on a queue with zero facets too. B5 row.")
fs.writeFileSync(p, s)

const q = dir + "preflight.md"
let t = fs.readFileSync(q, "utf8")
const rep2 = (a, b) => { if (!t.includes(a)) throw new Error("miss2: " + a.slice(0, 50)); t = t.replace(a, b) }
rep2("| Clear filters button | — | unmounts on success → handler focuses `#queue-filters-trigger` (`<md`) / `#queue-facets` first chip (`≥md`) | Enter | none |",
  "| Clear filters button | — | unmounts on success → handler focuses `#queue-filters-trigger` (`<md`) → first chip in `#queue-facets` (`≥md`) → `#queue-title` h1 (`tabIndex=-1`) — never body | Enter | none |")
rep2("ApprovalCard/MismatchCard migrate onto it (else recorded P2) |", "ApprovalCard/MismatchCard migrate onto it — mandatory |")
rep2("| H4 | ApprovalCard not migrated → two card markups | 2 | migrate (§1) |", "| H4 | none once migration is mandatory and PO Mismatches takes the default Clear filters | 0 | §1 |")
rep2("| H3 | Clear filters unmounts itself; focus could drop to body | 2→0 with B5 row | B5 |", "| H3 | Clear filters unmounts itself; focus chain ends at the h1, never body | 0 | B5 |")
rep2("Predicted sum ≈ 5–7 · P0 0 · P1 0 · P2 1 (H4 if migration slips) → health ≈ 88.", "Predicted sum ≈ 4 · P0 0 · P1 0 · P2 0 → health ≈ 90.")
rep2("## Part D — Spec critic\n(filled after the critic returns)", `## Part D — Spec critic (sonnet, fresh context, 2026-09-16)

| H | critique: self / critic / reconciled | evaluate worst: self / critic / reconciled | Spec change made |
|---|---|---|---|
| H1 | 4 / 3 / 4 | 1 / 2 / 1 | none — pill lag after a pane mutation is the shipped refresh path (#257/#259 scored it 4); B2 row stands |
| H2 | 3 / 3 / 3 | 1 / 1 / 1 | \`goods_received\` column relabelled **Goods received** (one word, one referent) |
| H3 | 3 / 2 / 3 | 2 / 3 / 0 | Clear-filters focus chain gets a final fallback (\`#queue-title\` h1); probe runs on a zero-facet queue |
| H4 | 3 / 2 / 3 | 0 / 3 / 0 | ApprovalCard/MismatchCard migration made mandatory; PO Mismatches drops its own Link for the default Clear filters |
| H5 | 4 / 4 / 4 | 0 / 0 / 0 | — |
| H6 | 3 / 3 / 3 | 1 / 1 / 1 | View select renders nothing with zero views (was E1 only; now §1) |
| H7 | 3 / 3 / 3 | 1 / 0 / 1 | — |
| H8 | 3 / 2 / 3 | 1 / 2 / 1 | \`PoChip\` moves from the truncating subtitle to the wrapping pill line |
| H9 | 3 / 3 / 3 | 0 / 0 / 0 | — |
| H10 | 3 / 3 / 3 | 0 / 0 / 0 | — |

Gate after reconciliation: predicted critique **32** (H1, H5 at 4; none under 3) · P0 0 · P1 0 · P2 0 · verdict Clean · evaluate ≈ 90. **Gate met.**`)
fs.writeFileSync(q, t)
console.log("ok")
