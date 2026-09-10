# NIST CSF 2.0 remediation — remaining human work

The code and evidence in this repo close every gap that can be closed by editing files. The
items below are the ones that need a person to decide, sign, buy, provision, or run something.
Do them in this order. Nothing later depends on you finishing everything earlier — but earlier
items are cheap and unblock the rest, so start at the top.

Estimated total effort: **1 focused day for §1–§4, then ~2 weeks calendar time for §5–§10**
(supplier DPAs move at their pace, not yours). Budget line items are called out where the cost
is non-trivial.

---

## 1. Name the five roles (30 min)

Prerequisite for almost everything else — every doc has `<TBD-*>` placeholders that resolve to
these names.

1. Open [roles-raci.md](roles-raci.md).
2. Fill in the top table with real names and a backup for each row:
   - **Accountable executive** — the person who signs policies and owns risk. Usually the CEO
     or founder for an SMB.
   - **Security owner** — runs the program day-to-day. Usually you (the technical lead) if the
     company is small.
   - **Privacy / data-protection owner** — owns the supplier DPAs and any breach notification.
     Can be the same person as security owner in a small team; note the concentration risk.
   - **Incident commander** — leads incidents. Can rotate; name a primary + backup.
   - **System owner (DocuBite production)** — owns the AWS account and the Lightsail VPS.
3. Propagate the names across the repo. From the worktree root:
   ```bash
   for placeholder in TBD-accountable-exec TBD-security-owner TBD-privacy-owner TBD-incident-commander TBD-system-owner; do
     grep -rln "<${placeholder}>" docs/ .github/ | xargs sed -i "s|<${placeholder}>|<REAL NAME HERE>|g"
   done
   ```
   Replace `<REAL NAME HERE>` with the actual person for each placeholder in turn (run the loop
   once per role, editing the sed replacement each time). On Windows PowerShell, use
   `(Get-Content file) -replace '<TBD-security-owner>','Jane Doe' | Set-Content file` in a loop
   instead.
4. Update the GitHub handles in [.github/CODEOWNERS](../../.github/CODEOWNERS): swap
   `@docubite-security-owner` etc. for the real handles.
5. Commit: `git commit -am "Assign named roles across security docs"`.

**Done when:** `git grep -n '<TBD-' docs/` returns zero lines.

---

## 2. Sign the policy set (1 hour)

Prerequisite: §1. The policies are already written; they just need the accountable exec to
approve v1.0.

1. Read [POLICY-SET.md](POLICY-SET.md) end to end with the accountable exec on a call. Flag any
   line the org cannot commit to — most SMBs edit §7 (BC/DR windows) and §4 (vulnerability
   SLAs) to match their real capacity.
2. Fill the sign-off table at the top: set `Approved` to today's date and set `Next review` to
   today + 1 year for every row.
3. Have each workforce member read POLICY-SET.md and add a row to
   [acknowledgements/acknowledgements.csv](acknowledgements/) — you'll need to create that
   file; the template is in the README next to it. Any signal works (a chat reaction, a signed
   PDF, a form submission) as long as it links to real evidence.
4. Commit: `git commit -am "Approve POLICY-SET v1.0"`.

**Done when:** sign-off table has real dates and the acknowledgement CSV has one row per person
with access to production or customer data.

---

## 3. Provision the malware scanner endpoint (30 min – 2 hours)

**Blocker for prod deploy.** After the fail-closed change, the web and worker containers refuse
to boot without `MALWARE_SCAN_URL` reachable. Do this before you deploy the branch.

Pick one option:

**Option A — cheapest, self-hosted ClamAV sidecar (recommended for Lightsail).**
1. Add a `clamav` service to [docker-compose.prod.yml](../../docker-compose.prod.yml):
   ```yaml
   clamav:
     image: clamav/clamav:stable
     restart: unless-stopped
     healthcheck:
       test: ["CMD", "clamdcheck.sh"]
       interval: 30s
   ```
