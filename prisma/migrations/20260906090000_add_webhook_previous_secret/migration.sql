-- A9.7: dual-active secrets for outbound webhook signing during a rotation window.
ALTER TABLE "webhook_endpoints" ADD COLUMN "previous_secret_enc" TEXT;
ALTER TABLE "webhook_endpoints" ADD COLUMN "previous_secret_rotated_at" TIMESTAMP(3);
