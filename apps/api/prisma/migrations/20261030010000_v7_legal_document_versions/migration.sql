-- V7 D5 (U9b, DEC7-24 / DEC7-25): published versions of the CGU and the mentions légales.
-- Generated with `prisma migrate diff --from-schema <HEAD> --to-schema prisma/schema.prisma --script`,
-- then RLS and the 2026-10-10 seed appended by hand.

-- CreateEnum
CREATE TYPE "LegalDocumentKind" AS ENUM ('CGU', 'MENTIONS_LEGALES');

-- AlterTable
ALTER TABLE "PlatformSettings" ALTER COLUMN "cguCurrentVersion" SET DEFAULT '2026-10-10',
ALTER COLUMN "legalNoticeVersion" SET DEFAULT '2026-10-10';

-- CreateTable
CREATE TABLE "LegalDocumentVersion" (
    "id" TEXT NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL,
    "version" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT,

    CONSTRAINT "LegalDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentVersion_kind_version_key" ON "LegalDocumentVersion"("kind", "version");


-- Like every table here: the API reads it with the service role; nothing goes through PostgREST.
ALTER TABLE "LegalDocumentVersion" ENABLE ROW LEVEL SECURITY;

-- DEC7-25 Q2: the two versions the app already ships (the client's PDFs of 10 October 2026, in
-- docs/client-feedback/v6/legal/). Size and SHA-256 are those files'; the objects themselves are
-- uploaded to the `legal-documents` bucket at these paths before the push, on the owner's word.
INSERT INTO "LegalDocumentVersion" ("id", "kind", "version", "storagePath", "fileName", "sizeBytes", "sha256", "summary", "publishedByUserId")
VALUES
  ('a7c5e1d2-0b1f-4c3e-9d2a-20261010c9a1', 'CGU', '2026-10-10', 'cgu/2026-10-10.pdf', 'CGU T.pdf', 290231,
   '33768f269727c4ae58fdeb79d763e3f807ee7a0f432320e077113dc3c5dcc6a3', NULL, NULL),
  ('b8d6f2e3-1c2a-4d4f-8e3b-20261010e1a2', 'MENTIONS_LEGALES', '2026-10-10', 'mentions-legales/2026-10-10.pdf', 'MENTIONS LÉGALES AC.pdf', 118552,
   'ae86107c78aa94b18071b65cf18aede7505a66063de1aad7189f1a678f10264a', NULL, NULL);

-- The active versions become the ones the app ships. Until now the settings said 2026-09-04 while
-- consent proofs recorded 2026-10-10 (FND7-027). The force flag is not touched here: DEC7-09.
UPDATE "PlatformSettings" SET "cguCurrentVersion" = '2026-10-10', "legalNoticeVersion" = '2026-10-10';
