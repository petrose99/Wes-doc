# Area primers

One page per surface family, written by the build that shipped it and refreshed by every build that touches it. A session reads the primer for its area at the start of the spec and build phases instead of rediscovering the codebase file by file (#252 read 178 files to learn what one page says). Keep each under ~80 lines: components and primitives, the save grammar, routes, seed and capture recipe, keyboard and state conventions, and the detector residue that is always there. Facts only, no history — that is what the ticket reports are for.

| Area | Covers |
|---|---|
| [admin](admin.md) | Admin › Configuration, Approval Flows, PO Mismatch Flows, Users, Companies, Suppliers, Integrations; Account |
