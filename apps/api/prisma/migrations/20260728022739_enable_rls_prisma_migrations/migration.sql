-- Prisma's own bookkeeping table lives in the public schema, so PostgREST exposes it
-- to the anon and authenticated roles: anyone holding the project's anon key could read
-- or rewrite migration history. Enabling RLS closes that off.
--
-- This is a no-op for our own tooling: Prisma connects as the table's owner, and table
-- owners bypass RLS unless FORCE ROW LEVEL SECURITY is set. If Prisma is ever repointed
-- at a non-owner role, migrations will start failing here and this comment is the reason.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
