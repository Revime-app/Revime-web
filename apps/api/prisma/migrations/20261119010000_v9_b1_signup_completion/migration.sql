-- V9 B1 (CLIENT_FEEDBACK_V9.md DEC9-04 (6), DEC9-05 (1)): how each account signed up, whether a social
-- account confirmed its generated username, and the privacy-policy version a user accepted.
-- Additive: one new type, one enum value, seven new columns (nullable or defaulted). Two backfills on
-- "user", checked first as read-only SELECTs against production on 2026-11-19 (V9 §11): 3,088 EMAIL,
-- 3 GOOGLE, 1 APPLE, 24 left null; 3,089 usernames marked confirmed (every user with a password login).

-- CreateEnum
CREATE TYPE "SignupMethod" AS ENUM ('APPLE', 'GOOGLE', 'EMAIL');

-- AlterEnum
ALTER TYPE "ConsentProofKind" ADD VALUE IF NOT EXISTS 'PRIVACY_ACCEPTANCE';

-- AlterTable
ALTER TABLE "user" ADD COLUMN "signupMethod" "SignupMethod",
ADD COLUMN "privacyAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "usernameConfirmedAt" TIMESTAMP(3),
ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
ADD COLUMN "privacyVersion" TEXT;

-- AlterTable
ALTER TABLE "ConsentProof" ADD COLUMN "privacyVersion" TEXT;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN "privacyCurrentVersion" TEXT NOT NULL DEFAULT '2026-11-19';

-- Backfill 1: the method of each user's OLDEST login row; users with none (seeded) stay null.
UPDATE "user" u
SET "signupMethod" = CASE f."providerId"
    WHEN 'credential' THEN 'EMAIL'::"SignupMethod"
    WHEN 'apple' THEN 'APPLE'::"SignupMethod"
    WHEN 'google' THEN 'GOOGLE'::"SignupMethod"
  END
FROM (
  SELECT DISTINCT ON (a."userId") a."userId", a."providerId"
  FROM "account" a
  ORDER BY a."userId", a."createdAt" ASC
) f
WHERE f."userId" = u.id AND f."providerId" IN ('credential', 'apple', 'google');

-- Backfill 2: a user with a password login chose his handle on the form; social-only users stay null
-- so they are asked once (DEC9-04 (1)).
UPDATE "user" u SET "usernameConfirmedAt" = u."createdAt"
WHERE EXISTS (SELECT 1 FROM "account" a WHERE a."userId" = u.id AND a."providerId" = 'credential');