2. Add a tiny HTTP shim (a 30-line Node script or a `clamav-rest` container) that accepts POST
   + body and returns `{"clean": true|false}`. Publish it on the docker network only.
3. Set `MALWARE_SCAN_URL=http://clamav-shim:3310/scan` in `.env.production`.
4. Redeploy.

**Option B — managed (AWS/Cloudflare).** For the AWS side, use S3 GuardDuty Malware Protection
(already declared in [guardduty.tf](../../infra/aws/terraform/guardduty.tf)); wire a Lambda in
front of it to return the sync JSON shape the code expects. More work, less to maintain.

**Verification (both options):**
```bash
curl -X POST "$MALWARE_SCAN_URL" -H 'content-type: application/pdf' --data-binary @/etc/hosts
# expect {"clean": true}
```

**Done when:** `curl` above returns 200 with a `clean` field.

---

## 4. Turn RLS on in production (15 min)

Prerequisite: nothing. The switch is already flipped in [docker-compose.prod.yml](../../docker-compose.prod.yml);
this is the manual verify.

1. SSH to the box: `scripts/vps-ssh.sh` (per your project memory) or `ssh -i <key> ubuntu@16.60.212.8`.
2. Confirm the container has the env: `docker compose exec web node -e "console.log(process.env.DB_RLS_ENABLED)"` — expect `true`.
3. Pick two real workspace IDs from the DB:
   ```bash
   docker compose exec db psql -U docubite -d document_inbox -c 'SELECT id FROM "Workspace" LIMIT 2;'
   ```
4. Run the smoke test:
   ```bash
   docker compose exec web env DB_RLS_ENABLED=true npx tsx scripts/verify-rls-live.ts <wsA> <wsB>
   ```
   Expect `OK: scoped to <wsA>, 0 rows visible for <wsB>`.
5. Attach the output to the 2026-Q3 QSR file:
   [quarterly-security-review/2026-Q3.md](quarterly-security-review/2026-Q3.md) → row
   "Confirm DB_RLS_ENABLED=true in production".

**Done when:** the smoke test prints `OK` and its output is committed under the QSR row.

---

## 5. Execute supplier DPAs (2 weeks calendar, 15–60 min each)

Prerequisite: §1 (need the privacy owner named to sign as counterparty).

Each row of [registers/supplier-register.csv](registers/supplier-register.csv) currently shows
`PENDING - execute ... DPA`. Walk the list top-to-bottom — start with the CRITICAL tier:

1. **AWS.** aws.amazon.com/compliance/data-privacy → sign the standard AWS DPA online. Save
   the receipt PDF; add its link to the `evidence_link` column of the CSV.
2. **Supabase.** supabase.com/dpa → sign electronically.
3. **Stripe.** dashboard.stripe.com → Settings → Compliance → Data Processing Addendum.
4. **OpenAI + Google Gemini + Hugging Face.** Log in to each provider console and either
   accept the click-through DPA or request the enterprise DPA if you handle PHI/regulated
   data. Ask each provider in writing:
   - Confirm no training on API/inference data.
   - Confirm retention window (target: zero retention).
   - Get their breach-notification SLA in hours.
   Save the confirmation email in `docs/security/pentest/` sibling folder
   `docs/security/dpa-evidence/` (create it — commit only redacted PDFs, or store originals in
   your document store and commit the link).
5. **MinerU.** Same as the LLM providers — ask in writing. If they cannot confirm zero
   retention, escalate to R-003 in the risk register with a treatment plan or find a
   replacement.
6. **Resend, Sentry, Cloudflare, GitHub.** Standard click-through DPAs on each provider's
   legal page.

For each: update the CSV row's `contract_dpa_complete`, `ai_training_or_retention_confirmed`,
`breach_notice_term`, `last_reviewed`, and `evidence_link` columns.

