# Handoff: Cloudflare R2 storage, landing-page rebuild, Automation UI

_Last updated: 2026-09-09. Branch: `master`. Everything below is pushed to `origin/master`
and deployed to production (`docubite.app`, Lightsail VPS 16.60.212.8). Working tree clean._

## What was built

### 1. Merged accounting-automation work (from `claude/docubite-accounting-gaps-e6c9b7`)

Commits `8ab642b`, `368dd1e`, `0f2a8ea`, test fix `470926f`. Money columns moved
`Float` → `Decimal(18,2)`; `StatementLine` gives bank-match rows a durable identity
across re-extraction; vendor coding history auto-applies after 3 confirmed codings
at 90% agreement (`lib/automation/vendor-history.ts`); matching candidate
generation replaced a `LIMIT 200` scan with Ditto-style blocking; accepting a bank
match now closes the loop into Bigcapital (marks the document paid, posts a
cashflow transaction, sets `reconciledSource`); `WorkspaceAutomationConfig` gets a
real settings surface (Suggest → Auto with approval → Touchless). Four migrations,
all applied to prod. `eval:coding` and `eval:matching` gate first-pass accuracy at
75%/95% respectively.

Fixed one pre-existing bug surfaced by the merge: `lib/finance/actions.test.ts` was
asserting `bank_statement` was non-pushable when it's actually in
`PUSHABLE_DOC_TYPES` — the test predated `bank_statement` being added to that list
and had never actually been exercising the guard it was named for. Fixed to use
`purchase_order` instead (`470926f`).

### 2. Redesigned the in-app Automation section (`5f1e587`)

Was four tabs of identical white rounded cards where a 22% touchless rate carried
the same visual weight as "Errors: 0" — icon chips in emerald/blue/violet/amber/red
encoding nothing. Rebuilt as a ledger: one display-face figure per tab, everything
else a ruled row with its number right-aligned in tabular figures. New shared
component `components/automation/automation-ui.tsx` (`Figure`, `Funnel`, `Panel`,
`Ledger`/`LedgerRow`, `Sheet`, `Pill`, `Empty`) — colour now means exactly one of
{auto: emerald, waiting: amber, blocked: red, idle: ink}, never decorative. The
autonomy-level picker on Settings became a three-rung ladder with filled rungs
showing how far the workspace has handed over, instead of three radio boxes.

### 3. Fixed the Postgres healthcheck (`b66dd2a`)

`pg_isready -U docubite` with no `-d` connects to a database named after the user,
which doesn't exist (the real db is `document_inbox`). Check still passed — it only
tests whether the server accepts connections — while Postgres logged a FATAL every
5s, ~17k lines/day, for at least 2 days before this was caught (found via a log
scan after the merge deploy, not because anything visibly broke). Fixed to
`pg_isready -U docubite -d document_inbox`.

### 4. Rebuilt the marketing landing page

- `b8634de` — added Email intake + Automation sections (first pass, later
  compressed — see below).
- `78e9c16` — intake (upload + email) compressed from two full sections into one
  compact band (`components/marketing/landing/intake.tsx`), freeing space for a new
  **Extraction** section (`components/marketing/landing/extraction.tsx`) — the
  product's actual differentiator (per-field confidence, line items, flagged
  low-confidence fields) had no section of its own before this and was judged more
  important than restating "you can upload or email" at length.
