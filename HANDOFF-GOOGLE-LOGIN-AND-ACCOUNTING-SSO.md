# Handoff — Google sign-in, worker queues, Bigcapital provisioning

Session of 2026-09-08. Everything below is deployed to production (`docubite.app`, Lightsail
`16.60.212.8`, repo at `~/docubite`). Local master and the VPS are both at `6fda064`.

## Where to pick up

Items 1-3 are fixed, deployed and confirmed in production. Item 4 is unchanged — it is the
only thing still open, and the PAT rotation there needs a human.

### 1. "Open accounting" login loop — FIXED (`caca601`)

The bridge was handing the session to the SPA in the wrong place. Reading the shipped
`bigcapitalhq/webapp:latest` bundle settled it: the authentication slice is persisted with
`whitelist: []`, so redux-persist writes and rehydrates nothing but `_persist` — the localStorage
key the bridge wrote was inert. The slice's initial state comes from **cookies**:

```js
initialState = {
  token: getCookie("token"), organizationId: getCookie("organization_id"),
  userId: getCookie("authenticated_user_id"), locale: getCookie("locale"), ...
}
isAuthenticated = (s) => !!s.authentication.token
```

and the SPA's own login page (in the `queries-*.js` chunk, not `index-*.js`, which is why a first
grep of the main bundle found nothing writing them) sets exactly `token`,
`authenticated_user_id`, `organization_id`, `tenant_id` from the snake_case `/api/auth/signin`
body, at `path=/`, for 1 day (30 with "remember me").

So `auth-bridge.html` now writes those four cookies, `signIn()` carries `user_id`/`tenant_id`
through for it, and `lib/integrations/bigcapital/auth-bridge.test.ts` pins the names by running
the shipped file's own script.

**Not verified by a click-through** — the Chrome extension was not connected in that session. If
"Open accounting" still loops, check in DevTools on `books.docubite.app` that a `token` cookie
exists after the bridge runs; if it does and the SPA still bounces, the token itself is being
rejected (watch the first `/api/` call for a 401), which is a different bug.

### 2. Vendor name in the accounting tab title — FIXED (`2300dfa`)

`bigcapital/nginx.conf` rewrites `<title>Bigcapital</title>` → `<title>Accounting</title>`.
Verified: `curl https://books.docubite.app/` serves the new title. Note the image is pinned to
`latest`, so both this filter and the cookie names above can move under us on a pull.

### 3. Ledger sync never worked — FIXED (`fcf615a`, `751deb4`, `578de1a`)

Three stacked faults, all invisible because the drain logs one line per failure and carries on.
Worth reading before touching `syncDueLedgerConnections`, because two of the three are the same
mistake in different clothes: **"due" is derived from the newest `LedgerTransaction.syncedAt`, and
that timestamp is absent in more cases than it looks.**

1. `syncLedgerTransactions`'s soft-retire `updateMany` filtered only by `connectionId`. The scope
   guard threw, the whole `$transaction` rolled back, no row ever got a `syncedAt`. Same class as
   `145b06f`.
2. A failed sync writes nothing, so it was due again on the next tick — seconds later. Both
   connections refetched every bill, expense and invoice roughly every five seconds, around the
   clock, until Bigcapital's throttler answered 429, which then sustained itself.
3. With the backoff in, syncs started succeeding — and immediately storming again, because these
   organizations have no transactions yet. A successful sync of an empty ledger writes zero rows,
   so there is still no `syncedAt` to age, so it was still permanently due.

A failure now backs off 5 minutes doubling to 6 hours; a success waits out the same staleness
window (1h for bigcapital) whether or not it wrote anything. Confirmed in production: provider
traffic went from ~99 calls/minute to 0, and the worker logs a single
`Synced ledger connections 3` then goes quiet.

### 4. Smaller loose ends

- **Rotate the GitHub PAT.** The VPS git remote embeds a token in the URL
  (`https://github_pat_…@github.com/petrose99/docubite.git`) and it was printed into a session
  transcript. Revoke it, switch the remote to SSH or a credential helper.
- **`/.env` probes return 500, not 404.** Logs show repeated
  `invalid input syntax for type uuid: ".env"` from `prisma.documentFile.findUnique()` — a bot
  probing `/.env` reaches Prisma with an unvalidated path segment. Harmless today, but it should
  be a 404.
