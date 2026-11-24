-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FISCAL_DECLARATION_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DAC7_ANNUAL_RECAP_SENT';

-- AlterTable Brand
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;

-- AlterTable Category
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "icon" TEXT;

-- AlterTable Commande
ALTER TABLE "Commande" ADD COLUMN IF NOT EXISTS "discountCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable RepairerProfile
ALTER TABLE "RepairerProfile" ADD COLUMN IF NOT EXISTS "fiscalCompletedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "fiscalReminderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastFiscalReminderAt" TIMESTAMP(3);

-- AlterTable Tip
ALTER TABLE "Tip" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
ADD COLUMN IF NOT EXISTS "linkUrl" TEXT;

-- AlterTable user
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);

-- CreateTable RepairerFiscalDeclaration
CREATE TABLE IF NOT EXISTS "RepairerFiscalDeclaration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxResidence" TEXT NOT NULL DEFAULT 'FR',
    "addressLine" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "nif" TEXT,
    "hasNoNif" BOOLEAN NOT NULL DEFAULT false,
    "birthCity" TEXT,
    "birthCountry" TEXT DEFAULT 'FR',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairerFiscalDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable RepairerFiscalAuditLog
CREATE TABLE IF NOT EXISTS "RepairerFiscalAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairerFiscalAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable RepairerDac7Recap
CREATE TABLE IF NOT EXISTS "RepairerDac7Recap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCents" INTEGER NOT NULL,
    "ordersCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "channel" TEXT NOT NULL DEFAULT 'EMAIL_AND_INAPP',

    CONSTRAINT "RepairerDac7Recap_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "RepairerFiscalDeclaration_userId_key" ON "RepairerFiscalDeclaration"("userId");
CREATE INDEX IF NOT EXISTS "RepairerFiscalAuditLog_userId_changedAt_idx" ON "RepairerFiscalAuditLog"("userId", "changedAt");
CREATE INDEX IF NOT EXISTS "RepairerDac7Recap_taxYear_status_idx" ON "RepairerDac7Recap"("taxYear", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "RepairerDac7Recap_userId_taxYear_key" ON "RepairerDac7Recap"("userId", "taxYear");
CREATE INDEX IF NOT EXISTS "RepairerProfile_fiscalCompletedAt_idx" ON "RepairerProfile"("fiscalCompletedAt");

-- AddForeignKeys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RepairerFiscalDeclaration_userId_fkey') THEN
        ALTER TABLE "RepairerFiscalDeclaration" ADD CONSTRAINT "RepairerFiscalDeclaration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RepairerFiscalAuditLog_userId_fkey') THEN
        ALTER TABLE "RepairerFiscalAuditLog" ADD CONSTRAINT "RepairerFiscalAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RepairerDac7Recap_userId_fkey') THEN
        ALTER TABLE "RepairerDac7Recap" ADD CONSTRAINT "RepairerDac7Recap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE "RepairerFiscalDeclaration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RepairerFiscalAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RepairerDac7Recap" ENABLE ROW LEVEL SECURITY;
