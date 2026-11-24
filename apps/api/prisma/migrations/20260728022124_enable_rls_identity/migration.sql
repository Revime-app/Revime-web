-- Deny-all RLS backstop.
--
-- All access to these tables goes through the API on a service-role connection,
-- which bypasses RLS. Enabling RLS with no policies therefore changes nothing for
-- the application, and makes any accidental exposure of an anon/publishable key
-- inert instead of catastrophic. It also keeps Supabase's security advisors clean,
-- so a real finding later is not lost in "RLS disabled" noise.
--
-- Every table added in later etapes must do the same.
ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RepairerProfile" ENABLE ROW LEVEL SECURITY;
