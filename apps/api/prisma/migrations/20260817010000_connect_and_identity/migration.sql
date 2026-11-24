-- The accept-and-pay étape, piece 2: the réparateur's payout identity, and the
-- Stripe Identity evidence that grants verification level 2.
-- Design: docs/superpowers/specs/2026-08-17-accepter-paiement-p2-design.md §3 and
-- its 2026-08-17 execution amendment, which is authoritative where they disagree.

CREATE TYPE "ConnectStatus" AS ENUM ('PENDING', 'VERIFIED', 'RESTRICTED', 'REJECTED');
CREATE TYPE "ConnectEntityType" AS ENUM ('INDIVIDUAL', 'COMPANY');
CREATE TYPE "IdentityStatus" AS ENUM ('REQUIRES_INPUT', 'PROCESSING', 'VERIFIED', 'CANCELED');

-- PAYOUT evidence only. It deliberately carries no identityDocumentVerifiedAt and
-- no companyVerifiedAt: a probe on 2026-08-17 established that Connect onboarding
-- for a French recipient account demands no identity document and no selfie, and
-- that `additional_verifications` does not exist on this platform account. Those
-- columns would have been dead, and a dead column named for a verification is how
-- a badge comes to be fabricated.
CREATE TABLE "ConnectAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    -- There is deliberately no NOT_STARTED member: the absence of a row IS
    -- not-started. An enum member for it would permit a row holding a
    -- stripeAccountId that nobody can finish onboarding. See spec §3.1.
    "status" "ConnectStatus" NOT NULL DEFAULT 'PENDING',
    -- Stripe's answer, not RepairerProfile.kind, which is self-declared. Two
    -- overlapping entity types in one model is how a fabricated badge gets
    -- written; separate tables make the confusion visible in a diff.
    "entityType" "ConnectEntityType",
    "transfersActive" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmittedAt" TIMESTAMP(3),
    "disabledReason" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectAccount_pkey" PRIMARY KEY ("id")
);

-- IDENTITY evidence. Its own table rather than a reuse of VerificationAttempt,
-- which is a rate-limit ledger keyed on `target` with a [target, createdAt] index
-- enforcing per-phone and per-email limits: an Identity session has no target, so
-- reusing it would mean inventing a meaningless value and polluting the index that
-- protects the SMS spend. It also holds the owner's real audit rows.
CREATE TABLE "IdentityVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "status" "IdentityStatus" NOT NULL DEFAULT 'REQUIRES_INPUT',
    -- Stamped once, on the first transition to VERIFIED, and never cleared by a
    -- sync. Evidence that something happened is not the same kind of fact as a
    -- current status, and clearing it would let the promotion silently un-grant.
    "verifiedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectAccount_userId_key" ON "ConnectAccount"("userId");
CREATE UNIQUE INDEX "ConnectAccount_stripeAccountId_key" ON "ConnectAccount"("stripeAccountId");
CREATE INDEX "ConnectAccount_status_idx" ON "ConnectAccount"("status");

CREATE UNIQUE INDEX "IdentityVerification_userId_key" ON "IdentityVerification"("userId");
CREATE UNIQUE INDEX "IdentityVerification_stripeSessionId_key" ON "IdentityVerification"("stripeSessionId");

ALTER TABLE "ConnectAccount" ADD CONSTRAINT "ConnectAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all backstop, matching every table added since Stage 3a: RLS on with zero
-- policies, so the anon and authenticated roles reach nothing. The API connects as
-- the owner and is unaffected.
ALTER TABLE "ConnectAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdentityVerification" ENABLE ROW LEVEL SECURITY;