**Done when:** every row has `contract_dpa_complete = YES <date>` and a working `evidence_link`.
Budget: $0 (all covered by existing SaaS bills). Escalate any refusal to the accountable exec.

---

## 6. Wire alerting for the security monitoring (2–4 hours)

Prerequisite: nothing. Terraform now creates the *signals* (CloudTrail, GuardDuty, Config, Flow
Logs, WAF); nothing routes them to a human yet.

1. Pick the destination:
   - **Cheapest:** an email address + Slack webhook.
   - **Better for SEV-1:** PagerDuty or Opsgenie ($20–30 per on-call seat per month).
2. Create an SNS topic per severity: `docubite-alerts-critical` and `docubite-alerts-info`.
3. Subscribe the destination(s) to each topic.
4. Wire the sources:
   - **GuardDuty findings → SNS:** EventBridge rule matching `{"source": ["aws.guardduty"], "detail": {"severity": [{"numeric": [">=", 7]}]}}` → SNS critical.
   - **AWS Config non-compliant → SNS:** EventBridge rule on `AWS Config Rules Compliance Change` where compliance = `NON_COMPLIANT` → SNS info.
   - **CloudTrail unusual (root login, IAM changes) → SNS:** EventBridge rule matching root
     account use or `iam:*` actions outside the deploy pipeline → SNS critical.
   - **VPC Flow Logs unusual egress → CloudWatch metric filter + alarm → SNS critical.**
5. Test each: manually generate one finding (e.g. `aws guardduty create-sample-findings`),
   confirm the alert lands.
6. Commit the routing as a new `alerts.tf` in `infra/aws/terraform/` so future you can see how
   it was wired.

**Done when:** you receive a real alert from a sample finding, and the routing is in Terraform.

---

## 7. Choose on-call tool + set the rotation (1 hour)

Prerequisite: §1, §6.

1. Decide: PagerDuty vs Opsgenie vs Grafana OnCall (free) vs a chat channel with rotating
   duty.
2. Configure the rotation. For a two-person team, a weekly 12-hour rotation with a manual
   handoff message beats a fancy tool.
3. Update [incident-response-plan.md](incident-response-plan.md) §Communication tree to name
   the actual tool and the escalation timers.
4. Update the RACI [roles-raci.md](roles-raci.md) if the incident commander now rotates.
5. Commit.

**Done when:** the on-call schedule is written down and every named on-call has acknowledged
receiving their first page.

---

## 8. Run the first tabletop (2 hours)

Prerequisite: §1, §7.

1. Pick the scenario from [tabletop/README.md](tabletop/README.md) — the 2026-Q4 planned
   "Cross-workspace data leak from a missing scope filter" is a good first run because the
   remediation is already in the risk register (R-001).
