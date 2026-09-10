# Production variable values. Commits the intent to run prod with Multi-AZ and deletion protection
# on the RDS instance. Secrets stay OUT of this file: ARNs are populated by a separate deploy
# process (SSM Parameter Store / Terraform Cloud variables) and referenced here by placeholder
# values that must be replaced at plan time by CI, never committed as real ARNs.

aws_region = "eu-west-1"
name       = "docubite"

# Container image is stamped by the release pipeline; keep the placeholder here so a raw
# `terraform plan` against this file cannot accidentally pick up a stale tag.
worker_image = "REPLACE_WITH_RELEASE_IMAGE_TAG"

# Secrets Manager ARNs — resolved from CI at plan/apply time. Leaving as REPLACE_* means a plan
# run without the substitution errors clearly instead of silently pointing at a wrong secret.
database_url_secret_arn        = "REPLACE_WITH_DATABASE_URL_SECRET_ARN"
openai_api_key_secret_arn      = "REPLACE_WITH_OPENAI_API_KEY_SECRET_ARN"
internal_worker_secret_arn     = "REPLACE_WITH_INTERNAL_WORKER_SECRET_ARN"
mineru_api_token_secret_arn    = "REPLACE_WITH_MINERU_API_TOKEN_SECRET_ARN"
embeddings_api_key_secret_arn  = "REPLACE_WITH_EMBEDDINGS_API_KEY_SECRET_ARN"

# Private malware scanner endpoint (see lib/malware-scan.ts + verify-production-config.ts).
# The web + worker refuse to boot without this in production.
malware_scan_url = "https://REPLACE_WITH_INTERNAL_SCANNER_HOST/scan"

# Network topology — populated per environment. Kept as placeholders here rather than defaults
# in variables.tf so the intent is visible in one file.
vpc_subnet_ids              = ["REPLACE_WITH_SUBNET_1", "REPLACE_WITH_SUBNET_2"]
worker_security_group_ids   = ["REPLACE_WITH_WORKER_SG"]
database_subnet_ids         = ["REPLACE_WITH_DB_SUBNET_1", "REPLACE_WITH_DB_SUBNET_2"]
database_security_group_ids = ["REPLACE_WITH_DB_SG"]

# --- Data-plane defence-in-depth: explicit for prod even though variables.tf defaults to true.
# Documenting them here means a future variables.tf edit cannot silently downgrade prod.
database_multi_az            = true
database_deletion_protection = true
database_skip_final_snapshot = false

# Instance sizing.
database_instance_class          = "db.t4g.medium"
database_engine_version          = "17.2"
database_allocated_storage_gb    = 20
database_max_allocated_storage_gb = 100
