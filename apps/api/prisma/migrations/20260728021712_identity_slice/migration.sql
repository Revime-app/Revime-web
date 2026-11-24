-- CreateEnum
CREATE TYPE "Mode" AS ENUM ('CLIENT', 'REPAIRER');

-- CreateEnum
CREATE TYPE "RepairerKind" AS ENUM ('PRO', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('NONE', 'BASIC', 'IDENTITY', 'BUSINESS');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "avatarPath" TEXT,
    "clientEnabled" BOOLEAN NOT NULL DEFAULT true,
    "repairerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "activeMode" "Mode" NOT NULL DEFAULT 'CLIENT',
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "RepairerKind" NOT NULL DEFAULT 'INDIVIDUAL',
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "verificationLevel" "VerificationLevel" NOT NULL DEFAULT 'NONE',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RepairerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_phone_key" ON "Profile"("phone");

-- CreateIndex
CREATE INDEX "Profile_deletedAt_idx" ON "Profile"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RepairerProfile_userId_key" ON "RepairerProfile"("userId");

-- CreateIndex
CREATE INDEX "RepairerProfile_deletedAt_idx" ON "RepairerProfile"("deletedAt");
