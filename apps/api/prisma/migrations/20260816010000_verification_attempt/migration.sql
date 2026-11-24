-- Étape 3b piece 4: the verification attempt ledger.
--
-- Backs both the rate limiter and the spend record. See the model doc comment in
-- schema.prisma for why outcome is load-bearing rather than decorative.

CREATE TYPE "VerificationChannel" AS ENUM ('SMS', 'EMAIL');
CREATE TYPE "VerificationOutcome" AS ENUM ('SENT', 'APPROVED', 'REJECTED', 'BLOCKED', 'FAILED');

CREATE TABLE "VerificationAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "VerificationChannel" NOT NULL,
    "target" TEXT NOT NULL,
    "outcome" "VerificationOutcome" NOT NULL,
    "providerRef" TEXT,
    "errorCode" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- Both limits are trailing-window counts, so both need the timestamp in the index.
CREATE INDEX "VerificationAttempt_userId_createdAt_idx" ON "VerificationAttempt"("userId", "createdAt");
CREATE INDEX "VerificationAttempt_target_createdAt_idx" ON "VerificationAttempt"("target", "createdAt");

-- "user" is the mapped table name: model User carries @@map("user").
-- Cascade is operational as well as correct: the integration suite cleans up by
-- deleting users, so ledger rows must go with them rather than accumulate.
ALTER TABLE "VerificationAttempt" ADD CONSTRAINT "VerificationAttempt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all RLS backstop. Mandated in words by 20260728022124_enable_rls_identity:
-- "Every table added in later etapes must do the same." All access is on a
-- service-role connection that bypasses RLS, so this changes nothing for the app
-- and makes an exposed publishable key inert rather than catastrophic.
ALTER TABLE "VerificationAttempt" ENABLE ROW LEVEL SECURITY;
