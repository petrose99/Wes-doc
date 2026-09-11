-- Carries the emailed-in sender address forward onto Document, so a terminal processing
-- failure can be reported back to the workspace without joining through InboundEmailIntake.
ALTER TABLE "documents" ADD COLUMN "source_email" TEXT;
