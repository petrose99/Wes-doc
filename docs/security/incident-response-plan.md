# Incident response plan

Closes RS.MA / RS.CO / RS.AN gaps flagged by the 2026-09-10 NIST CSF 2.0 gap assessment.

## Severity model

| Level | Definition | Example | Initial page target |
|---|---|---|---|
| SEV-1 | Confirmed data exposure OR full production outage OR active attacker | Cross-workspace read confirmed in prod; RDS unreachable; admin console compromised | Incident commander + accountable exec + privacy owner ≤ 15 min |
| SEV-2 | Degraded service OR credible risk of data exposure | Extraction pipeline down; suspected compromised third-party token; malware scanner offline | Incident commander ≤ 30 min |
| SEV-3 | Non-user-facing anomaly OR isolated failure | One background job stuck; anomalous but unconfirmed GuardDuty finding | On-call ≤ 4h |
| SEV-4 | Informational | Dependabot alert; policy renewal due | Track only |

## Roles during an incident

Named-role placeholders resolve via [roles-raci.md](roles-raci.md).

- **Incident commander (IC)** `<TBD-incident-commander>` — declares, times, decides, closes.
- **Comms lead** — usually the privacy owner `<TBD-privacy-owner>` — handles customer, regulator,
  and press communication.
- **Ops lead** — usually the system owner `<TBD-system-owner>` — investigates, mitigates,
  restores.
- **Legal / privacy** `<TBD-privacy-owner>` — reads the breach-notification matrix, authorises
  external notification, engages counsel.
- **Executive** `<TBD-accountable-exec>` — final authority for external comms and any decision
  with contractual or regulatory impact.

## Runbook

1. **Detect.** Anyone (customer, alert, staff) reports a suspected event to
   `incident@docubite.app` or the on-call channel. The first responder pages the IC.
2. **Declare.** IC picks a severity, opens an incident record from
   [tabletop/incident-template.md](tabletop/incident-template.md), starts the timeline (UTC).
3. **Assemble.** IC pages the roles needed for the severity. SEV-1 always pulls exec + legal.
4. **Contain.** Priority: stop further exposure. Rotate suspected credentials, suspend
   affected accounts, revoke sessions (see `sign-out-everywhere` action), block egress if
   needed.
5. **Preserve evidence.** No log deletion. Snapshot the affected RDS instance if forensics may be
   needed. Save CloudTrail excerpts + application logs to an incident subfolder.
6. **Assess notification obligations.** Comms lead walks
   [breach-notification-matrix.md](breach-notification-matrix.md) top-to-bottom and hands each
   triggered row to legal.
7. **Recover.** Ops lead restores service. Announce recovery in-band once verified.
8. **Learn.** Post-incident review within 10 business days: root cause, timeline, corrective
   actions with owners and due dates. File in [tabletop/](tabletop/) as
   `<year>-<month>-<slug>.md`.

## Communication tree

- **Internal:** incident channel (chat) is the source of truth during the incident. Every
  decision the IC makes is a message there so it lands in the timeline.
- **Customer-facing:** status page + one email per affected workspace. Draft goes through legal
  before send.
- **Regulator / press:** exec + legal only. See breach-notification-matrix.md.
- **On-call rotation tool:** `<TBD>` (choose between PagerDuty / Opsgenie — Phase 4 human step).

## Break-glass links

- MFA lockout: [break-glass.md](break-glass.md).
- Production DB direct access: bastion instructions in the private runbook (not in the repo —
  the bastion host details would themselves be a target).
- Force sign-out for one user: /admin-next → user → Sign out everywhere.
- Force sign-out for everyone: run the maintenance script listed in break-glass.md.

## Exercises

- Annual tabletop, minimum. See [tabletop/](tabletop/) for the log.
- Every real SEV-1 or SEV-2 is followed by a post-mortem AND a small tabletop-style rehearsal of
  the corrective action so it does not regress.

## Framework mapping

- RS.MA-01 through RS.MA-05 — this runbook.
- RS.CO-02 / RS.CO-03 — comms tree + breach matrix.
- RS.AN-03 — evidence preservation step 5.
- RC.CO-03 — customer-facing communication.
