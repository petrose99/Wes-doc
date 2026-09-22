-- Bigcapital removed entirely (map #376, ticket #380): its data was demo-only.
-- Drops the auto-provisioning queue and both per-workspace account tables.
DROP TABLE IF EXISTS "integration_provision_jobs";
DROP TABLE IF EXISTS "bigcapital_member_accounts";
DROP TABLE IF EXISTS "bigcapital_accounts";
