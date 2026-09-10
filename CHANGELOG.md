# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Governance surface: `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, this changelog, and
  a signed `/.well-known/security.txt`.
- MFA (aal2) enforcement on `/admin-next`, with a `BREAK_GLASS_ADMIN_EMAIL` allow-list documented
  in `docs/security/break-glass.md`.
- Policy sign-off block on `docs/security/POLICY-SET.md`; workforce acknowledgement log stub.
- Named-role RACI matrix in `docs/security/roles-raci.md`.
- Populated risk register, asset inventory, supplier register, data inventory, access review
  seed in `docs/security/registers/`.
- Data-flow diagram in `docs/architecture/data-flow.md` and STRIDE threat model in
  `docs/security/threat-model.md`.
- RTO/RPO decision doc, breach-notification decision matrix, incident-response plan,
  tabletop, pentest, and quarterly-review folders in `docs/security/`.
- CI security scanners: Gitleaks, SBOM (CycloneDX), Trivy container scan, Checkov IaC scan,
  dependency-review; every GitHub Action pinned to a commit SHA.
- Terraform: CloudTrail, GuardDuty, AWS Config, VPC Flow Logs, WAFv2 web ACL; S3 versioning,
  access-logging, and audit-archive lifecycle. `prod.tfvars` committed with the
  Multi-AZ + deletion-protection defaults made explicit.
- `.github/CODEOWNERS` and `scripts/verify-rls-live.ts`.

### Changed
- `lib/malware-scan.ts` and `lib/verify-production-config.ts` fail closed when
  `MALWARE_SCAN_URL` is unset in production (previously a soft warning).
- `docker-compose.prod.yml` sets `DB_RLS_ENABLED=true` for the web and worker services
  explicitly, so a missing line in `.env.production` cannot silently disable RLS.
- `lib/secret-crypto.ts` zeroises intermediate buffers after decryption (defence in depth).

### Security
- Closes the code / IaC / evidence gaps flagged by the 2026-09-10 NIST CSF 2.0 gap assessment:
  items 3, 4, 5, 8, 9, 10, 12, 13 in full and the repo-side portion of 1, 2, 6, 11, 15, 16.
  Human-dependency items (named roles, signed DPAs, pentest, tabletop record) remain.

## [Historical]

Historical release history begins with this changelog. Prior work is captured in the
`HANDOFF-*.md` documents at the repo root and in `git log`.
