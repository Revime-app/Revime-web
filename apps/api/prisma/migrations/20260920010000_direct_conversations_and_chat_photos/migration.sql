-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "demandeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "photoPath" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_client_repairer_direct_unique" ON "Conversation"("clientUserId", "repairerUserId") WHERE "demandeId" IS NULL;
