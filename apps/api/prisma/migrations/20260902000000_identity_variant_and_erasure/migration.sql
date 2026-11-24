-- Slice 19. The two code halves of `render.yaml`'s CONNECT_ENABLED condition (c): a
-- non-biometric document-only verification route, and a user-facing erasure route.
--
-- ✅ NO BACKFILL, and this was MEASURED rather than assumed. On 2026-09-02 the production
-- `IdentityVerification` table held exactly ONE row, and `require_matching_selfie: true` has
-- been hard-coded in `StripeIdentityGateway.createSession` for every session this codebase has
-- ever created -- so DEFAULT 'DOCUMENT_AND_SELFIE' is correct for that row by construction.
-- The other three columns are nullable and need none.
--
-- Purely additive. No existing value is rewritten and no table is created, so there is no RLS
-- statement here: `IdentityVerification` already has it from the migration that created it.

-- CreateEnum
CREATE TYPE "IdentityVariant" AS ENUM ('DOCUMENT_AND_SELFIE', 'DOCUMENT_ONLY');

-- CreateEnum. THREE values: 'validated' is in the installed SDK's Redaction.Status union and
-- absent from Stripe's prose documentation. Omitting it would make a real Stripe value
-- unrepresentable.
CREATE TYPE "RedactionStatus" AS ENUM ('PROCESSING', 'VALIDATED', 'REDACTED');

-- AlterTable
ALTER TABLE "IdentityVerification"
  ADD COLUMN "variant"             "IdentityVariant" NOT NULL DEFAULT 'DOCUMENT_AND_SELFIE',
  ADD COLUMN "erasureRequestedAt"  TIMESTAMP(3),
  ADD COLUMN "redactionStatus"     "RedactionStatus",
  ADD COLUMN "selfieFraudSignalAt" TIMESTAMP(3);
