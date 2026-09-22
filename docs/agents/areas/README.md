# Area primers

One page per surface family, written by the build that shipped it and refreshed by every build that touches it. A session reads the primer for its area at the start of the spec and build phases instead of rediscovering the codebase file by file (#252 read 178 files to learn what one page says). Keep each under ~80 lines: components and primitives, the save grammar, routes, seed and capture recipe, keyboard and state conventions, and the detector residue that is always there. Facts only, no history — that is what the ticket reports are for.

The **Detector residue** section carries its entries twice: prose for the reader, and a ```` ```residue ```` fenced block of regex lines (one per entry, matched against `<type> <selector> <detail>`) that `scripts/wayfinder-autopilot/gate.mjs --residue-file <primer>` and the ticket's round script read, so the deterministic gate and the readers count the same residue. A close session that dismisses a new finding as residue adds its regex here.

| Area | Covers |
|---|---|
| [admin](admin.md) | Admin › Configuration, Approval Flows, PO Mismatch Flows, Users, Companies, Suppliers, Integrations; Account |
| [queue-shell](queue-shell.md) | `QueueScreen` on all six queues: column phone slots → `QueueCard`, Filters button + sheet, `clearFilterParams`, filtered-empty focus hand-off, `viewsPhone`, capture/seed recipe |
| [approvals](approvals.md) | Approvals queue (Invoice approvals · PO mismatches), the `QueueScreen` phone lane (cards, Filter sheet, detail sheet, decision sheets, result strip), phone tab bar |
