# VPC Flow Logs: 5-tuple + accept/reject/action for every ENI in the app VPC. Ships to
# CloudWatch so alerts can trigger on unexpected egress or connection floods. Closes DE.CM-01.
#
# `vpc_id` is looked up from one of the subnets — the app owns a single VPC in these plans, so
# every subnet in var.vpc_subnet_ids belongs to the same VPC and this data-source is unambiguous.

data "aws_subnet" "first" {
  id = var.vpc_subnet_ids[0]
}

resource "aws_cloudwatch_log_group" "vpc_flow" {
  name              = "/vpc/${var.name}/flow-logs"
  retention_in_days = 90
}

resource "aws_iam_role" "vpc_flow" {
  name_prefix = "${var.name}-vpc-flow-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "vpc_flow" {
  role = aws_iam_role.vpc_flow.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup", "logs:CreateLogStream",
        "logs:PutLogEvents", "logs:DescribeLogGroups", "logs:DescribeLogStreams",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_flow_log" "vpc" {
  vpc_id                   = data.aws_subnet.first.vpc_id
  log_destination_type     = "cloud-watch-logs"
  log_destination          = aws_cloudwatch_log_group.vpc_flow.arn
  iam_role_arn             = aws_iam_role.vpc_flow.arn
  traffic_type             = "ALL"
  max_aggregation_interval = 60
}