- **`docType` missing from the generated Prisma client.** It exists in `prisma/schema.prisma:314`
  but not in `prisma/client`, so `review-actions.ts:100` fails typecheck and
  `lib/finance/actions.test.ts` fails. Pre-existing, unrelated to this session's work.
  `npm run db:generate` should clear it.

## Accounting, second pass — all fixed and deployed

Everything below was found by following the first fix through, not from the original list. Fixing
the SSO let people into the SPA for the first time, and everything downstream of it turned out to
be broken too.

| Commit | What |
|---|---|
| `003cc85` | The skin locked the tab up. `classList.remove()` inside a MutationObserver on the class attribute re-triggers itself forever — see the gotcha below |
| `2ab35cf` | Vendor branding on the way in: bare white bridge page, vendor wordmark on the boot splash, vendor favicon. `bigcapital/docubite-mark.svg` plus a bridge that matches the splash it hands over to |
| `b5ba55e` | The two remaining flashes. Dark-theme flash (the bundle picks its theme before React mounts, so the pin has to be an inline `<head>` script, not `docubite-theme.js`); and the white gap while 2.5MB of bundle evaluates and `#root` is still empty, now covered by `#root:empty` |
| `9e9678b` | `/socket/` had no proxy rule and fell through to `try_files`, so socket.io's handshake was answered with index.html. It had never once connected |
| `6fda064` | "Back to DocuBite" pointed at `localhost:7331`: the route built its URLs from `req.url`, which behind Caddy is the container's own address. Now `config.app.baseURL`, like every other outbound URL in the app |

## What was done in the session before that

Commits, oldest first — all on `master`, all deployed:

| Commit | What |
|---|---|
| `e963c9b` | Google sign-in moved from the Supabase redirect flow to Google Identity Services + `signInWithIdToken`, so Google Cloud holds a JS origin and no redirect URI, and `supabase.co` never appears during sign-in |
| `478565d` | GIS script loader given a timeout — a network that black-holes `accounts.google.com` fires no `error` event, so the button shimmered forever |
| `d1056df` | FedCM enabled (`use_fedcm_for_prompt` + `use_fedcm_for_button`); load timeout 10s → 25s |
| `1afe852` | `LSL — Lesotho Loti` added to the base-currency picker |
| `145b06f` | Two worker faults: `processNextQueuedDocumentJob` wrapped in `unscoped()`; worker now drains provisioning, integration pushes, reminders, ledger sync and health checks |
| `c6e0733` | `sendDueReminders()` returns an object, always truthy — the loop never slept |
| `1927347` | `workspaceId` threaded through `getLastSyncedAt`, `getEntityCounts`, `getCategoryAccountMap` |

### Google sign-in — configuration outside the repo

- **Google Cloud project `docubite`** (new, created this session). Consent screen: app name
  **DocuBite**, External, **In production** (published). OAuth client **DocuBite web** with
  Authorized JavaScript origins `http://localhost:7331` and `https://docubite.app`, and
  **no redirect URIs** — the GIS flow does not use one.
- **Supabase project `dnjtvsgndwdbenmysmww`** — Google provider enabled, client ID in both
  *Client ID* and *Authorized Client IDs*. **No client secret is needed**: the ID-token flow does
  no code exchange. Verified via `/auth/v1/settings` → `"google": true`.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is inlined at **build** time — it is a build arg in
  `Dockerfile.web` and `docker-compose.prod.yml`. A restart alone will not pick up a change.
- The `.env` previously pointed at a dead Supabase project (`labppihxjfsshvjhxfzx`); it now points
  at `dnjtvsgndwdbenmysmww`, matching production.

### Why provisioning hung forever — three stacked faults

Worth reading before touching the worker again:

1. `processNextQueuedDocumentJob` reclaims leases across all workspaces but lacked `unscoped()`.
   It is the **first** call in the worker loop, so every tick died there. Document processing was
   broken too; the only trace was `Job worker failed …ran without a workspaceId filter` repeating.
2. Provisioning, integration pushes, reminders, ledger sync and health checks run **only** from
   `app/api/internal/jobs/process`, which expects a scheduler to call it. This box has none — no
   crontab, no platform cron — so none had ever run. The row sat `pending / attempts=0`.
