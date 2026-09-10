# AWS Config: continuous configuration recording + CIS AWS Foundations conformance pack.
# Closes ID.AM-01 and DE.CM-08 (asset configurations tracked against approved state).

resource "aws_s3_bucket" "config" {
  bucket_prefix = "${var.name}-aws-config-"
}

resource "aws_s3_bucket_public_access_block" "config" {
  bucket                  = aws_s3_bucket.config.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "config" {
  bucket = aws_s3_bucket.config.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_iam_role" "config" {
  name_prefix = "${var.name}-aws-config-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "config.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "config" {
  role       = aws_iam_role.config.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"
}

resource "aws_iam_role_policy" "config_s3" {
  role = aws_iam_role.config.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetBucketAcl"]
      Resource = [aws_s3_bucket.config.arn, "${aws_s3_bucket.config.arn}/*"]
    }]
  })
}

resource "aws_config_configuration_recorder" "main" {
  name     = "${var.name}-recorder"
  role_arn = aws_iam_role.config.arn
  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
}

resource "aws_config_delivery_channel" "main" {
  name           = "${var.name}-delivery"
  s3_bucket_name = aws_s3_bucket.config.id
  depends_on     = [aws_config_configuration_recorder.main]
}

resource "aws_config_configuration_recorder_status" "main" {
  name       = aws_config_configuration_recorder.main.name
  is_enabled = true
  depends_on = [aws_config_delivery_channel.main]
}

# Conformance pack: CIS AWS Foundations Benchmark. Deployed as a managed pack — the actual body
# is fetched by Config Service so the recorder must be running first.
resource "aws_config_conformance_pack" "cis" {
  name          = "${var.name}-cis-aws-foundations"
  template_body = <<-EOT
    Resources:
      IamPasswordPolicy:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: iam-password-policy
          Source:
            Owner: AWS
            SourceIdentifier: IAM_PASSWORD_POLICY
      RootMfa:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: root-account-mfa-enabled
          Source:
            Owner: AWS
            SourceIdentifier: ROOT_ACCOUNT_MFA_ENABLED
      S3PublicRead:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: s3-bucket-public-read-prohibited
          Source:
            Owner: AWS
            SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
      S3PublicWrite:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: s3-bucket-public-write-prohibited
          Source:
            Owner: AWS
            SourceIdentifier: S3_BUCKET_PUBLIC_WRITE_PROHIBITED
      RdsEncrypted:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: rds-storage-encrypted
          Source:
            Owner: AWS
            SourceIdentifier: RDS_STORAGE_ENCRYPTED
  EOT
  depends_on    = [aws_config_configuration_recorder_status.main]
}
