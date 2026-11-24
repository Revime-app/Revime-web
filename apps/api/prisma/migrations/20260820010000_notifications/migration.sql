-- In-app notifications, both modes.
-- Design: docs/superpowers/specs/2026-08-20-notifications-design.md §3 and §5.5.
--
-- Purely additive: ONE new table and ONE new enum. No existing table is altered. The
-- `notifications Notification[]` back-relation added to User produces no DDL, because the
-- foreign key lives on the owning side.
--
-- Verified before applying:
--   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
-- generated DDL identical to this file, column for column and index name for index name.
-- The only additions here are the comments, the RLS block and the backfill, none of which
-- Prisma generates.

CREATE TYPE "NotificationType" AS ENUM (
    'OFFER_RECEIVED', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'MESSAGE_RECEIVED',
    'COMMANDE_STEP', 'FUNDS_RELEASED', 'COMMANDE_REFUNDED'
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- Which hat the RECIPIENT wears for this event. Stored rather than derived: four of the
    -- seven types fire for BOTH parties, so `type` alone cannot say whose list a row belongs
    -- in, and a read-time answer needs a join per row. See the design §3.1.
    "mode" "Mode" NOT NULL,
    "type" "NotificationType" NOT NULL,
    -- Snapshots, taken at emit time. Recorded rather than joined, the reasoning
    -- Commande.transferredCents already carries in this schema: a displayName edit or a
    -- demande retitle must not rewrite what a notification said last month. See §3.2.
    "actorName" TEXT,
    "subject" TEXT,
    "amountCents" INTEGER,
    "step" "CommandeStep",
    -- Routing targets. NO foreign keys, deliberately: a cascade would delete notification
    -- history as a side effect of deleting something else, which is the reason
    -- Commande.refundedByUserId already gives for the same choice. See §3.4.
    "demandeId" TEXT,
    "commandeId" TEXT,
    "conversationId" TEXT,
    -- The message body is JOINED on this at read time rather than snapshotted, so a
    -- moderation soft-delete actually takes effect on this surface. The ONE deliberate
    -- exception to the snapshot rule above. See §3.5.
    "messageId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- At most ONE unread message row per conversation, as a DATABASE rule rather than a
-- convention the emitter is trusted to keep: twenty messages in one thread would otherwise
-- bury everything else under twenty rows. Same technique as Offer's partial unique index,
-- and the reason `partialIndexes` is already a preview feature in this schema. See §3.3.
CREATE UNIQUE INDEX "Notification_userId_conversationId_key"
    ON "Notification"("userId", "conversationId")
    WHERE "type" = 'MESSAGE_RECEIVED' AND "readAt" IS NULL;

CREATE INDEX "Notification_userId_mode_createdAt_idx"
    ON "Notification"("userId", "mode", "createdAt");
CREATE INDEX "Notification_userId_mode_readAt_idx"
    ON "Notification"("userId", "mode", "readAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all backstop, matching every table added since Stage 3a: RLS on with zero policies,
-- so the anon and authenticated roles reach nothing. The API connects as the owner.
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

-- Backfill, see §5.5. Without it the bell is empty on the day this ships for every account
-- that already has history, the client's included, and an empty screen on a feature
-- announced as new reads as broken rather than as new.
--
-- createdAt comes from the OFFER and not from now(), so timeAgoLabel stays honest about how
-- old these events are. readAt stays NULL: these are genuinely unread.
INSERT INTO "Notification" (
    "id", "userId", "mode", "type", "actorName", "subject", "amountCents", "demandeId", "createdAt"
)
SELECT
    gen_random_uuid()::text,
    d."authorUserId",
    'CLIENT',
    'OFFER_RECEIVED',
    -- The same precedence OfferDto.repairerName uses: displayName, else the account name.
    COALESCE(rp."displayName", u."name"),
    d."title",
    o."priceCents",
    d."id",
    o."createdAt"
FROM "Offer" o
JOIN "Demande" d ON d."id" = o."demandeId"
JOIN "user" u ON u."id" = o."repairerUserId"
LEFT JOIN "RepairerProfile" rp ON rp."userId" = o."repairerUserId"
WHERE o."deletedAt" IS NULL
  AND d."deletedAt" IS NULL;
