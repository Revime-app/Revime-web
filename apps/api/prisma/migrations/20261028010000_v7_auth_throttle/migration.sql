-- V7 A11 / D3 (U2): persistent login lock-out. Replaces the in-memory Map of CF3-14, which every
-- deploy emptied. Additive only: two new tables, two new enums, two new AdminAlertType values. The
-- running API ignores all of it, so it keeps working while this applies.
-- SQL from `prisma migrate diff --from-schema <HEAD schema> --to-schema prisma/schema.prisma --script`,
-- plus RLS on both tables like every table since 20261016220000 (no policy: only the API's
-- service connection reads them, never PostgREST).
-- The two ADD VALUEs run inside migrate deploy's transaction, which PostgreSQL 12+ allows as long as
-- nothing in the same transaction uses the new values; nothing here does.

-- CreateEnum
CREATE TYPE "AuthThrottleScope" AS ENUM ('LOGIN_ACCOUNT', 'CODE_ACCOUNT', 'IP', 'RESET_ACCOUNT');

-- CreateEnum
CREATE TYPE "AuthUnlockReason" AS ENUM ('ADMIN', 'PASSWORD_RESET');

-- AlterEnum


ALTER TYPE "AdminAlertType" ADD VALUE 'ACCOUNT_LOCKED';
ALTER TYPE "AdminAlertType" ADD VALUE 'IP_BLOCKED';

-- CreateTable
CREATE TABLE "AuthThrottle" (
    "scope" "AuthThrottleScope" NOT NULL,
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "recentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("scope","key")
);

-- CreateTable
CREATE TABLE "AuthLockEvent" (
    "id" TEXT NOT NULL,
    "scope" "AuthThrottleScope" NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "level" INTEGER NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlockedAt" TIMESTAMP(3),
    "unlockedByUserId" TEXT,
    "unlockReason" "AuthUnlockReason",

    CONSTRAINT "AuthLockEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthThrottle_lastFailureAt_idx" ON "AuthThrottle"("lastFailureAt");

-- CreateIndex
CREATE INDEX "AuthLockEvent_userId_createdAt_idx" ON "AuthLockEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthLockEvent_scope_key_createdAt_idx" ON "AuthLockEvent"("scope", "key", "createdAt");


-- RLS, as for every table since 20261016220000
ALTER TABLE "AuthThrottle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthLockEvent" ENABLE ROW LEVEL SECURITY;
