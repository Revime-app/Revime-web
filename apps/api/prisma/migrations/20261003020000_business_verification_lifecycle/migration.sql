-- CF5-07: Business verification lifecycle and document metadata.
-- Design: docs/superpowers/specs/2026-10-03-cf5-07-business-verification-full-flow-design.md

-- CreateEnum
CREATE TYPE "BusinessVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DOCUMENTS_REQUIRED');

-- CreateEnum
CREATE TYPE "BusinessDecisionMotif" AS ENUM ('DIRIGEANT_MISMATCH', 'DOCUMENT_EXPIRED', 'DOCUMENT_ILLEGIBLE', 'INVALID_SIRET', 'INCORRECT_ADDRESS', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BUSINESS_VERIFIED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BUSINESS_REFUSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BUSINESS_DOCUMENTS_REQUIRED';

-- AlterTable
ALTER TABLE "BusinessVerification"
  ADD COLUMN "status" "BusinessVerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "legalForm" VARCHAR(100) NOT NULL DEFAULT 'Autre',
  ADD COLUMN "vatNumber" VARCHAR(50),
  ADD COLUMN "dirigeantName" VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN "registrationProofPath" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "registrationProofName" VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN "registrationProofSizeBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "insuranceProofPath" TEXT,
  ADD COLUMN "insuranceProofName" VARCHAR(255),
  ADD COLUMN "insuranceProofSizeBytes" INTEGER,
  ADD COLUMN "decisionMotif" "BusinessDecisionMotif",
  ADD COLUMN "decisionNote" TEXT,
  ADD COLUMN "decidedAt" TIMESTAMPTZ(6),
  ADD COLUMN "decidedByUserId" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "BusinessVerification" DROP COLUMN IF EXISTS "legalFormCode";

UPDATE "BusinessVerification" SET "denomination" = '' WHERE "denomination" IS NULL;
UPDATE "BusinessVerification" SET "establishmentAddress" = '' WHERE "establishmentAddress" IS NULL;

ALTER TABLE "BusinessVerification"
  ALTER COLUMN "siren" TYPE VARCHAR(9),
  ALTER COLUMN "siret" TYPE VARCHAR(14),
  ALTER COLUMN "denomination" TYPE VARCHAR(255),
  ALTER COLUMN "denomination" SET NOT NULL,
  ALTER COLUMN "establishmentAddress" SET NOT NULL,
  ALTER COLUMN "etatAdministratif" DROP NOT NULL,
  ALTER COLUMN "etatAdministratif" SET DEFAULT 'A',
  ALTER COLUMN "diffusible" SET DEFAULT true,
  ALTER COLUMN "dirigeants" DROP NOT NULL,
  ALTER COLUMN "verifiedAt" DROP NOT NULL,
  ALTER COLUMN "verifiedAt" TYPE TIMESTAMPTZ(6) USING "verifiedAt"::TIMESTAMPTZ(6),
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt"::TIMESTAMPTZ(6),
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt"::TIMESTAMPTZ(6);

ALTER TABLE "BusinessVerification"
  ALTER COLUMN "legalForm" DROP DEFAULT,
  ALTER COLUMN "dirigeantName" DROP DEFAULT,
  ALTER COLUMN "registrationProofPath" DROP DEFAULT,
  ALTER COLUMN "registrationProofName" DROP DEFAULT,
  ALTER COLUMN "registrationProofSizeBytes" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "BusinessVerification_status_submittedAt_idx" ON "BusinessVerification"("status", "submittedAt");
CREATE INDEX "BusinessVerification_siren_idx" ON "BusinessVerification"("siren");
