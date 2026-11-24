-- CreateEnum
CREATE TYPE "CommandeRole" AS ENUM ('CLIENT', 'REPAIRER');

-- AlterEnum
-- Two legs, so the lifecycle gains a return shipment. P3 shipped seven parcel
-- steps and none of them was the device going back to the client. They sit
-- BEFORE AWAITING_VALIDATION deliberately: the client must hold the repaired
-- device before he is asked to release funds.
--
-- `AFTER` is a deliberate divergence from what `migrate diff` generates, which
-- plainly APPENDS both values and would leave the physical enum order reading
-- ... AWAITING_VALIDATION, RELEASED, RETURN_SENT, RETURN_RECEIVED. Nothing in
-- this codebase orders by this enum -- sequence comes from `stepsFor()` in
-- TypeScript -- so appending is harmless today. It is positioned anyway, because
-- an enum whose physical order contradicts its semantic order is a latent trap
-- for the first `ORDER BY "step"` anyone writes, and unreachable-but-wrong is a
-- class of defect this project has recorded more than once.
--
-- ALTER TYPE ... ADD VALUE may not have its new value USED in the same
-- transaction, and Prisma runs each migration file in one. This migration needs
-- no backfill -- Commande and Offer both held 0 rows, re-verified against the
-- live database immediately before applying -- so nothing uses the new values
-- here and there is no conflict.
ALTER TYPE "CommandeStep" ADD VALUE 'RETURN_SENT' AFTER 'REPAIR_DONE';
ALTER TYPE "CommandeStep" ADD VALUE 'RETURN_RECEIVED' AFTER 'RETURN_SENT';

-- AlterTable
-- Nullable with no default: a commande has no tracking number until the operator
-- buys the labels. Deliberately NOT unique -- a carrier number is unique in the
-- carrier's namespace, not ours.
ALTER TABLE "Commande" ADD COLUMN     "outboundTrackingNumber" TEXT,
ADD COLUMN     "returnTrackingNumber" TEXT;

-- AlterTable
-- DEFAULT false is the fail-safe: an offer that says nothing offers no parcel.
-- This is what keeps « Envoi par colis » unselectable until a reparateur opts in,
-- which survives PAYMENTS_ENABLED being flipped in a way the flag does not.
ALTER TABLE "Offer" ADD COLUMN     "acceptsParcel" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShippingAddress" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "role" "CommandeRole" NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Each party supplies their own, once. A database rule rather than a convention.
CREATE UNIQUE INDEX "ShippingAddress_commandeId_role_key" ON "ShippingAddress"("commandeId", "role");

-- CreateIndex
CREATE INDEX "ShippingAddress_commandeId_idx" ON "ShippingAddress"("commandeId");

-- AddForeignKey
ALTER TABLE "ShippingAddress" ADD CONSTRAINT "ShippingAddress_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all row level security, this project's backstop against the anon REST
-- surface. A new table does NOT inherit it and Prisma never emits it, so it is
-- stated explicitly here. No policy, deliberately: nothing may be reachable.
ALTER TABLE "ShippingAddress" ENABLE ROW LEVEL SECURITY;
