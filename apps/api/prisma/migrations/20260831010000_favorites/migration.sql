-- Migration 27. CF-18 / CF-19 / CF-20 / CF-27: the favoris subsystem.
-- Design: docs/superpowers/specs/2026-08-31-cf-18-19-20-27-favoris-design.md §4-5.
--
-- Purely additive: two new tables, no existing table altered. The back-relation fields
-- added to User and Demande in schema.prisma produce no DDL, because every foreign key
-- lives on the owning side.
--
-- 🛑 NO STATEMENT-ORDERING CEREMONY IS NEEDED HERE, and migration 23 is why that is worth
-- saying. That file orders four steps because Postgres validates a new CHECK against every
-- EXISTING row. These are new tables with no rows and no CHECK, so ordering is free. Do not
-- copy migration 23's shape into this file.

CREATE TABLE "FavoriteRepairer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- The favourited person, addressed as a User rather than a RepairerProfile.
    "repairerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteRepairer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FavoriteDemande" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteDemande_pkey" PRIMARY KEY ("id")
);

-- A duplicate favourite is structurally impossible rather than guarded in the service.
CREATE UNIQUE INDEX "FavoriteRepairer_userId_repairerUserId_key"
    ON "FavoriteRepairer"("userId", "repairerUserId");
CREATE UNIQUE INDEX "FavoriteDemande_userId_demandeId_key"
    ON "FavoriteDemande"("userId", "demandeId");

-- The list read's exact shape: one owner, newest first.
CREATE INDEX "FavoriteRepairer_userId_createdAt_idx"
    ON "FavoriteRepairer"("userId", "createdAt");
CREATE INDEX "FavoriteDemande_userId_createdAt_idx"
    ON "FavoriteDemande"("userId", "createdAt");

-- 🛑 THE REVERSE DIRECTION, which the two indexes above do NOT cover and which `Block` — the model
-- both of these are documented as being shaped on — already carries as `@@index([blockedUserId])`.
-- Added 2026-08-31, before this migration was applied anywhere, which is the only moment it is free:
-- afterwards these two lines cost a migration 28.
--
-- Two readers need them, and neither is the list read above:
--   * `users.service.ts`'s `deleteAccount` scrubs
--     `favoriteRepairer.deleteMany({ OR: [{ userId }, { repairerUserId: userId }] })`. Its second
--     branch had no index at all, so it sequential-scanned.
--   * POSTGRES DOES NOT AUTO-INDEX A REFERENCING COLUMN. Every `ON DELETE CASCADE` declared below
--     therefore had to scan the whole table once per deleted parent row — for `FavoriteDemande` that
--     is every demande deletion, which nothing else about this table would have made visible.
CREATE INDEX "FavoriteRepairer_repairerUserId_idx"
    ON "FavoriteRepairer"("repairerUserId");
CREATE INDEX "FavoriteDemande_demandeId_idx"
    ON "FavoriteDemande"("demandeId");

-- 🛑 "user" IS LOWERCASE. Prisma's User model maps to Better Auth's "user" table, added by
-- 20260728031500_better_auth_tables. "Demande" keeps its capital.
ALTER TABLE "FavoriteRepairer" ADD CONSTRAINT "FavoriteRepairer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FavoriteRepairer" ADD CONSTRAINT "FavoriteRepairer_repairerUserId_fkey"
    FOREIGN KEY ("repairerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FavoriteDemande" ADD CONSTRAINT "FavoriteDemande_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FavoriteDemande" ADD CONSTRAINT "FavoriteDemande_demandeId_fkey"
    FOREIGN KEY ("demandeId") REFERENCES "Demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deny-all backstop, matching every table added since Stage 3a: RLS on with zero policies,
-- so the anon and authenticated roles reach nothing. The API connects as the owner.
ALTER TABLE "FavoriteRepairer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FavoriteDemande" ENABLE ROW LEVEL SECURITY;
