-- The accept-and-pay étape, piece 1: the Commande and the Stripe idempotency ledger.
-- Design: docs/superpowers/specs/2026-08-16-accepter-paiement-p1-design.md §3.

CREATE TYPE "CommandeStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'ABANDONED');
CREATE TYPE "DeliveryMode" AS ENUM ('HOME', 'WORKSHOP', 'PARCEL');

CREATE TABLE "Commande" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    -- Denormalised from the offer on purpose: P3 transfers money to a person, and
    -- resolving that through offer -> repairer at release time would let a later
    -- moderation soft-delete of the offer break a payout.
    "repairerUserId" TEXT NOT NULL,
    "delivery" "DeliveryMode" NOT NULL,
    -- All four amounts are snapshotted rather than derived, so a breakdown stays
    -- reconstructible after a constant changes.
    "repairCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL,
    "protectionCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "status" "CommandeStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    -- Unread in P1. It is P3's source_transaction, and capturing it at payment
    -- time is cheaper than backfilling rows that already hold money.
    "stripeChargeId" TEXT,
    "paidAt" TIMESTAMP(3),
    -- Compliance backstop against Stripe's 90-day holding limit outside the US,
    -- not the product's release timer. P3 recomputes it.
    "autoReleaseDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commande_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Commande_stripeSessionId_key" ON "Commande"("stripeSessionId");
CREATE UNIQUE INDEX "Commande_stripePaymentIntentId_key" ON "Commande"("stripePaymentIntentId");

-- Narrowed to the one status that must be unique, and named the way Prisma names
-- a single-field unique so the schema and the database do not drift. There is
-- deliberately no equivalent for PAID: paying sets Demande.status = IN_PROGRESS
-- and the checkout guard requires OPEN, so the only route that creates a paid
-- Commande refuses to run twice.
CREATE UNIQUE INDEX "Commande_demandeId_key" ON "Commande"("demandeId")
    WHERE ("status" = 'PENDING_PAYMENT');

-- Required, not tidying: the unique index above covers one status, so it cannot
-- serve the lookups that read a demande's commande in any state.
CREATE INDEX "Commande_demandeId_idx" ON "Commande"("demandeId");
CREATE INDEX "Commande_clientUserId_idx" ON "Commande"("clientUserId");
CREATE INDEX "Commande_repairerUserId_idx" ON "Commande"("repairerUserId");

-- "user" is the mapped table name: model User carries @@map("user").
-- Cascade is operational as well as correct — the integration suite cleans up by
-- deleting users, so these rows must go with them rather than accumulate in the
-- live database.
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_demandeId_fkey"
    FOREIGN KEY ("demandeId") REFERENCES "Demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_clientUserId_fkey"
    FOREIGN KEY ("clientUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_repairerUserId_fkey"
    FOREIGN KEY ("repairerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Idempotency ledger. Stripe redelivers, so an event id already present means the
-- work was done. Insert-first, and a unique violation IS the "already seen" signal.
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- Deny-all RLS backstop, mandated in words by 20260728022124_enable_rls_identity.
-- All access is on a service-role connection that bypasses RLS, so this changes
-- nothing for the app and makes an exposed publishable key inert.
ALTER TABLE "Commande" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StripeEvent" ENABLE ROW LEVEL SECURITY;
