-- Verification level moves from RepairerProfile to Profile.
--
-- RepairerProfile exists only once a user enables réparateur mode, so a client
-- has nowhere to hold a level. The live database proves the hole: the two
-- @repareme.test rows have no RepairerProfile and therefore no level at all.
-- Profile is the only one of the three tables every user has.
--
-- ADDITIVE ONLY. RepairerProfile keeps its columns until a later migration, so
-- the currently deployed API, which still reads them, is unaffected.

-- AlterTable
ALTER TABLE "Profile"
  ADD COLUMN "verificationLevel" "VerificationLevel" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- Copy rather than assume. Every live row is NONE today, so this is currently a
-- no-op, but the database may differ from today's when this is applied.
UPDATE "Profile" p
SET "verificationLevel" = rp."verificationLevel",
    "verifiedAt"        = rp."verifiedAt"
FROM "RepairerProfile" rp
WHERE rp."userId" = p."userId"
  AND rp."deletedAt" IS NULL;
