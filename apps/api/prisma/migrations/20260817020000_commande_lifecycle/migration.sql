-- CreateEnum
CREATE TYPE "CommandeStep" AS ENUM ('PAID', 'PARCEL_SENT', 'PARCEL_RECEIVED', 'REPAIR_STARTED', 'REPAIR_DONE', 'AWAITING_VALIDATION', 'RELEASED');

-- AlterTable
ALTER TABLE "Commande" ADD COLUMN     "releaseRequestedAt" TIMESTAMP(3),
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "step" "CommandeStep",
ADD COLUMN     "stripeTransferId" TEXT,
ADD COLUMN     "transferredCents" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Commande_stripeTransferId_key" ON "Commande"("stripeTransferId");

-- Backfill any already-paid commande onto the lifecycle's first step.
-- Free exactly once, and this is that moment: Commande held 0 rows when this
-- migration was authored, confirmed by reading the table rather than assuming.
-- Deliberately NOT a column default -- a default would make every
-- PENDING_PAYMENT and ABANDONED row claim to have been paid.
UPDATE "Commande" SET "step" = 'PAID' WHERE "status" = 'PAID';
