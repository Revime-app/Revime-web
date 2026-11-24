-- Migration 30. CF-16 / CF-17: a client can now edit and delete their own demande, and every
-- réparateur holding a SENT offer is told. Two members, because the two events differ in
-- meaning and in copy: one says the job changed, the other says it is gone.
--
-- 🛑 TWO STATEMENTS, and they are safe inside Prisma's transaction for the same
-- version-dependent reason migration 24 records. Before Postgres 12, `ALTER TYPE ... ADD
-- VALUE` could not run in a transaction block at all. From 12 on it can, with one rule: the
-- new value may not be USED by a later statement in the SAME transaction. This file only
-- adds — no INSERT, no UPDATE, no DEFAULT referencing either value — so the rule is not
-- engaged. Do NOT add a backfill here; it would fail for that reason and not for an obvious
-- one. Migration 24 measured the target at Postgres 17.6 on 2026-08-30.
--
-- No backfill is wanted anyway. These notify FUTURE edits. Retro-emitting rows for demandes
-- edited before this shipped would put notices in réparateurs' lists about jobs they stopped
-- thinking about weeks ago.

ALTER TYPE "NotificationType" ADD VALUE 'DEMANDE_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'DEMANDE_WITHDRAWN';
