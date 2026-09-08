# DocuBite inbound email — Cloudflare Email Routing worker

Lets users email documents into a workspace. Cloudflare Email Routing receives mail for
`inbound.docubite.com` and hands the raw MIME message to this worker; the worker parses it and
forwards it to the app's existing `/api/inbound-email` route (already built, tested against
fixtures, and gated dark until `EMAIL_INBOUND_SECRET` is set — see that route's file comment and
`HANDOFF-PHASES-1-2-ROADMAP.md`, WP13).

No app code changes are required for this — the worker just reshapes MIME into the Postmark
webhook JSON shape the route already parses.

## One-time setup

1. **DNS**: add `inbound.docubite.com` (or whatever `EMAIL_INBOUND_DOMAIN` is set to) as a zone/
   subdomain on Cloudflare, or use an existing Cloudflare-managed zone. Cloudflare Email Routing
   needs to own the MX/TXT/DKIM records for that domain — enable Email Routing for the zone in the
   dashboard (Email → Email Routing) and let it write those records.

2. **Deploy the worker**:
   ```
   cd infra/cloudflare-email-worker
   npm install
   npx wrangler login
   npx wrangler secret put APP_INBOUND_SECRET   # paste the same value as the app's EMAIL_INBOUND_SECRET
   npx wrangler deploy
   ```
   Set `APP_INBOUND_URL` in `wrangler.toml` (or via `--var`) to the deployed app's
   `/api/inbound-email` URL if it isn't `https://app.docubite.com/api/inbound-email`.

3. **Route mail to the worker**: in the Cloudflare dashboard, Email → Email Routing → Routing
   rules, add a **Catch-all address** (or a rule for `*@inbound.docubite.com`) with action
   "Send to a Worker" → `docubite-email-worker`. A catch-all is correct here: the actual routing
   decision (which workspace) happens inside the app via the per-workspace token in the local part
   of the address, e.g. `abc123token@inbound.docubite.com` — see `models/inbound-email.ts`'s
   `ensureInboundEmailToken` / `resolveWorkspaceByInboundToken`.

4. **Configure the app**: set `EMAIL_INBOUND_SECRET` (same value as step 2) and, if not using the
   default, `EMAIL_INBOUND_DOMAIN` in the app's environment. Setting `EMAIL_INBOUND_SECRET` is
   what flips `config.inboundEmail.enabled` on — the route 503s until then (`lib/config.ts`).

5. Each workspace's inbound address is shown at Settings → Email
   (`app/(app)/workspaces/[workspaceId]/(chrome)/settings/email/page.tsx`), generated lazily by
   `ensureInboundEmailToken`. Only non-healthcare workspaces get one — email is deliberately not an
   allowed channel for clinical data.

## What the worker does per message

1. Reads `message.raw` (the full MIME stream) and parses it with `postal-mime`.
2. Builds a Postmark-shaped JSON payload (`To`/`From`/`Subject`/`TextBody`/`HtmlBody`/
   `Attachments[]` with base64 `Content`), using the Email-Routing-resolved envelope `to`/`from`
   rather than the MIME headers (harder to spoof).
3. POSTs it to `APP_INBOUND_URL` with `Authorization: Bearer <APP_INBOUND_SECRET>`.
4. On a `404` (unknown/mistyped token) or `403` (sender not on the workspace's allowlist) response
   from the app, calls `message.setReject(...)` so the sender gets a bounce they can act on.
   Any other failure is swallowed rather than bounced, since it may be transient on the app side.

## Local testing

`npx wrangler dev --test-scheduled` doesn't cover the `email()` handler directly; the practical
way to test end-to-end is to deploy to a Cloudflare zone (even a throwaway one) with Email Routing
enabled and send a real message, or to unit-test the MIME → Postmark-shape reshaping in isolation
(the app side already has full fixture coverage in `app/api/inbound-email/route.test.ts`).
