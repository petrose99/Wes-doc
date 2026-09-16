# Project lessons — petrose99/docubite

What first passes missed *in this codebase* (its shell, tokens, components, seed data, dev-server recipe). Generic, product-agnostic lessons go to the tool's own lessons.md instead.

- (#250, #251) App-wide detector residue on every surface: workspace-switcher avatar palette ×2, Inter flagged as overused-font, Next dev overlay ×2 on `body` (`layout-transition`, `dark-glow`). → Report as residue; belongs to a shell ticket.
- (#250) The seeded dev workspace has no PO matches / line items unless the seed script is extended. → Extend the seed before live verification.
- (#250) Live checks need the dev server on :3000 with `DEV_AUTH_BYPASS`, and the in-page detector runner copied into a scratch folder (it resolves playwright from its own location).
- (#229–#252) `impeccable context` launcher needs an interactive approval and fails unattended; every session tried it. → Don't attempt it; read `PRODUCT.md` directly, as the skill's fallback prescribes.
- (#250–#252) Full vitest suite (2,500+ tests) ran up to 9 times per ticket. → Affected files only during batches; full suite once at close.
