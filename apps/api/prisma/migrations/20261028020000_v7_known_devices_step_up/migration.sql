-- V7 A11 (U2b): known devices for the « Nouvelle connexion » e-mail, the step-up stamp on sessions,
-- and the « Ce n'est pas moi » line in the lock history. Additive only: one table, one enum, one
-- nullable column, one column with a default, one AdminAlertType value. The running API ignores all
-- of it. Depends on 20261028010000_v7_auth_throttle (AuthLockEvent), which ships in the same push.
-- SQL from `prisma migrate diff --from-schema <HEAD schema> --to-schema prisma/schema.prisma --script`,
-- plus RLS on the new table like every table since 20261016220000.


-- CreateEnum
CREATE TYPE "AuthLockEventKind" AS ENUM ('LOCK', 'SECURED');

-- AlterEnum
ALTER TYPE "AdminAlertType" ADD VALUE 'ACCOUNT_SECURED';

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "stepUpAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AuthLockEvent" ADD COLUMN     "kind" "AuthLockEventKind" NOT NULL DEFAULT 'LOCK';

-- CreateTable
CREATE TABLE "KnownDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "KnownDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnownDevice_userId_notifiedAt_idx" ON "KnownDevice"("userId", "notifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnownDevice_userId_deviceHash_key" ON "KnownDevice"("userId", "deviceHash");


-- RLS, as for every table since 20261016220000
ALTER TABLE "KnownDevice" ENABLE ROW LEVEL SECURITY;
