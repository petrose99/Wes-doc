# Handoff — Google sign-in, worker queues, Bigcapital provisioning

Session of 2026-09-08. Everything below is deployed to production (`docubite.app`, Lightsail
`16.60.212.8`, repo at `~/docubite`). Local master and the VPS are both at `1927347`.

## Where to pick up

Three open items, in priority order. Item 1 is the live blocker.

### 1. "Open accounting" lands on a login loop (BLOCKER)

Pressing **Open accounting** sends the browser to `https://books.docubite.app/auth/login` and loops
there. It should sign the user straight into Bigcapital with no credentials, the way it did on
localhost.

How the SSO is meant to work:

1. `app/api/accounting/session/route.ts` — signs in to Bigcapital server-side using the stored
   per-workspace (or per-member) email + decrypted password, then redirects to
   `${BIGCAPITAL_WEBAPP_URL}/auth-bridge.html#<urlencoded JSON>`.
2. `bigcapital/auth-bridge.html` — reads the JSON from the URL hash, writes
   `localStorage["persist:bigcapital:authentication"] = { token, organizationId, _persist }`,
   then `location.replace(redirectPath || "/")`.
3. The Bigcapital SPA is supposed to rehydrate from that key and consider itself signed in.

**Already verified — these are NOT the problem:**

| Check | Result |
|---|---|
| `https://books.docubite.app/auth-bridge.html` | HTTP 200 (file is mounted and served) |
| `BIGCAPITAL_WEBAPP_URL` / `BIGCAPITAL_API_BASE` | both `https://books.docubite.app` |
| `bigcapital_accounts` rows | 2 rows, both with `email` set and an `organization_id` |
| `integration_connections` | 2 rows, both `status = active` |
| Bigcapital tenant DBs | `bigcapital_tenant_55oj1mtsi333q`, `bigcapital_tenant_55oj1mtsi3f9t` |

So credentials, org ids, and the bridge file all exist. The failure is downstream of the redirect.

**Prime suspect:** the shape or key name written to `localStorage` no longer matches what the
running `bigcapitalhq/webapp:latest` expects — the image is pinned to `latest`, so it can move under
us — or the token returned by `bigcapital.signIn` is rejected by the API and the SPA bounces to
`/auth/login`.

**How to diagnose (do this first, don't guess):**

- Open DevTools on `books.docubite.app`, run **Open accounting**, and watch: does
  `persist:bigcapital:authentication` appear in localStorage? With what shape?
- Compare against the shape the SPA writes after a *manual* login at
  `https://books.docubite.app/auth/login` (credentials are in `bigcapital_accounts.email` +
  `password_enc`, decryptable with `SECRETS_ENCRYPTION_KEY`). Diff the two — that difference is
  almost certainly the bug.
- Check the Network tab for the first `/api/` call after the bridge redirect: a 401 there means the
  token is bad, not the storage shape.

Relevant files: `app/api/accounting/session/route.ts`, `bigcapital/auth-bridge.html`,
`lib/integrations/bigcapital/client.ts`, `models/bigcapital-members.ts`.

### 2. Rename "Bigcapital" in the UI to something neutral

`curl https://books.docubite.app/` currently serves `<title>Bigcapital</title>`. That is the
vendor's own SPA title, not ours — no user-visible "Bigcapital" string exists in our `.tsx` files
(only internal function names like `repairBigcapitalConnectionAction`).

Fix in `bigcapital/nginx.conf`, which already rewrites the page via `sub_filter` in the
`location = /index.html` block. Add alongside the existing filters:

```nginx
sub_filter '<title>Bigcapital</title>' '<title>Accounting</title>';
```

Note `sub_filter_once` defaults to `on`, so each directive replaces only its first match — fine
here since the strings are distinct. After editing, the change is picked up by restarting the
webapp container (the file is a read-only bind mount, no rebuild needed):

```bash
bash scripts/vps-ssh.sh 'cd ~/docubite && docker compose -f docker-compose.prod.yml --env-file .env.production restart bigcapital-webapp'
```

This aligns with the existing project rule that vendor names stay out of the UI. Check
`docubite-theme.js` too — it is injected on every SPA page and can rewrite anything `sub_filter`
cannot reach (text rendered by JS after load).

### 3. Smaller loose ends

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

## What was done this session

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
