# Autopilot lessons (generic — travel with the tool to every project)

Product-agnostic only; codebase specifics go to the project's `.claude/wayfinder-autopilot/lessons.md`. Read in full before the pre-build pass on every execution ticket. Append at
close: one line per correction the fix loop had to make that the pre-build
should have caught. Format: `- (#ticket, heuristic) what was missed → what to
do at spec time`. Keep it under ~80 lines: when two lines say the same thing,
merge them and generalise. This file is the loop's memory; a lesson that is
not written here will be relearned at full cost.

## Pre-build (what the spec must already contain)

- (docubite #250, H1 status) Loading, empty and zero-result states were added after the first critique. → `fortify` state inventory is written into the spec per component before code; every list, pane and popover names its empty/loading/error rendering.
- (docubite #250, H3 control) Reject/Replace put the invoice into send-back state without saying so up front. → Any action with a side effect on another entity's state has that consequence in its confirmation copy at `articulate` time.
- (docubite #250, H6 recognition) Popover sat on top of its anchor until measured offsets were added. → Floating surfaces (popover, sheet, tooltip) specify anchor, offset and viewport-edge behaviour in the spec; measure with the screenshot at both widths in the first inspection.
- (docubite #250, H8 minimalism) The Purchase Orders column count did not equal the ≠ glyphs the pane showed. → When a number on a row summarises something in the pane, the spec states the single function both read from; never two computations.
- (docubite #250, H4 consistency) Deep-link hops lost their origin until `from=` was added to every one. → Every navigation the surface introduces carries origin context (`from=`) by construction; list them in the spec.
- (docubite #251, H1/H4) First evaluate was 68 with four P1s: the same pattern — states and consequences designed in the fix loop. → Do steps 1–3 of the pre-build pass fully; loading the skills is not doing them.

## Grilling (what a decision ticket must establish before its first round)

- (docubite #248, H4 consistency) A fact word on the incumbent was derived from a different record than its name implied ("Synced" came from the push row, not the ledger sync). → Before deciding vocabulary, trace every fact word on the surface to the query that produces it; the word follows the record.
- (docubite #248, H9 recovery) A surface deleted earlier left its feeders alive: a task type still created that nothing rendered, a component unmounted but present. → When a ticket replaces or shrinks a surface, grep for every producer of the rows it showed and every importer of its components; orphans go on the sign-off ticket by name.
- (docubite #248, H5 error prevention) Row-level and system-level failures were one bucket on the incumbent (a connection outage would have marked every row). → Split failure classes in the spec: what the row can fix marks the row; what only an admin can fix is said once, above the list, while work waits.

## Build

- (docubite #250) Three detector batches were needed because the first screenshots were only taken after the whole surface was built. → Screenshot each new component at 1440 and 390 as it lands, not only at the end; the hook catches static findings, the overlay catches layout ones.
- (docubite #250) Static `impeccable detect` was skipped; the in-page overlay found everything. → In-page overlay is the source of truth; run it per state (list, pane-open, dialog-open, sheet-open), not once.

## Scoring

- (any) Some detector findings are app-wide residue (shell chrome, dev overlay, brand font) and show on every surface. → Name the residue once in the project lessons file; report it as residue; never spend a batch on it inside a feature ticket.
