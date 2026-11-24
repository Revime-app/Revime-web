-- apps/api/prisma/migrations/20261017193000_clean_test_admin_accounts/migration.sql
-- PRE-1: Demote all test accounts with staff roles to regular users (role = NULL)
UPDATE "user"
SET "role" = NULL
WHERE "role" IS NOT NULL
  AND "email" LIKE '%@repareme.test';

-- Invalidate active sessions for all demoted test staff accounts
DELETE FROM "session"
WHERE "userId" IN (
  SELECT "id" FROM "user" WHERE "email" LIKE '%@repareme.test'
);
