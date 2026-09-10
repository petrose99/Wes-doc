resource "aws_kms_key" "documents" {
  description             = "${var.name} document-inbox encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_s3_bucket" "documents" {
  bucket_prefix = "${var.name}-documents-"
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id
  block_public_acls = true
  block_public_policy = true
  ignore_public_acls = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" kms_master_key_id = aws_kms_key.documents.arn } }
}

# Versioning: guards against a lost object from a bad delete or overwrite. Required alongside
# Object Lock for audit-archives/ retention.
resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration { status = "Enabled" }
}

# Access logs: every object-level access on the documents bucket is written to a separate
# access-log bucket. Closes DE.CM-01 for the data plane.
resource "aws_s3_bucket" "documents_access_logs" {
  bucket_prefix = "${var.name}-documents-access-logs-"
}

resource "aws_s3_bucket_public_access_block" "documents_access_logs" {
  bucket                  = aws_s3_bucket.documents_access_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents_access_logs" {
  bucket = aws_s3_bucket.documents_access_logs.id
  rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
}

resource "aws_s3_bucket_logging" "documents" {
  bucket        = aws_s3_bucket.documents.id
  target_bucket = aws_s3_bucket.documents_access_logs.id
  target_prefix = "documents/"
}

# Lifecycle: audit-archives/ prefix retains for 6 years then transitions to Glacier, matching
# HIPAA §164.316(b)(2)(i) and the audit retention in docs/security/registers/data-inventory.csv.
resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "audit-archives-retention"
    status = "Enabled"
    filter { prefix = "audit-archives/" }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 365
      storage_class = "GLACIER"
    }
    expiration {
      days = 2190 # 6 years
    }
    noncurrent_version_expiration {
      noncurrent_days = 2190
    }
  }

  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_iam_role" "worker" {
  name_prefix = "${var.name}-worker-"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "worker_execution" {
  role = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "worker" {
  role = aws_iam_role.worker.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.documents.arn}/*" },
    { Effect = "Allow", Action = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"], Resource = aws_kms_key.documents.arn },
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [var.database_url_secret_arn, var.openai_api_key_secret_arn, var.internal_worker_secret_arn, var.mineru_api_token_secret_arn, var.embeddings_api_key_secret_arn] }
  ] })
}

resource "aws_cloudwatch_log_group" "worker" {
  name = "/ecs/${var.name}-worker"
  retention_in_days = 30
}
resource "aws_ecs_cluster" "main" {
  name = "${var.name}-cluster"
}

locals {
  worker_environment = [
    { name = "NODE_ENV", value = "production" }, { name = "AWS_REGION", value = var.aws_region },
    { name = "STORAGE_BUCKET", value = aws_s3_bucket.documents.id }, { name = "STORAGE_KMS_KEY_ID", value = aws_kms_key.documents.arn },
    { name = "MALWARE_SCAN_URL", value = var.malware_scan_url },
    # Semantic-search (RAG) embedding config. The worker runs the embed jobs, so it needs the same
    # EMBEDDINGS_* the web app has. Non-secret settings here; the token is a secret below. These
    # must match what is set on Vercel, or the two halves disagree about whether the feature is on.
    { name = "EMBEDDINGS_FORMAT", value = "huggingface" },
    { name = "EMBEDDINGS_BASE_URL", value = "https://router.huggingface.co/hf-inference" },
    { name = "EMBEDDINGS_MODEL_NAME", value = "nomic-ai/nomic-embed-text-v1" }
  ]
  worker_secrets = [
    { name = "DATABASE_URL", valueFrom = var.database_url_secret_arn }, { name = "OPENAI_API_KEY", valueFrom = var.openai_api_key_secret_arn },
    { name = "INTERNAL_WORKER_SECRET", valueFrom = var.internal_worker_secret_arn },
    { name = "MINERU_API_TOKEN", valueFrom = var.mineru_api_token_secret_arn },
    { name = "EMBEDDINGS_API_KEY", valueFrom = var.embeddings_api_key_secret_arn }
  ]
}
resource "aws_ecs_task_definition" "worker" {
  family = "${var.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode = "awsvpc"
  cpu = 512
  memory = 1024
  execution_role_arn = aws_iam_role.worker.arn
  task_role_arn = aws_iam_role.worker.arn
  container_definitions = jsonencode([{ name = "worker", image = var.worker_image, essential = true, command = ["npx", "tsx", "worker/job-worker.ts"], environment = local.worker_environment, secrets = local.worker_secrets, logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.worker.name, awslogs-region = var.aws_region, awslogs-stream-prefix = "worker" } } }])
}
resource "aws_ecs_service" "worker" {
  name = "${var.name}-worker"
  cluster = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count = 1
  launch_type = "FARGATE"
  network_configuration {
    subnets = var.vpc_subnet_ids
    security_groups = var.worker_security_group_ids
    assign_public_ip = false
  }
}
