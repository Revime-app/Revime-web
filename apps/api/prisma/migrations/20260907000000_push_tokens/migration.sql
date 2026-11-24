-- CF-44 push notifications. Spec: docs/superpowers/specs/2026-09-07-cf-44-push-notifications-design.md §3.
--
-- Purely additive: ONE enum and TWO tables. No existing table is altered; the `pushTokens`
-- back-relation on User produces no DDL. NO BACKFILL: tokens arrive from phones, nothing exists
-- to migrate.
--
-- Verified before applying:
--   npx prisma migrate diff --from-schema <main's schema.prisma> --to-schema prisma/schema.prisma --script
-- reproduced this DDL statement for statement. The only additions here are the comments and the
-- two RLS lines, which Prisma does not generate.

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- UNIQUE ON ITS OWN, not per user: one phone has one token, so a second account signing in
    -- on the same device reassigns it by upsert. Spec §3.1.
    "token" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Set on DeviceNotRegistered, cleared by the next registration. Spec §3.2.
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushTicket" (
    -- Expo's ticket id, verbatim: the key the receipts endpoint takes. Spec §3.3.
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");
CREATE INDEX "PushTicket_createdAt_idx" ON "PushTicket"("createdAt");

-- AddForeignKey. "user", lower case: User is @@map("user").
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushTicket" ADD CONSTRAINT "PushTicket_tokenId_fkey"
    FOREIGN KEY ("tokenId") REFERENCES "PushToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all backstop, matching every table added since Stage 3a: RLS on with zero policies,
-- so the anon and authenticated roles reach nothing. The API connects as the owner.
ALTER TABLE "PushToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushTicket" ENABLE ROW LEVEL SECURITY;
