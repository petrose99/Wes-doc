# GuardDuty: continuous threat detection on account activity, VPC flow logs, DNS logs, and S3
# data-plane events. Closes DE.CM-03 (personnel activity + technology use monitored) at the
# cloud-account level. No EKS here, so EKS Protection is off.

resource "aws_guardduty_detector" "main" {
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"

  datasources {
    s3_logs { enable = true }
    kubernetes { audit_logs { enable = false } }
    malware_protection { scan_ec2_instance_with_findings { ebs_volumes { enable = true } } }
  }
}
