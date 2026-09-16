# Project lessons — petrose99/docubite

What first passes missed *in this codebase* (its shell, tokens, components, seed data, dev-server recipe). Generic, product-agnostic lessons go to the tool's own lessons.md instead.

- (#250, #251) App-wide detector residue on every surface: workspace-switcher avatar palette ×2, Inter flagged as overused-font, Next dev overlay ×2 on `body` (`layout-transition`, `dark-glow`). → Report as residue; belongs to a shell ticket.
- (#250) The seeded dev workspace has no PO matches / line items unless the seed script is extended. → Extend the seed before live verification.
- (#250) Live checks need the dev server on :3000 with `DEV_AUTH_BYPASS`, and the in-page detector runner copied into a scratch folder (it resolves playwright from its own location).
- (#229–#252) `impeccable context` launcher needs an interactive approval and fails unattended; every session tried it. → Don't attempt it; read `PRODUCT.md` directly, as the skill's fallback prescribes.
- (#250–#252) Full vitest suite (2,500+ tests) ran up to 9 times per ticket. → Affected files only during batches; full suite once at close.
- (#252) `tsc`, `eslint` and `next dev` cannot share this 8 GB box: with the dev server up, `tsc --noEmit` ran over an hour swapping. → Stop the dev server (`node .impeccable/live/dev.mjs stop`) before tsc/eslint/vitest/build; restart it for captures. A restart is a cold Turbopack compile (~90 s for the first Admin route; Playwright's 180 s timeout tripped on `report`) — warm routes with `.impeccable/live/probe252.mjs` before a capture.
- (#252) The legacy Settings/Controls forms (jurisdiction picker, deferred-VAT picker, category-nature rows, workspace rename) each carried their own save model; folding a page into Admin means rewriting its forms onto `AdminSaveBar`, not moving them. Still on their own model outside Admin's Configuration: Suppliers rules and the members-table role select — check on #253/#254.
- (#252) The shared `ConfirmDialog` footer had a grey fill the in-page detector read as `nested-cards` in every dialog-open state (removed on #252). Admin's residue is the app-wide five plus `text-overflow` on the expanded rail's truncated workspace name (shell).
- (#252) The scratch Playwright lives in `/tmp/scratch229`; `cp`/`cd`/`diff` there are blocked by the sandbox — copy scripts with `node -e "fs.copyFileSync(...)"` and run them by absolute path.
