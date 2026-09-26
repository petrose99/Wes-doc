---
name: verify-docubite
description: Drive DocuBite's authenticated app locally (Next dev :3000, devdb, in-page Impeccable detector) to prove a rendered-surface change works and record detector counts. Use outside Bite when a ticket or ad-hoc change touches app/** or components/** and needs live verification, screenshots, or before/after counts.
---

# Verify DocuBite

Bite sessions get this from their phase brief; this is the same harness for everyone else.

## Launch

1. `pgrep -af wayfinder-autopilot/run.sh`: if Bite is running, it owns :3000 (one dev server, shared by lanes). Don't start or stop servers. Use doctor, and drive only if it passes.
2. `node .impeccable/live/dev.mjs start af91555d-7450-4b21-a8ac-73db092617c8` starts Next :3000 + live-server :8400, waits for both, preps the workspace. Exit 0 = ready. (`dev.mjs` is gitignored and exists only in the main checkout.)
3. Seed if the surface needs rows: `dev.mjs seed <ws>` (PO mismatch), `dev.mjs seed-billpay <ws> [--reset]`, or `npx tsx --env-file .env scripts/dev/seed-<x>.ts <ws>`.

## Doctor

`node .impeccable/live/dev.mjs doctor`: read-only, one line per check, each failure names its fix. Run it first, and again whenever anything looks off.

## Drive

App base: `http://localhost:3000/workspaces/<ws>`. Install Playwright in the scratchpad (`npm i playwright@1.63`, matching the cached Chromium), run from there.

- One screen: `node <repo>/scripts/dev/detect-in-page.mjs <label> <url> [--click=<sel>] [--shot=<file>] [--widths=1440,390]`
- Several states: a round script on `scripts/wayfinder-autopilot/capture-round.mjs` (usage and probes in its header). Never hand-roll probes or a live-server.
- Per-area seeds, routes and residue: `docs/agents/areas/<area>.md`.

## Evidence

- Gate a round: `node scripts/wayfinder-autopilot/gate.mjs <shots-dir> --baseline <before-dir> --residue-file docs/agents/areas/<area>.md` (exit 0 = clean).
- Record before/after detector counts on the ticket (CLAUDE.md step 6).
- Drive the real user path, not setters. Check side effects (DB row, queue row) as well as the screen.
- Keep shots in `docs/wayfinder-reports/…` or the scratchpad; cleanup never deletes them.

## Cleanup

`dev.mjs stop` only if you started the servers (doctor says whose they are). Never `pkill -f`: it matches your own shell (exit 144).

## Gotchas

- `npm run dev` wipes `.next` under a running server → 500s. Use `dev.mjs start`.
- `curl` says 200 for RSC redirects/404s; verify landing with Playwright.
- After a reboot: `docker start docubite-devdb`, reinstall scratchpad Playwright.
- Stuck at `Compiling /`: stop, clear `.next/dev/cache/turbopack` + `.next/dev/lock`, start.