- `1e9f3fa` — **animations now autoplay on every scroll into view** instead of
  firing once per page load with a Replay button for a second look
  (`components/marketing/landing/_lib/use-play-on-scroll.ts` rewritten: entering
  plays, fully leaving rearms, re-entering plays again; rearm threshold is 0 so a
  section parked at a viewport edge can't flicker). `ReplayButton` component
  deleted, removed from all 6 call sites. Hero's sidebar mock
  (`components/marketing/landing/hero.tsx`) was invented chrome that didn't match
  the real app — rebuilt to mirror `components/shell/sidebar.tsx` exactly: same
  labels/order/icons, added Sheets/Accounting/Automation, removed Health Checks.
  New `db-grow` keyframe added to `app/globals.css` for bar-fill animations that
  still resolve correctly under `prefers-reduced-motion` (ends at the resting
  state, same pattern as existing `db-in`/`db-pop`).
- Comparison section (`components/marketing/landing/comparison.tsx`) rebuilt from
  9 cards (3 rows × 3 labels repeated every row) into one table: headings said
  once, each row read straight across, the "with DocuBite" column a single
  unbroken emerald column down the right rather than 3 separate green boxes.

### 5. Fixed a real app bug found while matching the hero mock to the app (`8d79b11`)

`components/shell/sidebar.tsx`'s `ICONS` map had only 3 of the 9 icon names that
`lib/modules/index.ts` actually declares (`inbox`, `mic`, `heart-pulse`). The other
6 — Automation's `zap`, Approvals' `check-circle`, Rules' `workflow`, Tax's
`percent`, Expenses' `receipt`, Budgets' `wallet` — silently fell through to the
generic `Files` icon, identically and invisibly, for as long as those modules have
existed. All 9 now mapped; unmapped names still fall back rather than breaking the
rail.

### 6. Connected Cloudflare R2 for document storage (`5e73b45`, `c647602`, `88400d9`)

`lib/document-storage.ts` / `lib/config.ts` previously assumed AWS unconditionally
(no endpoint override, unconditional `SSE-KMS` header — which R2 rejects outright).
Added endpoint support + path-style addressing + conditional SSE-KMS (dropped on a
custom endpoint, since KMS is AWS-only and R2 encrypts at rest with nothing to
configure).

Then **renamed the whole storage config from `AWS_*` to `STORAGE_*`** (`c647602`)
after the user pushed back on `AWS_ACCESS_KEY_ID` etc. implying an AWS account was
needed for what is in fact Cloudflare R2 (R2 just speaks the S3 protocol). Old
`AWS_*` env vars are still read as fallbacks so nothing broke mid-migration;
`STORAGE_*` wins wherever both are set. Also avoided a name collision:
`S3_ENDPOINT` was already used in both compose files for `bigcapital-server`'s
MinIO — the new var is `STORAGE_ENDPOINT`, not `S3_ENDPOINT`.

Credentials are now passed to the `S3Client` explicitly instead of relying on the
SDK's environment auto-lookup — that indirection was the only reason the old names
had to be spelled `AWS_` at all.

`scripts/set-storage-env.sh` (`88400d9`) — a helper that prompts for the 5 storage
values (echo off for the secret), sends them to the VPS over SSH **stdin**, not as
a command-line argument (arguments are visible via `ps` to anyone else on the box),
writes them into `.env.production` in place (backing up the previous file first),
and prints the result back with the secret masked. Re-running it updates rather
than duplicating keys.

## Current production state, verified this session

- **Storage: Cloudflare R2**, bucket `docubite`, endpoint
  `https://a3ee3fbe226cdc68bad5942575bab3a5.r2.cloudflarestorage.com`, region
  `auto`. Verified with a real PUT/GET/LIST/DELETE from the production container
  (not just config review). The 8 pre-existing documents (~342KB, 4 documents ×
  {source, blocks}) were copied from the VPS volume into R2 — nothing lost.
- The Docker volume `docubite_document_sources` is **still mounted** and still
  holds those 8 files, deliberately, as a rollback path: clearing `STORAGE_BUCKET`
  sends storage back to local disk with data intact.
- The old `AWS_*` keys are still present in `.env.production` on the box —
  harmless (unused, `STORAGE_*` takes precedence) but now misleading since nothing
  here talks to AWS. Worth deleting on a future pass through that file.
- **Database layout** (mapped this session via direct inspection, not previously
  written down anywhere):
  - DocuBite's own data: Postgres (`pgvector/pgvector:pg17`), db `document_inbox`,
    70 tables, ~13MB on prod. Owns documents/extractions/field-provenance/GL
    coding/matching/review-approval/audit events. `document_chunks` is the
    pgvector RAG index.
  - The ledger: MySQL, **one separate database per workspace**
    (`bigcapital_tenant_<id>`, 70 tables each, ~4.7MB each on prod, 3 workspaces →
    3 tenant DBs). Per `docs/architecture/adr-001-bigcapital-is-the-ledger.md`,
    Bigcapital is the system of record for debits/credits/trial balance; DocuBite
    deliberately does not duplicate a journal. `ledger_transactions` in Postgres is
    a read-only mirror (0 rows on prod currently — no bank matches have been
    reconciled in prod yet).
  - Bigcapital's own file attachments live in a **separate MinIO** bucket
    (`bigcapital`), unrelated to the R2 bucket above, currently near-empty.
  - Auth/identity: Supabase, off-box. `users.supabase_user_id` links a local row to
    it.
  - **A full backup needs three targets**: Postgres volume, MySQL volume, R2
    bucket. Postgres alone loses the books.

## What's NOT done

- **Landing-page hero headline is unchanged.** Long back-and-forth this session
  (user rejected ~10 proposed headlines as still-generic) landed on a
  **complement-not-replace** positioning direction — "it does the data entry, you
  do the accounting" rather than any "it takes over the bookkeeping" framing — but
  this was **never written into `components/marketing/landing/hero.tsx`**. The
  live/deployed headline is still the original "The messy pile goes in. A clean,
  checked ledger comes out." Last proposal on the table if picking this up:
  - Headline: *"It does the data entry. You do the accounting."*
  - Sub-headline direction: *"Reading a supplier name off a crumpled receipt is
    not accounting. Deciding how it's treated is. DocuBite takes the first job
    entirely ... hands you what actually needs judgement."*
  - If applied, the Automation section's opening line ("It watches how you code,
    then stops asking") was flagged as cutting against this framing — reads as
    "taking over" rather than "getting better at its own job" — and would want a
    matching edit.
- **`prisma/seed.ts` has a real, unfixed bug**: `upsertSupabaseIdentity` calls
  `admin.auth.admin.updateUserById(...)` and never checks the returned error. If a
  local `users.supabase_user_id` points at a stale or wrong-project Supabase id,
  the update silently fails and the seed still prints its credentials table as if
  it succeeded — so `npm run db:seed` can lie about having fixed a broken login.
  Hit twice this session (the `demo@docubite.local` and `ui-verify@docubite.local`
  accounts both had this); worked around by hand each time (null the stale id,
  look up the real Supabase user id via the admin API, relink, re-seed). Not fixed
  in the script itself — needs the error checked and a fallback lookup-by-email.
- **No live click-through was done for R2** beyond a direct S3-client PUT/GET/LIST
  /DELETE test from the container. That test exercises the identical client,
  credentials, and bucket the app uses, so confidence is high, but nobody has
  uploaded a document through the actual app UI and confirmed it lands in R2 via
  the normal pipeline.
- **Two pre-existing prod config gaps, not touched, only surfaced**:
  `NEXT_PUBLIC_SENTRY_DSN` unset (prod errors aren't reported anywhere — this is
  part of why the healthcheck spam went unnoticed for 2 days), `MALWARE_SCAN_URL`
  unset (uploads accepted with no malware scan).

## Files changed (by area)

**Automation UI**: `components/automation/automation-ui.tsx` (new),
`components/automation/automation-tabs.tsx`,
`app/(app)/workspaces/[workspaceId]/automation/{page,vendors/page,matches/page,settings/page}.tsx`,
`components/settings/automation-config-form.tsx`

**Prod infra**: `docker-compose.prod.yml` (healthcheck fix)

**Landing page**: `app/(marketing)/page.tsx`,
`components/marketing/landing/{intake,extraction,automation,comparison,hero,how-it-works,faq,pipeline}.tsx`,
`components/marketing/landing/_lib/use-play-on-scroll.ts` (rewritten),
`components/marketing/landing/_lib/replay-button.tsx` (deleted),
`components/marketing/nav.tsx`, `app/globals.css` (new `db-grow` keyframe)

**Sidebar icon fix**: `components/shell/sidebar.tsx`

**Storage / R2**: `lib/config.ts`, `lib/document-storage.ts`,
`.env.example`, `.env.production.example`, `infra/aws/terraform/main.tf`,
`scripts/set-storage-env.sh` (new)

## Environment quirk worth knowing before running anything heavy here

This dev machine has ~7.4GB RAM; Docker alone held ~2.6GB across 9 containers this
session, some from unrelated projects (`backend`, `frontend`, `huey` — not
DocuBite). `npx tsc --noEmit` and `npx eslint` on the full repo both died
repeatedly with `heap out of memory`; they only succeeded with
`NODE_OPTIONS=--max-old-space-size=1200`–`2000`, or scoped to a subdirectory via a
temporary `tsconfig.*.json` when even that failed. Two dev servers were found
orphaned on ports 3000/3001 sharing one `.next` directory at one point, which
corrupted the Turbopack build cache (`Cannot find module
'.../[turbopack]_runtime.js'`) — fixed by killing both orphans and `rm -rf .next`.
Background dev-server tasks were killed more than once by the harness's own
low-memory guard, including after this handoff was written. Check free memory
(`Get-CimInstance Win32_OperatingSystem` in PowerShell) and kill stray node
processes holding 3000–3002 before assuming `npm run dev` will just work.

## Next up

- Write the new hero headline/sub-headline into `hero.tsx` if the
  complement-not-replace direction above is confirmed, and adjust the Automation
  section's opening line to match.
- Fix `prisma/seed.ts`'s swallowed error in `upsertSupabaseIdentity`.
- Do a real browser-driven upload → confirm-in-R2 pass for full confidence, beyond
  the direct S3-client test already done.
- Delete the now-dead `AWS_*` keys from `.env.production` on the box once R2 is
  trusted.
- Consider wiring `NEXT_PUBLIC_SENTRY_DSN` given how long the healthcheck spam
  went unnoticed without it.
