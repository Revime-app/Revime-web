-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED');

-- CreateEnum
CREATE TYPE "DisputeInitiator" AS ENUM ('CLIENT', 'REPAIRER', 'ADMIN', 'STRIPE');

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "initiator" "DisputeInitiator" NOT NULL DEFAULT 'ADMIN',
    "openedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "evidencePhotos" JSONB,
    "assignedToUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "verdict" TEXT,
    "resolutionNote" TEXT,
    "adminNotes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_commandeId_key" ON "Dispute"("commandeId");

-- CreateIndex
CREATE INDEX "Dispute_status_createdAt_idx" ON "Dispute"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Dispute_assignedToUserId_status_idx" ON "Dispute"("assignedToUserId", "status");

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;
