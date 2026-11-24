-- CreateEnum
CREATE TYPE "DemandeMode" AS ENUM ('OFFERS', 'BUDGET');

-- CreateEnum
CREATE TYPE "DemandeStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartsPreference" AS ENUM ('UNKNOWN', 'ORIGINAL', 'COMPATIBLE', 'CLIENT_SUPPLIED');

-- CreateTable
CREATE TABLE "Demande" (
    "id" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parts" "PartsPreference" NOT NULL DEFAULT 'UNKNOWN',
    "mode" "DemandeMode" NOT NULL DEFAULT 'OFFERS',
    "budgetCents" INTEGER,
    "locationLabel" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "status" "DemandeStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Demande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandePhoto" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DemandePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Demande_deletedAt_idx" ON "Demande"("deletedAt");

-- CreateIndex
CREATE INDEX "Demande_status_categoryId_idx" ON "Demande"("status", "categoryId");

-- CreateIndex
CREATE INDEX "Demande_authorUserId_idx" ON "Demande"("authorUserId");

-- CreateIndex
CREATE INDEX "DemandePhoto_demandeId_idx" ON "DemandePhoto"("demandeId");

-- AddForeignKey
ALTER TABLE "Demande" ADD CONSTRAINT "Demande_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demande" ADD CONSTRAINT "Demande_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandePhoto" ADD CONSTRAINT "DemandePhoto_demandeId_fkey"
  FOREIGN KEY ("demandeId") REFERENCES "Demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all RLS backstop, per 20260728022124_enable_rls_identity.
ALTER TABLE "Demande" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DemandePhoto" ENABLE ROW LEVEL SECURITY;
