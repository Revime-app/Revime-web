-- CF4-J+K (spec §4.1). Disputes from the app, REVIME spaces, documents, sound channel.
-- Additive only: no UPDATE, DELETE, DROP.

-- CreateEnum
CREATE TYPE "DisputeMotif" AS ENUM ('REPAIR_NON_CONFORMING', 'ITEM_DAMAGED', 'REPAIR_INCOMPLETE', 'DEADLINE_MISSED', 'CLIENT_UNREACHABLE', 'ITEM_NOT_AS_DESCRIBED', 'ITEM_NOT_HANDED_OVER', 'SERVICE_DISAGREEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeSpace" AS ENUM ('CLIENT', 'REPAIRER');

-- CreateEnum
CREATE TYPE "DisputeMessageAuthor" AS ENUM ('PARTY', 'REVIME');

-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'SUPPORT';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DISPUTE_MESSAGE';

-- AlterTable Dispute: add number, motif, and read markers
ALTER TABLE "Dispute" ADD COLUMN "number" SERIAL NOT NULL;
ALTER TABLE "Dispute" ADD COLUMN "motif" "DisputeMotif";
ALTER TABLE "Dispute" ADD COLUMN "clientLastReadAt" TIMESTAMP(3);
ALTER TABLE "Dispute" ADD COLUMN "repairerLastReadAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_number_key" ON "Dispute"("number");

-- AlterTable Message: add document fields
ALTER TABLE "Message" ADD COLUMN "documentPath" TEXT;
ALTER TABLE "Message" ADD COLUMN "documentName" TEXT;
ALTER TABLE "Message" ADD COLUMN "documentSizeBytes" INTEGER;

-- AlterTable PushToken: add soundChannel
ALTER TABLE "PushToken" ADD COLUMN "soundChannel" TEXT;

-- CreateTable DisputeMessage
CREATE TABLE "DisputeMessage" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "space" "DisputeSpace" NOT NULL,
    "author" "DisputeMessageAuthor" NOT NULL,
    "senderUserId" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "photoPath" TEXT,
    "documentPath" TEXT,
    "documentName" TEXT,
    "documentSizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DisputeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisputeMessage_disputeId_space_createdAt_idx" ON "DisputeMessage"("disputeId", "space", "createdAt");

-- AddForeignKey
ALTER TABLE "DisputeMessage" ADD CONSTRAINT "DisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
