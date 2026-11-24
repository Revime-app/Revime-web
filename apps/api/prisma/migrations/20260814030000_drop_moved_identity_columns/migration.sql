-- Contract step. Four columns whose data now lives elsewhere.
--
-- NOT APPLIED WHEN AUTHORED. Dropping a column the running API still reads
-- breaks it, so this stays pending until the deploy that ships the code which
-- stopped reading it. Prisma tolerates extra columns the schema does not
-- mention, so the tree stays green in the meantime.
--
-- RepairerProfile.verificationLevel / verifiedAt: the level moved to Profile in
-- 20260814010000_profile_verification_level, which copied the data across before
-- this drop removes the source. RepairerProfile exists only once someone enables
-- réparateur mode, so it could never hold a client's level.
--
-- Profile.phone / phoneVerifiedAt: moved to the user row in
-- 20260814020000_user_identity_fields, beside email and emailVerified, so signup
-- writes them in one atomic call. No data is lost: both columns were NULL in
-- every live row, verified before this was authored, and nothing outside the
-- generated Prisma client ever read them.

-- AlterTable
ALTER TABLE "RepairerProfile"
  DROP COLUMN "verificationLevel",
  DROP COLUMN "verifiedAt";

-- AlterTable
ALTER TABLE "Profile"
  DROP COLUMN "phone",
  DROP COLUMN "phoneVerifiedAt";
