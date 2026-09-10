# Admin console break-glass procedure

The `/admin-next` console requires MFA (aal2) — see [lib/admin.ts](../../lib/admin.ts). If every
admin has lost their MFA factor and cannot re-enrol through the normal flow, one named account may
be added to a comma-separated `BREAK_GLASS_ADMIN_EMAIL` allow-list. That account bypasses the aal2
check exactly for `/admin-next` and produces a `[break-glass]` line in the server log for every
request it makes.

## Preconditions

- The account listed in `BREAK_GLASS_ADMIN_EMAIL` MUST already have `User.role = "admin"` in the
  database. The env var is not itself a grant; it is a bypass of the MFA step of an existing
  grant.
- The env var must be set with an operational change (a new `.env.production` value + a rolling
  restart), which is intentionally slower than a config toggle so it cannot be flipped without
  operator agreement.

## Procedure

1. Confirm every admin has lost MFA and self-service reset is not possible. If any admin still has
   MFA, use that account instead.
2. Add the intended email to `BREAK_GLASS_ADMIN_EMAIL` on the production host, restart the web
   container.
3. Sign in as the allow-listed admin, re-enrol their own MFA factor, then re-enrol MFA for other
   admins as needed.
4. Remove the account from `BREAK_GLASS_ADMIN_EMAIL` and restart.
5. Review the `[break-glass]` lines in the log for the window the bypass was active. Attach the
   log excerpt to the corresponding incident record in `docs/security/tabletop/` (or a new
   entry under `docs/security/incidents/`).

## Audit

Every admin console page load and every admin API request made under break-glass emits a warning
line prefixed `[break-glass]` with the email and userId. This is emitted to `stdout` and lands in
the container's log driver, which the deploy ships to CloudWatch. It is NOT written to the
in-app audit-event table on purpose: the recovery path deliberately avoids DB dependencies so it
still works when the DB is unhealthy (a plausible cause of the outage that led to break-glass).

## Framework mapping

Closes the ID.RA / PR.AA-03 gap flagged by the 2026-09-10 NIST CSF 2.0 gap assessment
("MFA on admin console"). Referenced by [docs/security/incident-response-plan.md](incident-response-plan.md).
