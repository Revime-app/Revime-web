-- CreateEnum
CREATE TYPE "ExecutionDelayPreference" AS ENUM ('IMMEDIATE', 'WAIT_14_DAYS');

-- AlterTable
ALTER TABLE "Commande" ADD COLUMN "executionDelayPreference" "ExecutionDelayPreference" NOT NULL DEFAULT 'IMMEDIATE',
ADD COLUMN "withdrawalWaiverAcceptedAt" TIMESTAMP(3),
ADD COLUMN "withdrawalWaiverText" TEXT,
ADD COLUMN "withdrawalPeriodEndsAt" TIMESTAMP(3);