3. Bigcapital's system database had **zero tables** (`Table 'bigcapital.IMPORTS' doesn't exist`), so
   every org build returned HTTP 500. Fixed by running the migration inside the server container:

   ```bash
   bash scripts/vps-ssh.sh 'timeout 180 docker exec -w /app/packages/server docubite-bigcapital-server-1 node dist/cli.js system:migrate:latest'
   ```

   0 → 17 tables. `system:seed:latest` reports "No operation performed" (tenant seeds run at org
   creation). **The CLI never exits** — always wrap it in `timeout`, or it hangs the caller.

## Gotchas that cost time

- **A `git pull` deploys nothing under `bigcapital/`.** Those are single-FILE bind mounts, which
  bind an inode. `git pull` replaces a changed file by rename, so the container keeps serving the
  old contents — the host file looks right and the running app disagrees. Restart
  `bigcapital-webapp` after every skin change; `up -d` if a mount was added.
- **Never call `classList.remove()` unguarded inside a MutationObserver.** It writes the class
  attribute even when the token was already absent, and an attribute write queues a mutation record
  whether or not the value changed — so the observer re-triggers itself forever and Chrome puts up
  "page isn't responding". `docubite-theme.js` did exactly this and locked the accounting tab up
  the moment the SSO fix let anyone reach it (`003cc85`).

- **Local is not a proxy for production here.** `BIGCAPITAL_ENABLED=true` exists only in
  `.env.production` — locally Bigcapital is off entirely. Both set
  `DOCUMENT_INLINE_PROCESSING=true`, so documents process in-request and the job worker is never
  run locally. Anything touching accounting or queued jobs is effectively untested until it runs on
  the VPS.
- **The Accounting page's `WorkspaceScopeError` was latent, not a regression.** It sits behind
  `connection ? … : [null, …]`, and a connection can only exist once provisioning succeeds —
  which had never happened anywhere. Fixing provisioning is what made the line reachable.
- **`npx tsc` OOMs at the default heap.** `tsconfig.json`'s `include: ["**/*.ts"]` sweeps in the
  four full repo copies under `.claude/worktrees/`. Use a temporary config excluding
  `.claude/**` plus `NODE_OPTIONS=--max-old-space-size=5120`.
- **`lib/finance/actions.test.ts` fails on a clean tree.** 1833/1834 pass; that one is
  pre-existing (verified by stashing). Do not chase it as a regression.
- **The Chrome extension degrades.** Standalone `computer` / `javascript_tool` calls start failing
  with "Couldn't determine which page this action targets" while tab management still works. The
  workaround: use `browser_batch`, and **begin every batch with a `navigate`** — batches that do
  not re-attach that way fail. The FedCM account chooser is browser chrome, not page DOM, so it
  cannot be clicked by automation at all.

## Useful commands

```bash
# shell on the VPS
bash scripts/vps-ssh.sh

# deploy after a push (web or worker)
bash scripts/vps-ssh.sh 'cd ~/docubite && git pull --ff-only \
  && docker compose -f docker-compose.prod.yml --env-file .env.production build web \
  && docker compose -f docker-compose.prod.yml --env-file .env.production up -d web'

# logs
bash scripts/vps-ssh.sh 'cd ~/docubite && docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=40 web'

# app DB (POSTGRES_USER/POSTGRES_DB come from .env.production)
bash scripts/vps-ssh.sh 'cd ~/docubite && U=$(grep -m1 "^POSTGRES_USER=" .env.production | cut -d= -f2-); D=$(grep -m1 "^POSTGRES_DB=" .env.production | cut -d= -f2-); docker exec docubite-db-1 psql -U "$U" -d "$D" -c "SELECT workspace_id, status, attempts, error_code FROM integration_provision_jobs;"'

# bigcapital MySQL
bash scripts/vps-ssh.sh 'cd ~/docubite && PW=$(grep -m1 "^BIGCAPITAL_MYSQL_ROOT_PASSWORD=" .env.production | cut -d= -f2-); docker exec -e MYSQL_PWD="$PW" docubite-bigcapital-db-1 mysql -uroot -N -e "SHOW DATABASES;"'
```
