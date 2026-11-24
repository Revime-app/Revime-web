-- AlterTable
ALTER TABLE "ConversationReport" ADD COLUMN "assignedToUserId" TEXT;
ALTER TABLE "ConversationReport" ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "ConversationReport" ADD COLUMN "resolvedByUserId" TEXT;
ALTER TABLE "ConversationReport" ADD COLUMN "resolutionVerdict" TEXT;
ALTER TABLE "ConversationReport" ADD COLUMN "resolutionNote" TEXT;

-- CreateIndex
CREATE INDEX "ConversationReport_assignedToUserId_resolvedAt_idx" ON "ConversationReport"("assignedToUserId", "resolvedAt");
