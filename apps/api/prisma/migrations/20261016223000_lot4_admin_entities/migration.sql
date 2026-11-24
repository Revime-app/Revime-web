-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "PromoStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING_COMPLETION', 'REWARDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AdminAlertType" AS ENUM ('DISPUTE_NEW', 'REPORT_SEVERE', 'PAYMENT_FAILED', 'PARCEL_INCIDENT');

-- CreateEnum
CREATE TYPE "AdminAlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM');

-- CreateTable
CREATE TABLE "AdminBroadcast" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "channelEmail" BOOLEAN NOT NULL DEFAULT false,
    "channelPush" BOOLEAN NOT NULL DEFAULT false,
    "targetType" TEXT NOT NULL,
    "targetFilter" JSONB NOT NULL,
    "templateKey" TEXT NOT NULL DEFAULT 'CUSTOM',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "totalRecipients" INTEGER NOT NULL,
    "sentEmailCount" INTEGER NOT NULL DEFAULT 0,
    "sentPushCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" "PromoType" NOT NULL DEFAULT 'FIXED_AMOUNT',
    "valueCents" INTEGER NOT NULL,
    "maxDiscountCents" INTEGER,
    "minOrderCents" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "maxUsesTotal" INTEGER,
    "maxUsesPerUser" INTEGER NOT NULL DEFAULT 1,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "status" "PromoStatus" NOT NULL DEFAULT 'ACTIVE',
    "isReferral" BOOLEAN NOT NULL DEFAULT false,
    "referrerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoUsage" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "firstCommandeId" TEXT NOT NULL,
    "rewardVoucherId" TEXT,
    "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING_COMPLETION',
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAlert" (
    "id" TEXT NOT NULL,
    "type" "AdminAlertType" NOT NULL,
    "severity" "AdminAlertSeverity" NOT NULL DEFAULT 'HIGH',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "readByUserId" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "protectionFixedCents" INTEGER NOT NULL DEFAULT 290,
    "protectionRateBp" INTEGER NOT NULL DEFAULT 450,
    "commissionRateBp" INTEGER NOT NULL DEFAULT 0,
    "payoutHoldHours" INTEGER NOT NULL DEFAULT 48,
    "offerValidityHours" INTEGER NOT NULL DEFAULT 168,
    "paymentHoldHours" INTEGER NOT NULL DEFAULT 2,
    "deliveryHomeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryWorkshopEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryParcelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "carrierMondialRelay" BOOLEAN NOT NULL DEFAULT true,
    "carrierChronopost" BOOLEAN NOT NULL DEFAULT true,
    "carrierColissimo" BOOLEAN NOT NULL DEFAULT true,
    "carrierRelaisColis" BOOLEAN NOT NULL DEFAULT true,
    "maxInsurableValueCents" INTEGER NOT NULL DEFAULT 100000,
    "cguCurrentVersion" TEXT NOT NULL DEFAULT '2026-09-04',
    "cguForceReaccept" BOOLEAN NOT NULL DEFAULT false,
    "legalNoticeVersion" TEXT NOT NULL DEFAULT '2026-09-04',
    "maintenanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT NOT NULL DEFAULT 'Plateforme en cours de maintenance. De retour très prochainement.',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminBroadcast_createdAt_idx" ON "AdminBroadcast"("createdAt");
CREATE INDEX "AdminBroadcast_operatorId_idx" ON "AdminBroadcast"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX "PromoCode_status_idx" ON "PromoCode"("status");
CREATE INDEX "PromoCode_isReferral_idx" ON "PromoCode"("isReferral");
CREATE INDEX "PromoCode_referrerId_idx" ON "PromoCode"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoUsage_commandeId_key" ON "PromoUsage"("commandeId");
CREATE INDEX "PromoUsage_userId_idx" ON "PromoUsage"("userId");
CREATE INDEX "PromoUsage_promoCodeId_idx" ON "PromoUsage"("promoCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_firstCommandeId_key" ON "ReferralReward"("firstCommandeId");
CREATE INDEX "ReferralReward_referrerId_idx" ON "ReferralReward"("referrerId");
CREATE INDEX "ReferralReward_refereeId_idx" ON "ReferralReward"("refereeId");

-- CreateIndex
CREATE INDEX "AdminAlert_isRead_createdAt_idx" ON "AdminAlert"("isRead", "createdAt");
CREATE INDEX "AdminAlert_type_targetId_createdAt_idx" ON "AdminAlert"("type", "targetId", "createdAt");
CREATE INDEX "AdminAlert_severity_idx" ON "AdminAlert"("severity");
CREATE INDEX "AdminAlert_createdAt_idx" ON "AdminAlert"("createdAt");

-- AddForeignKey
ALTER TABLE "AdminBroadcast" ADD CONSTRAINT "AdminBroadcast_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoUsage" ADD CONSTRAINT "PromoUsage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromoUsage" ADD CONSTRAINT "PromoUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromoUsage" ADD CONSTRAINT "PromoUsage_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_rewardVoucherId_fkey" FOREIGN KEY ("rewardVoucherId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAlert" ADD CONSTRAINT "AdminAlert_readByUserId_fkey" FOREIGN KEY ("readByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "AdminBroadcast" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromoCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromoUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralReward" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformSettings" ENABLE ROW LEVEL SECURITY;
