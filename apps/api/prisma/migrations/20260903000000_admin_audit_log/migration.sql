-- Migration 32. Stage 6 piece A: the admin audit log.
-- Design: docs/superpowers/specs/2026-09-03-stage-6a-admin-shell-audit-overview-design.md §3.
--
-- Purely additive: one new table, no existing table altered. The back-relation added to
-- User in schema.prisma produces no DDL, because the foreign key lives on the owning side.
-- NO BACKFILL is possible or wanted: there is no prior source for an admin action.
--
-- No statement-ordering ceremony is needed. Migration 23 orders its steps because Postgres
-- validates a new CHECK against every existing row; this is a new table with no rows and no
-- CHECK, so ordering is free. Do not copy migration 23's shape here.

CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    -- Nullable on purpose. See the model's comment: this is the first non-Cascade User FK.
    "actorUserId" TEXT,
    -- Denormalised, so the row stays readable after the FK is nulled.
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "statusCode" INTEGER NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- The dashboard's read: newest first.
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- Pieces B and C read per-entity history off this. Added now because it is free now:
-- afterwards it costs a migration 33.
CREATE INDEX "AdminAuditLog_targetType_targetId_idx"
    ON "AdminAuditLog"("targetType", "targetId");

-- POSTGRES DOES NOT AUTO-INDEX A REFERENCING COLUMN, so the SET NULL below would
-- sequential-scan this table once per deleted user without it.
CREATE INDEX "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");

-- 🛑 "user" IS LOWERCASE. Prisma's User model maps to Better Auth's "user" table, added by
-- 20260728031500_better_auth_tables. Referencing "User" here fails migrate deploy against
-- the live database. ON DELETE SET NULL, not CASCADE — the one exception in this schema.
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deny-all backstop, matching every table added since Stage 3a: RLS on with zero policies,
-- so the anon and authenticated roles reach nothing. The API connects as the owner.
ALTER TABLE "AdminAuditLog" ENABLE ROW LEVEL SECURITY;
