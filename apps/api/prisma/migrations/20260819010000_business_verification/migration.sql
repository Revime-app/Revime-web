-- Étape 3b piece 5: the company-registry evidence that grants verification level 3.
-- Design: docs/superpowers/specs/2026-08-19-etape-3b-piece-5-business-design.md §5.

-- Appended, not positioned, so no existing enumsortorder moves. Nothing in this
-- migration inserts a row using the new value, so Postgres' restriction on using a
-- freshly added enum value inside the transaction that added it does not apply.
ALTER TYPE "VerificationChannel" ADD VALUE 'REGISTRY';

-- BUSINESS evidence, the third evidence table beside ConnectAccount and
-- IdentityVerification. No status column: a row exists only for a company the
-- registry answered as ACTIVE, and a failed attempt lives in VerificationAttempt,
-- which is this piece's rate-limit ledger.
CREATE TABLE "BusinessVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siren" TEXT NOT NULL,
    "siret" TEXT,
    -- NULL when INSEE hides the unit's identity (statut_diffusion other than 'O').
    -- A fabricated name is not an option, so the app names no company instead.
    "denomination" TEXT,
    -- The registry's nature_juridique: the client's « statut professionnel »,
    -- derived rather than typed. Stored as the code; nothing renders it in V1.
    "legalFormCode" TEXT,
    "establishmentAddress" TEXT,
    -- What the registry said at the moment of the check. Always 'A' today, and kept
    -- rather than implied so a future re-check has something to compare against.
    "etatAdministratif" TEXT NOT NULL,
    "diffusible" BOOLEAN NOT NULL,
    -- Officers minus their dates of birth. Evidence for a review surface that does
    -- not exist yet; read by nothing today.
    "dirigeants" JSONB NOT NULL,
    -- Re-stamped on a correction, because a corrected claim is a new claim.
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessVerification_pkey" PRIMARY KEY ("id")
);

-- One claim per réparateur. There is deliberately NO unique index on "siren": a
-- squatter who verified a company first would lock its real owner out permanently,
-- with nothing able to unlock it until an admin surface exists, and two réparateurs
-- at one shop is legitimate. See the design's §6.
CREATE UNIQUE INDEX "BusinessVerification_userId_key" ON "BusinessVerification"("userId");

ALTER TABLE "BusinessVerification" ADD CONSTRAINT "BusinessVerification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all backstop, matching every table added since Stage 3a: RLS on with zero
-- policies, so the anon and authenticated roles reach nothing. The API connects as
-- the owner and is unaffected.
ALTER TABLE "BusinessVerification" ENABLE ROW LEVEL SECURITY;
