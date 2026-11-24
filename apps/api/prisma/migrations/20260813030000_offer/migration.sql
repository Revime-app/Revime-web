-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('WORKSHOP', 'HOME');

-- AlterTable
ALTER TABLE "RepairerProfile" ADD COLUMN "postalCode" TEXT,
                              ADD COLUMN "lat" DOUBLE PRECISION,
                              ADD COLUMN "lng" DOUBLE PRECISION,
                              ADD COLUMN "serviceAreaLabel" TEXT;

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "repairerUserId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "delayHours" INTEGER NOT NULL,
    "warrantyLabel" TEXT NOT NULL,
    "partsLabel" TEXT NOT NULL,
    "travel" "TravelMode" NOT NULL DEFAULT 'WORKSHOP',
    "comment" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_demandeId_repairerUserId_key" ON "Offer"("demandeId", "repairerUserId");

-- CreateIndex
CREATE INDEX "Offer_deletedAt_idx" ON "Offer"("deletedAt");

-- CreateIndex
CREATE INDEX "Offer_repairerUserId_idx" ON "Offer"("repairerUserId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_demandeId_fkey"
  FOREIGN KEY ("demandeId") REFERENCES "Demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_repairerUserId_fkey"
  FOREIGN KEY ("repairerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all RLS backstop, per 20260728022124_enable_rls_identity.
ALTER TABLE "Offer" ENABLE ROW LEVEL SECURITY;
