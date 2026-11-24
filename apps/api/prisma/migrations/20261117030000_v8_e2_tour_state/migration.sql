-- V8 E2 (DEC8-09 (2)): the first-use help bubbles' state per mode, on the account.
-- Null = never offered: every existing profile is offered the tour on the new build (DEC8-09 (4)),
-- so there is no backfill. Additive and nullable; no existing row or read changes.

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "tourState" JSONB;
