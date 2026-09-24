-- #430: "Leave them" — per-document, per-old-account dismissal of the posted-bill Account
-- correction reminder (Screen 1 dialog / Screen 3 rule-row line).
ALTER TABLE "documents" ADD COLUMN "account_correction_dismissed_at" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN "account_correction_dismissed_from_account_id" TEXT;
