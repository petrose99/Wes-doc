# Recovery Time / Point Objectives

Closes RC.RP-04 (planned recovery activities have measurable objectives).

## Targets

| Class | RTO | RPO | Rationale |
|---|---|---|---|
| Production web + worker | 4 hours | 1 hour | Business impact of an outage is per-hour customer productivity; 4h matches the time to redeploy from image + reseed secrets. |
| Postgres (RDS pgvector) | 4 hours | 1 hour | Matches RDS backup config: `backup_retention_period = 7` (PITR to any second within 7 days). Multi-AZ failover ≤ 2 min, factored in. |
| Document storage (S3) | 15 min | 0 (bucket-versioning) | S3 is regionally durable by design; RTO is only "reachable again after edge failover." |
| Audit archives (S3 audit-archives) | 24 hours | 0 (Object Lock + versioning) | Restoration for e-discovery, not for live traffic. |
| CloudTrail (management events) | 24 hours | 0 | Same class as audit. |
| Third-party auth (Supabase) | 4 hours | 0 (provider PITR) | Depends on Supabase's own SLA; degraded mode locks new signups and forces users to already-issued sessions. |

Values require exec sign-off; the accountable executive signs against the row in the [POLICY-SET
sign-off log](POLICY-SET.md#sign-off-log). No numbers here are yet contractual commitments.

## Backup & restore configuration (current)

- **RDS:** `backup_retention_period = 7`, Multi-AZ true, deletion protection true (see
  [infra/aws/terraform/rds.tf](../../infra/aws/terraform/rds.tf) and
  [infra/aws/terraform/variables.tf](../../infra/aws/terraform/variables.tf)).
- **S3 documents:** SSE-KMS, versioning to be enabled in Phase 3.2, no lifecycle expiry.
- **S3 audit-archives (prefix under documents bucket):** to be added in Phase 3.2 with a
  6-year retention rule aligned to HIPAA §164.316(b)(2)(i).
- **CloudTrail:** dedicated bucket with Object Lock (Phase 3.2), 12-month retention.

## Restore drills

| Drill | Cadence | Owner | Last run | Next due |
|---|---|---|---|---|
| RDS point-in-time restore into a scratch VPC | Quarterly | `<TBD-system-owner>` | (never) | 2026-Q4 |
| S3 versioned object restore | Semi-annual | `<TBD-system-owner>` | (never) | 2026-Q4 |
| Full stack rebuild from Terraform + latest image | Annual | `<TBD-system-owner>` | (never) | 2027-Q1 |
| Audit-archive retrieval (evidence request drill) | Annual | `<TBD-security-owner>` | (never) | 2027-Q1 |

Results are recorded under [tabletop/](tabletop/) with the incident-response tabletops for
convenience — same folder, same review cadence.

## Framework mapping

- RC.RP-04 — targets above.
- RC.RP-05 — restore drills tracked with dates.
- PR.DS-11 (backups) — RDS + S3 + audit-archives config.
