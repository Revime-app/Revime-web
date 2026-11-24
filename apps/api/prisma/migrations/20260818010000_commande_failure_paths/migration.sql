-- AlterEnum
-- APPENDED with no AFTER clause, and that is a deliberate difference from
-- 20260817030000_commande_parcel. A CommandeStep is an ordered SEQUENCE, so its
-- physical order was positioned to match its semantic order. A CommandeStatus is
-- a SET -- a disposition -- so enumsortorder carries no meaning here and nothing
-- can drift. See the P5 spec §4.1.
--
-- ALTER TYPE ... ADD VALUE may not have its new value USED in the same
-- transaction, and Prisma runs each migration file in one. Nothing below uses
-- 'REFUNDED', and Commande holds 0 rows in production -- re-verify that
-- immediately before applying -- so there is no backfill and no conflict.
ALTER TYPE "CommandeStatus" ADD VALUE 'REFUNDED';

-- AlterTable
-- All nullable with no default. Null means "this has not happened", exactly as
-- paidAt and releasedAt already do.
ALTER TABLE "Commande" ADD COLUMN     "returnSentAt" TIMESTAMP(3),
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedCents" INTEGER,
ADD COLUMN     "stripeRefundId" TEXT,
ADD COLUMN     "reversedCents" INTEGER,
ADD COLUMN     "stripeTransferReversalId" TEXT,
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "refundedByUserId" TEXT,
ADD COLUMN     "refundReason" TEXT;

-- CreateIndex
-- The durable double-refund and double-reversal guards. Idempotency keys expire
-- after 24 hours; these do not.
CREATE UNIQUE INDEX "Commande_stripeRefundId_key" ON "Commande"("stripeRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "Commande_stripeTransferReversalId_key" ON "Commande"("stripeTransferReversalId");

-- No new table, so no ENABLE ROW LEVEL SECURITY statement is needed here. Stated
-- rather than left silent, because this project's standing rule is that every new
-- table's migration must enable it and Prisma never emits it.
