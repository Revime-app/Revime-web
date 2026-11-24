-- AlterTable
ALTER TABLE "user" ADD COLUMN "cguAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cguAcceptedAt" TIMESTAMP(3),
ADD COLUMN "cguVersion" TEXT,
ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN "marketingConsentEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "marketingConsentSms" BOOLEAN NOT NULL DEFAULT false;
