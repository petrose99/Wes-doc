# Backend floor — DocuBite coding standards

The backend counterpart of `.claude/skills/impeccable/reference/craft-floor.md`: the rules a
change under `lib/`, `models/`, `prisma/`, `worker/`, `app/api/**` or `*actions.ts` is held to,
read before the first edit of a backend step and used by `/code-review`'s Standards axis. Each
rule names where the idiom already lives; copy it, don't reinvent it. Written 2026-09-22 (#376).

## Absolute (a finding here is a P0, never a trade-off)

1. **Every row belongs to a workspace, and every query says which.** A model that holds
   workspace data is in `WORKSPACE_SCOPED_MODELS` (`lib/workspace-scope.ts`) and every read or
   write carries `workspaceId`; unscoped access goes through `runUnscoped` with a comment saying
   why. A new model is added to the set in the same commit as its migration.
2. **Secrets are sealed, never stored plain.** Tokens, keys, passwords go through
   `lib/secret-crypto.ts` (`v1.<iv>.<tag>.<ct>`); a column holding one is named `*Enc`; API keys
   are hash-only (`lib/api-key.ts`). Nothing secret is logged, put in an error code, or returned
   to the client.
3. **Every external write is idempotent.** A provider create carries an idempotency token
   persisted on the row before the call (`IntegrationPush.idempotencyKey`); a retry re-sends the
   same snapshot (`payload`), never a re-read of the source. Where the provider has no token,
   a find-before-create on the reference number stands in and the choice is commented.
4. **Durable work is a queue row, not a promise.** Anything that talks to the outside world
   after a request runs as a claim / process / drain trio modelled on `lib/webhook-delivery.ts`
   and `lib/integration-push.ts`: atomic lease claim, attempt cap and backoff in a pure
   `*-policy.ts` with its own tests, `nextAttemptAt` index, never blocking the request that
   enqueued it. A worker never throws for a per-row failure.
5. **Authorisation is at the action, by role.** Every server action calls
   `requireWorkspaceRole` (or the equivalent guard) first; Owner-only actions say so in one
   line; the API surface uses `requireApiAuth`. No action trusts an id the client sent
   without re-scoping it to the workspace.
6. **Money and dates are exact.** Amounts are integer minor units or `Decimal`, never `float`;
   dates that mean a day are stored as dates, not timestamps; currency is explicit on every
   amount that leaves the workspace.
7. **Migrations are additive first, destructive in their own migration.** A column or table
   is dropped only after nothing reads it, in a migration whose name says `drop_*`; RLS policies
   stay inert unless the migration enables them on purpose (see `20260819190000`).
8. **The glossary is the vocabulary.** Names in code, error codes and tests use `CONTEXT.md`'s
   terms (Post, Ledger connection, Approval, Company) and never the words it lists under
   *Avoid*. A new concept is a glossary entry in the same change (`domain-modeling`).

## Expected (a finding here is a P1 unless the ticket argues otherwise)

9. **Error codes are short, storable, non-secret tokens** from the shared vocabulary
   (`action-helpers.ts` messages, `lib/integrations/errors.ts`' permanent/retryable split). A
   new code gets a user-facing sentence in the same commit; a provider message is never the
   code.
10. **Prisma is called from `models/`, not from routes, actions or components.** Routes and
    actions compose model functions; `lib/` holds pure logic and adapters; a module's interface
    is small and its behaviour deep (`codebase-design`).
11. **Pure before I/O.** Decision logic (policy, mapping, eligibility, selection) is a pure
    function with a co-located `.test.ts`; the I/O wrapper around it is thin and tested with
    an injected store or client, not a live service.
12. **Tests travel with code.** A commit that changes `lib/`, `models/` or `worker/` logic
    changes or adds a `.test.ts` in the same commit, written red first (`tdd`); a pure
    deletion or a mechanical rename says `no-test: <reason>` in its subject. The step's check
    is `vitest <paths>` then `tsc --noEmit`; the full suite runs at close.
13. **Server-confirmed actions report a Partial outcome per row** (`CONTEXT.md`): a bulk
    action never fails the batch for one row and never reports success for a row it did not
    confirm.
14. **Comments say why, at the place the why is not obvious** — the way the schema comments
    do (`IntegrationPush`, `BigcapitalAccount`'s history). No narration of what the code
    plainly does; no ticket numbers without the reason.
15. **Config gates are deployment facts** in `lib/config.ts` read once, with the env var
    documented in `.env.example`; a surface behind a gate 404s, it does not half-render.
16. **One way to do each thing.** Before a helper is written, the one that exists is found
    (`lib/`, `models/`, the area primer under `docs/agents/areas/`); a second implementation
    of the same idea is a finding.

## Definition of done for a backend step

- Seams named before code (which public function or route is under test).
- Red test → green → `vitest <paths>` → `tsc --noEmit` clean.
- `simplify` pass over the diff before it is marked done.
- Commit names the ticket and the step; a deletion says `no-test:`.
- At ticket close: `/code-review` since the base branch, both axes; P0 and P1 findings fixed
  or handed off by name; the report carries `review: P0=0 P1=0`.
