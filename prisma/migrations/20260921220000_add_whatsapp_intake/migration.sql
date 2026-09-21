-- #372/#374: WhatsApp intake, a second channel beside inbound email.

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "source_whatsapp" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_allowed_senders" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "linked_member_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_allowed_senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_intakes" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "wa_message_id" TEXT NOT NULL,
    "from_number" TEXT NOT NULL,
    "caption" TEXT,
    "attachment_count" INTEGER NOT NULL DEFAULT 0,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_allowed_senders_workspace_id_phone_number_key" ON "whatsapp_allowed_senders"("workspace_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_intakes_wa_message_id_key" ON "whatsapp_intakes"("wa_message_id");

-- CreateIndex
CREATE INDEX "whatsapp_intakes_workspace_id_created_at_idx" ON "whatsapp_intakes"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_intakes_workspace_id_outcome_idx" ON "whatsapp_intakes"("workspace_id", "outcome");

-- AddForeignKey
ALTER TABLE "whatsapp_allowed_senders" ADD CONSTRAINT "whatsapp_allowed_senders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_allowed_senders" ADD CONSTRAINT "whatsapp_allowed_senders_linked_member_id_fkey" FOREIGN KEY ("linked_member_id") REFERENCES "workspace_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_allowed_senders" ADD CONSTRAINT "whatsapp_allowed_senders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_intakes" ADD CONSTRAINT "whatsapp_intakes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
