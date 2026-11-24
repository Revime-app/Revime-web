-- CF4-I (CF4-27): client cancellation.
-- Spec docs/superpowers/specs/2026-09-30-cf4-i-client-cancellation-design.md §4.1.
--
-- Two enums, one new table, one nullable column on "Commande", three NotificationType values.
-- Additive only. No data statement. Hand-written, NEVER applied locally; applied at the
-- owner's deploy after 20260930040000_quote_requests (and L / M / N / H).
--
-- "cancellationRequestedAt" is the freeze flag every guard reads (mirrors "disputedAt" beside
-- "Dispute"), set exactly while a PENDING "CancellationRequest" row exists.
--
-- ALTER TYPE ... ADD VALUE may not have its new value USED in the same transaction, and
-- nothing below uses it.

CREATE TYPE "CancellationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REFUSED', 'WITHDRAWN', 'SUPERSEDED');

CREATE TYPE "CancellationReason" AS ENUM ('NO_LONGER_NEEDED', 'TOO_SLOW', 'REPAIRER_UNRESPONSIVE', 'OTHER_SOLUTION', 'OTHER');

CREATE TABLE "CancellationRequest" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "reason" "CancellationReason" NOT NULL,
    "comment" TEXT,
    "status" "CancellationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "refusalNote" TEXT,

    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- I11: one pending request per order.
CREATE UNIQUE INDEX "CancellationRequest_pending_key" ON "CancellationRequest"("commandeId") WHERE "status" = 'PENDING';

CREATE INDEX "CancellationRequest_status_createdAt_idx" ON "CancellationRequest"("status", "createdAt");

ALTER TABLE "Commande" ADD COLUMN "cancellationRequestedAt" TIMESTAMP(3);

ALTER TYPE "NotificationType" ADD VALUE 'CANCELLATION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'CANCELLATION_WITHDRAWN';
ALTER TYPE "NotificationType" ADD VALUE 'CANCELLATION_REFUSED';
