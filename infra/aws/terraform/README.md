# DocuBite AWS Terraform

Production baseline for the AWS side of DocuBite. The Lightsail VPS at `16.60.212.8` is still the
primary production host; this Terraform describes the target state we are migrating to and is
already the authoritative source for the Fargate worker, S3 document storage, KMS, RDS, and
the security-monitoring baseline (CloudTrail, GuardDuty, Config, Flow Logs, WAF).

## Files

- `main.tf` — KMS, S3 documents (with versioning, access logs, and audit-archives lifecycle),
  IAM for the Fargate worker, ECS cluster + task + service.
- `rds.tf` — Postgres 17 with pgvector, Multi-AZ, deletion protection.
- `cloudtrail.tf` — Multi-region trail into an Object-Locked bucket.
- `guardduty.tf` — Threat detection.
- `aws_config.tf` — Configuration recorder + CIS conformance pack.
- `vpc_flow_logs.tf` — All-traffic flow logs into CloudWatch.
- `waf.tf` — WAFv2 web ACL (AWS managed rules + IP reputation + rate limit).
- `variables.tf`, `outputs.tf`, `versions.tf` — inputs, outputs, providers.
- `prod.tfvars` — production variable values. `REPLACE_*` placeholders are filled in by the
  deploy pipeline (SSM / Terraform Cloud) at plan time; do NOT commit real ARNs.

## Running

Every plan and apply MUST use `prod.tfvars` — the file exists to make
`database_multi_az = true` and `database_deletion_protection = true` load-bearing per environment,
so a plan without it would draw on the variable defaults and could drift silently.

```
cd infra/aws/terraform
# Fill placeholders from SSM into a local prod.tfvars.rendered (do NOT commit the rendered file).
./render-prod-tfvars.sh > prod.tfvars.rendered   # example, not shipped
terraform init
terraform plan  -var-file=prod.tfvars.rendered -out=plan.tfout
# Human review of plan.tfout.
terraform apply plan.tfout
```

The `render-prod-tfvars.sh` step is expected to be a small script in your deploy pipeline that
substitutes the `REPLACE_*` strings with values from AWS Secrets Manager or Terraform Cloud
variables. It exists so nobody commits a real ARN to git.

## What the security-monitoring resources produce

| Resource | Signal | Destination |
|---|---|---|
| CloudTrail | Every API call in every region | S3 (Object Lock) |
| GuardDuty | Threat findings (compromised keys, unusual API activity, malware) | AWS Console + EventBridge |
| AWS Config | Continuous resource-state snapshots against CIS rules | S3 + Config Console |
| VPC Flow Logs | 5-tuple + accept/reject for every ENI | CloudWatch Logs |
| WAFv2 | Blocked requests + rule triggers | CloudWatch metrics |

None of these have alerting wired up here — that is a Phase-4 item (choose a SIEM /
notification target) and depends on a human decision about where alerts should land (see
`docs/security/POLICY-SET.md` §5).

## Framework mapping

Closes the code-side portion of items 9 and 10 of the 2026-09-10 NIST CSF 2.0 gap assessment.
