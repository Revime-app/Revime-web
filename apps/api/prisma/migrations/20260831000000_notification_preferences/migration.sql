-- CF-47. Notification preference groups on Profile.
--
-- NOT NULL DEFAULT true needs no backfill: existing rows take the default, and the
-- default is the behaviour they already have. Adding a column with a non-volatile
-- default is metadata-only on PostgreSQL 11+, so this does not rewrite the table.
ALTER TABLE "Profile"
  ADD COLUMN "notifyOffers"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyMessages"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyCommandes" BOOLEAN NOT NULL DEFAULT true;
