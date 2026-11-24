-- Migration 34. Stage 6 piece C1, Ch.8 §8.4. Five nullable columns and one enum value.
--
-- ✅ NO BACKFILL, measured rather than assumed. On 2026-09-04 the production `Demande`
-- table held 62 rows with `deletedAt` non-null on ZERO of them, so nothing has ever been
-- removed by anyone and NULL is the correct value for every existing row. The four
-- attribution columns describe acts that had no mechanism until this migration.
--
-- 🛑 ONE TRANSACTION WITH BOTH AN `ALTER TYPE ... ADD VALUE` AND AN `ALTER TABLE`, AND
-- THAT IS SAFE HERE FOR A SPECIFIC REASON. From Postgres 12 on, `ADD VALUE` may run in a
-- transaction block with one rule: the new value may not be USED by a later statement in
-- the SAME transaction. The ALTER TABLE below adds columns to `Demande` and references
-- `NotificationType` nowhere, so that rule is not engaged. Migration 24 records the same
-- reasoning for the same statement. **Do NOT add a backfill or a DEFAULT referencing
-- 'DEMANDE_MODERATED' to this file**; it would fail for that reason and not for an obvious
-- one. Target measured at Postgres 17.6.
--
-- Purely additive. No existing value is rewritten and no table is created, so there is no
-- RLS statement: `Demande` already has it.

ALTER TYPE "NotificationType" ADD VALUE 'DEMANDE_MODERATED';

ALTER TABLE "Demande"
  ADD COLUMN "hiddenAt"        TIMESTAMP(3),
  ADD COLUMN "hiddenByUserId"  TEXT,
  ADD COLUMN "hiddenReason"    TEXT,
  ADD COLUMN "deletedByUserId" TEXT,
  ADD COLUMN "deletedReason"   TEXT;

-- NO INDEX ON `hiddenAt`, deliberately, and the row count is the whole reason. `Demande`
-- holds 62 rows, and every read that filters `hiddenAt` already filters `deletedAt`, which
-- has `@@index([deletedAt])` — so the planner has an index for the selective half already.
-- A second near-all-NULL index would earn as little as `Offer.@@index([deletedAt])` is
-- already recorded as earning. If the admin list's `état` filter is ever slow, a later
-- migration adds one in one line.
--
-- Partial indexes ARE available here (the generator sets previewFeatures =
-- ["partialIndexes"], proven by migration 33's own note). Availability is not the reason;
-- the row count is.