2. Schedule 2 hours with the IC, ops lead, comms lead, and legal.
3. Run the exercise on paper. IC declares SEV-1 at t=0, then everyone walks the
   [incident-response-plan.md](incident-response-plan.md) runbook step-by-step. Someone
   deliberately introduces a wrinkle at t=30min (e.g. "GuardDuty is also alerting", "a
   customer just tweeted").
4. Record decisions and timing in a new file
   [tabletop/2026-10-crossword-drill.md](tabletop/) using
   [tabletop/incident-template.md](tabletop/incident-template.md).
5. Every "we didn't have X ready" from the debrief becomes a Corrective Action row in that
   file, with an owner and a due date.
6. Commit.

**Done when:** a debrief file exists in `tabletop/` with corrective actions assigned.

---

## 9. Commission the annual penetration test (4 weeks calendar)

Prerequisite: §5 (need DPAs so the pentest firm can access production without violating them).

Budget: $8k–$30k depending on scope and firm. Firms this size use: Cure53, Include Security,
Bishop Fox, Doyensec, NCC Group (larger). Ask three for quotes with the standing scope from
[pentest/README.md](pentest/README.md).

1. **Week 1:** send RFP to three firms. Ask for: scope, methodology, deliverables, retest
   included, timeline, price.
2. **Week 2:** pick one. Sign SoW + MNDA. Provision a test workspace + test admin account.
3. **Week 3:** pentest runs. Firm hands you a preliminary findings list.
4. **Week 4:** you fix findings (or accept + document); retest confirms.
5. Redact the report if it names customer data and commit it to
   `docs/security/pentest/2026-<vendor>-<scope>/`. Every High/Critical finding gets a row in
   [registers/risk-register.csv](registers/risk-register.csv) with a due date.

**Done when:** the final report is in `docs/security/pentest/` and every High+ finding is
either fixed or has an accepted-risk row with executive signature and expiry.

---

## 10. First quarterly access review (2 hours)

Prerequisite: §1.

1. Open [registers/access-review.csv](registers/access-review.csv).
2. For each row, confirm the person / service account is still active, still needs the
   permissions, and still has MFA. Update `mfa_confirmed`, `reviewer`, `decision_keep_change_remove`,
   `completion_date`.
3. Remove any access marked `Remove` — do this the same day.
4. Any account that fails MFA verification: enroll MFA before end of business, or suspend.
5. Commit.

**Done when:** every row has a completion date in the current quarter.

---

## 11. First backup + restore drill (2 hours)

Prerequisite: §1.

1. Follow [rto-rpo.md](rto-rpo.md) §Restore drills.
2. In a scratch AWS account (or a scratch VPC in prod if you don't have one), run:
   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier docubite-postgres \
     --target-db-instance-identifier docubite-pitr-drill \
     --restore-time <5 minutes ago in ISO8601>
   ```
3. Point a scratch app instance at the restored DB. Verify a known document renders
   correctly.
4. Time everything. Compare against the RTO/RPO targets. If you missed them, file a risk
   register row.
5. Tear down the scratch instance.
6. Record the result in
   [quarterly-security-review/2026-Q3.md](quarterly-security-review/2026-Q3.md) under
   "First backup + restore drill".

**Done when:** the QSR row shows a completed drill with actual RTO and RPO measurements.

---

## 12. Ongoing (quarterly)

Once §1–§11 are done, the ongoing rhythm is small:

- **Weekly** — glance at GuardDuty findings + Sentry error volume.
- **Monthly** — Dependabot / Trivy findings triage.
- **Quarterly** — run one QSR (copy `quarterly-security-review/2026-Q3.md` to `-Q4.md`); one
  access review; one supplier register refresh.
- **Semi-annual** — one tabletop.
- **Annual** — one pentest; one full policy review; one BC/DR drill.

Each of these is one afternoon of work. Skipping the QSR is what turns a Tier-3 program back
into a Tier-1 program silently — do not skip.

---

## Cross-reference

Every step above closes a specific row in the 2026-09-10 gap assessment. When re-running the
assessment (yourself or a third party), map the evidence like this:

| Step | CSF | Evidence |
|---|---|---|
| §1 | GV.RR | roles-raci.md filled in; CODEOWNERS active |
| §2 | GV.PO-01 | POLICY-SET.md sign-off + acknowledgement CSV |
| §3 | PR.PS-05 | curl 200; container boots |
| §4 | PR.AA-05 | verify-rls-live.ts output committed |
| §5 | GV.SC | supplier-register.csv rows complete |
| §6 | DE.CM | alerts.tf; test alert received |
| §7 | RS.MA | incident-response-plan.md communication tree named |
| §8 | RS.MA / RS.CO | tabletop/YYYY-*.md exists |
| §9 | ID.RA-09 | pentest/YYYY-*/report.pdf + fixes |
| §10 | PR.AA | access-review.csv all rows complete |
| §11 | RC.RP-05 | measured RTO/RPO in QSR |
| §12 | GV.OV | successive QSR files |
