-- Étape 5 piece 1: the messaging and review data model.
-- Design: docs/superpowers/specs/2026-08-19-etape-5-messagerie-avis-design.md §5.
--
-- All five tables land in ONE migration although only Conversation and Message are
-- read by this piece. Every `migrate deploy` against production is its own risk
-- event, and the model was designed as one coherent thing, so pieces 2 and 3 add no
-- migration. Purely additive: no existing table is altered. The back-relation fields
-- added to User, Demande and Commande in schema.prisma produce no DDL, because every
-- foreign key lives on the owning side.
--
-- Verified before applying: `prisma migrate diff --from-config-datasource --to-schema`
-- generated DDL identical to this file column for column, index name for index name,
-- and cascade for cascade. The only additions here are the comments and the RLS block,
-- which Prisma does not generate.

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    -- Denormalised from the offer, as Commande.repairerUserId is, and for the same
    -- reason: a join a moderation soft-delete can break is not something to discover
    -- while rendering an inbox.
    "repairerUserId" TEXT NOT NULL,
    -- NULL until the first message. The inbox filters on it, so an opened-and-
    -- abandoned conversation exists without appearing anywhere. Also the ORDER key.
    "lastMessageAt" TIMESTAMP(3),
    "clientLastReadAt" TIMESTAMP(3),
    "repairerLastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    -- Unconstrained in Postgres and capped in Zod at MESSAGE_BODY_MAX, matching this
    -- codebase's convention of bounding in the schema layer rather than the column.
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Moderation. A soft delete keeps the evidence a report rests on.
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- Piece 3's table, created here. One review per commande, tied to money that moved.
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "repairerUserId" TEXT NOT NULL,
    -- Required. The three below are the prototype's optional sub-ratings.
    "rating" INTEGER NOT NULL,
    "qualityRating" INTEGER,
    "delayRating" INTEGER,
    "communicationRating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- Piece 2's tables, created here for the same reason as Review.
CREATE TABLE "ConversationReport" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    -- Denormalised so the admin list needs no derivation of "the other party".
    "reportedUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ConversationReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "blockerUserId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Conversation_clientUserId_lastMessageAt_idx" ON "Conversation"("clientUserId", "lastMessageAt");

CREATE INDEX "Conversation_repairerUserId_lastMessageAt_idx" ON "Conversation"("repairerUserId", "lastMessageAt");

-- One thread per réparateur per demande. This index IS the design decision, not an
-- optimisation: it is what makes a second offer reuse the thread instead of splitting
-- it. See the design's §4.2.
CREATE UNIQUE INDEX "Conversation_demandeId_repairerUserId_key" ON "Conversation"("demandeId", "repairerUserId");

CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- This index IS the rate limiter. Message is its own ledger; there is no second table.
CREATE INDEX "Message_senderUserId_createdAt_idx" ON "Message"("senderUserId", "createdAt");

-- One review per commande. Structural, not guarded: there is no route to a second.
CREATE UNIQUE INDEX "Review_commandeId_key" ON "Review"("commandeId");

-- Exactly the pair the derived aggregate's groupBy reads. There is deliberately no
-- rating column on RepairerProfile — see the design's §4.4.
CREATE INDEX "Review_repairerUserId_deletedAt_idx" ON "Review"("repairerUserId", "deletedAt");

CREATE INDEX "ConversationReport_resolvedAt_createdAt_idx" ON "ConversationReport"("resolvedAt", "createdAt");

CREATE INDEX "Block_blockedUserId_idx" ON "Block"("blockedUserId");

CREATE UNIQUE INDEX "Block_blockerUserId_blockedUserId_key" ON "Block"("blockerUserId", "blockedUserId");

-- The `user` table is lowercase and quoted: Better Auth owns it. Demande and Commande
-- are capitalised. Getting this wrong fails at apply time, not at validate time.
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_demandeId_fkey"
    FOREIGN KEY ("demandeId") REFERENCES "Demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientUserId_fkey"
    FOREIGN KEY ("clientUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_repairerUserId_fkey"
    FOREIGN KEY ("repairerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey"
    FOREIGN KEY ("senderUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT "Review_commandeId_fkey"
    FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_repairerUserId_fkey"
    FOREIGN KEY ("repairerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationReport" ADD CONSTRAINT "ConversationReport_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationReport" ADD CONSTRAINT "ConversationReport_reporterUserId_fkey"
    FOREIGN KEY ("reporterUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationReport" ADD CONSTRAINT "ConversationReport_reportedUserId_fkey"
    FOREIGN KEY ("reportedUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerUserId_fkey"
    FOREIGN KEY ("blockerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedUserId_fkey"
    FOREIGN KEY ("blockedUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all backstop, matching every table added since Stage 3a: RLS on with zero
-- policies, so the anon and authenticated roles reach nothing. The API connects as
-- the owner and is unaffected.
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Block" ENABLE ROW LEVEL SECURITY;
