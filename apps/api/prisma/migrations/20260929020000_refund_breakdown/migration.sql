-- CF4-D, task 1 (spec §2, §5). Flexible refunds: the admin chooses repair, shipping
-- and protection amounts separately, with a motif category recorded alongside the
-- existing free-text `refundReason`. Four new nullable columns rather than a side
-- table: a refund breakdown belongs to exactly one commande and never changes once
-- written, the same shape `refundedCents` already has.
--
-- ALTER TYPE ... ADD VALUE may not have its new value USED in the same transaction, and
-- Prisma runs this file in one. Nothing here uses 'COMMANDE_PARTIALLY_REFUNDED', so the
-- constraint is met.

-- CreateEnum
CREATE TYPE "RefundMotif" AS ENUM ('CLIENT_CANCELLED', 'REPAIRER_CANCELLED', 'REPAIR_NOT_DONE', 'REPAIR_NONCONFORMING', 'PARCEL_LOST_OR_DAMAGED', 'DISPUTE_DECISION', 'OTHER');

-- AlterTable
ALTER TABLE "Commande" ADD COLUMN "refundRepairCents" INTEGER,
ADD COLUMN "refundShippingCents" INTEGER,
ADD COLUMN "refundProtectionCents" INTEGER,
ADD COLUMN "refundMotif" "RefundMotif";

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMANDE_PARTIALLY_REFUNDED';
