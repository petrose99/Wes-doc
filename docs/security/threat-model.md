# DocuBite STRIDE threat model

Applied to the trust boundaries in [../architecture/data-flow.md](../architecture/data-flow.md).
Each identified threat has an existing or planned mitigation. Threats without an in-place
mitigation are recorded in [registers/risk-register.csv](registers/risk-register.csv) with a due
date and an owner.

STRIDE = Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation
of privilege.

## Browser → Edge → App

| # | STRIDE | Threat | Mitigation | Risk row |
|---|---|---|---|---|
| B-1 | S | Attacker steals a session cookie via XSS | CSP with per-request nonce (proxy.ts + lib/csp.ts); HttpOnly Secure SameSite=Lax cookies | R-005 (defence in depth via RLS) |
| B-2 | T | Malicious file uploaded as a "document" | MALWARE_SCAN_URL fail-closed (lib/malware-scan.ts); MIME sniff disabled by X-Content-Type-Options: nosniff | R-009 |
| B-3 | R | Sensitive action executed then denied | DocumentAuditEvent for every write; IP + user-agent captured in lib/audit.ts | (baseline) |
| B-4 | I | Response leaks another workspace's rows via a missed filter | DB_SCOPE_GUARD=throw + DB_RLS_ENABLED=true (defence in depth) | R-001, R-005 |
| B-5 | D | Large upload exhausts the app | serverActions.bodySizeLimit=52mb (next.config.ts); WAFv2 rate limits | (planned WAF) |
| B-6 | E | Non-admin reaches /admin-next | role=admin required + aal2 MFA required (lib/admin.ts); break-glass logged | R-008 |

## App → Subprocessors

| # | STRIDE | Threat | Mitigation | Risk row |
|---|---|---|---|---|
| S-1 | S | Prompt injection in document body steers the LLM to bypass extraction schema | Structured JSON output schema; no tool calls; separation of system + user turns | R-004 |
| S-2 | I | LLM provider retains customer text for training | Zero-retention DPAs required before enabling each provider (supplier-register.csv) | R-003 |
| S-3 | I | Embeddings API stores raw text | HF Inference DPA + only fragments sent | R-003 |
| S-4 | D | LLM provider outage blocks extraction | Gemini fallback list (config-driven); job retry with backoff | (baseline) |
| S-5 | E | Compromised third-party can act on our data | Least-privilege API keys; IAM boundary on Fargate task role (main.tf) | (baseline) |

## App → Data plane

| # | STRIDE | Threat | Mitigation | Risk row |
|---|---|---|---|---|
| D-1 | T | Data-at-rest tampering in S3 documents | Bucket versioning + Object Lock on audit archives; SSE-KMS with rotation | R-010 |
| D-2 | I | Backup contains customer data leaked via a snapshot restore | RDS backups encrypted with KMS; Multi-AZ + PITR only; Access Analyzer alerts | R-010 |
| D-3 | R | Someone deletes an audit event | DocumentAuditEvent audit_events_setnull_trigger + S3 audit-archives with Object Lock | R-010 |
| D-4 | E | RLS bypass via superuser role | App connects as a non-superuser role; migrations use a separate role in a bastion | R-005 |
| D-5 | D | Single-AZ outage takes prod down | Multi-AZ RDS; container image + Terraform allow quick redeploy | R-002, R-006 |

## Webhooks in

| # | STRIDE | Threat | Mitigation | Risk row |
|---|---|---|---|---|
| W-1 | S | Forged webhook from a subprocessor | HMAC signature verification; encrypted stored secret (lib/secret-crypto.ts) | R-007 |
| W-2 | T | Replay of a legitimate webhook | Timestamp + nonce check where the provider supports it | (baseline) |

## Governance-layer threats

| # | STRIDE | Threat | Mitigation | Risk row |
|---|---|---|---|---|
| G-1 | R | Admin action denied later ("I did not click that") | audit_events include actor + IP + UA; break-glass writes [break-glass] log line | R-008 |
| G-2 | E | Compromised laptop unlocks the admin console | aal2 required (lib/admin.ts); short-lived Supabase JWT; sign-out-everywhere action | R-008 |

## Framework mapping

- ID.RA-03 / ID.RA-04 / ID.RA-05 (threats + impact + likelihood documented) — this doc plus
  the risk register.
- PR.AA-03 / PR.AA-05 — B-6, D-4 rows.
- DE.CM-01 (network monitored) — planned VPC Flow Logs + GuardDuty (see Phase 3.2).
