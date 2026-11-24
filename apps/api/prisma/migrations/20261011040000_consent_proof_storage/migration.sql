-- CreateEnum
CREATE TYPE "ConsentProofKind" AS ENUM ('CGU_ACCEPTANCE', 'WITHDRAWAL_WAIVER_IMMEDIATE', 'WITHDRAWAL_WAIVER_WAIT_14_DAYS');

-- CreateTable
CREATE TABLE "ConsentProof" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ConsentProofKind" NOT NULL,
    "cguVersion" TEXT,
    "waiverTextVersion" TEXT,
    "legalTextSnapshot" TEXT NOT NULL,
    "actionProof" TEXT NOT NULL,
    "commandeId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "checksum" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentProof_userId_timestamp_idx" ON "ConsentProof"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "ConsentProof_commandeId_idx" ON "ConsentProof"("commandeId");

-- CreateIndex
CREATE INDEX "ConsentProof_kind_idx" ON "ConsentProof"("kind");

-- AddForeignKey
ALTER TABLE "ConsentProof" ADD CONSTRAINT "ConsentProof_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentProof" ADD CONSTRAINT "ConsentProof_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create Immutability Trigger Function
CREATE OR REPLACE FUNCTION prevent_consent_proof_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ConsentProof records are immutable legal audit proofs and cannot be updated or deleted (attempted % on id %)', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

-- Attach Immutability Trigger
CREATE TRIGGER trg_prevent_consent_proof_mutation
BEFORE UPDATE OR DELETE ON "ConsentProof"
FOR EACH ROW
EXECUTE FUNCTION prevent_consent_proof_mutation();

-- Idempotent Backfill: Existing Users who accepted CGU
INSERT INTO "ConsentProof" ("id", "userId", "kind", "cguVersion", "legalTextSnapshot", "actionProof", "checksum", "timestamp")
SELECT
  gen_random_uuid()::text,
  u.id,
  'CGU_ACCEPTANCE'::"ConsentProofKind",
  COALESCE(u."cguVersion", '2026-09-04'),
  'Acceptation initiale des Conditions Générales d''Utilisation.',
  'HISTORICAL_IMPORT_REGISTRATION',
  encode(sha256(u.id::bytea), 'hex'),
  COALESCE(u."cguAcceptedAt", u."createdAt")
FROM "user" u
WHERE u."cguAccepted" = true
  AND NOT EXISTS (
    SELECT 1 FROM "ConsentProof" cp WHERE cp."userId" = u.id AND cp."kind" = 'CGU_ACCEPTANCE'
  );

-- Idempotent Backfill: Existing Commandes with statutory withdrawal waiver
INSERT INTO "ConsentProof" ("id", "userId", "kind", "waiverTextVersion", "legalTextSnapshot", "actionProof", "commandeId", "checksum", "timestamp")
SELECT
  gen_random_uuid()::text,
  c."clientUserId",
  'WITHDRAWAL_WAIVER_IMMEDIATE'::"ConsentProofKind",
  '2026-10-06',
  COALESCE(c."withdrawalWaiverText", 'Je veux que la réparation commence tout de suite, et je comprends que je ne pourrai plus me rétracter une fois la réparation terminée.'),
  'HISTORICAL_IMPORT_CHECKOUT',
  c.id,
  encode(sha256(c.id::bytea), 'hex'),
  c."withdrawalWaiverAcceptedAt"
FROM "Commande" c
WHERE c."withdrawalWaiverAcceptedAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ConsentProof" cp WHERE cp."commandeId" = c.id AND cp."kind" = 'WITHDRAWAL_WAIVER_IMMEDIATE'
  );
