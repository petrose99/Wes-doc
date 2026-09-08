-- AlterTable: a reviewer's paid/unpaid confirmation for a document, gathered at review time —
-- see Document.paymentStatus in prisma/schema.prisma for why this is distinct from
-- LedgerTransaction.payment_status (the provider's own answer, for a document already pushed).
ALTER TABLE "documents" ADD COLUMN "payment_status" TEXT;
ALTER TABLE "documents" ADD COLUMN "payment_confirmed_at" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN "payment_confirmed_by_id" UUID;

ALTER TABLE "documents" ADD CONSTRAINT "documents_payment_confirmed_by_id_fkey" FOREIGN KEY ("payment_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
