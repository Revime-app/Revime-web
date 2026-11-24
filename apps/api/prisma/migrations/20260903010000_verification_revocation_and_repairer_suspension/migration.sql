-- Stage 6 piece B2. Two independent markers, five nullable columns, one table.
--
-- ✅ NO BACKFILL, and it is measured rather than assumed. On 2026-09-03 the production
-- `Profile` table held **40 rows**, of which exactly ONE sits above verificationLevel = 'NONE'
-- (that one is at IDENTITY; none is at BASIC). No account has ever been revoked or
-- réparateur-suspended, because neither concept existed. Every column here is nullable and NULL
-- is the correct value for all 40 existing rows.
--
-- 🛑 CORRECTED BEFORE MERGE: the brief for this task said « all 21 existing rows ». 21 is the
-- count of `repairerEnabled` profiles — and, separately, of `RepairerProfile` rows — not of
-- `Profile` rows. The conclusion is unchanged (no backfill either way), but the number was
-- measured on the wrong population, so it is stated per-population here.
--
-- 🛑 ON `Profile` AND NOT ON `RepairerProfile`, for two reasons (spec §4.1). Profile already
-- holds repairerEnabled and activeMode, so it is where réparateur MODE STATE lives, while
-- RepairerProfile holds presentation. And `User.repairerProfile` is an OPTIONAL to-one
-- relation: Prisma reads `{ repairerProfile: { repairerSuspendedAt: null } }` as "the row
-- exists AND the field is null", so nesting the marker there would silently exclude any
-- réparateur without that row from every filtered list. Profile exists for every account
-- (ensure-profile.ts's upsert), and the 40-vs-21 row counts above are the proof: 19 accounts
-- have a Profile and no RepairerProfile.
--
-- Purely additive. No existing value is rewritten and no table is created, so there is no RLS
-- statement here: `Profile` already has it, from 20260728022124_enable_rls_identity.

-- AlterTable
ALTER TABLE "Profile"
  ADD COLUMN "verificationRevokedAt"     TIMESTAMP(3),
  ADD COLUMN "verificationRevokedReason" TEXT,
  ADD COLUMN "repairerSuspendedAt"       TIMESTAMP(3),
  ADD COLUMN "repairerSuspendedUntil"    TIMESTAMP(3),
  ADD COLUMN "repairerSuspendedReason"   TEXT;

-- NO INDEX ON EITHER MARKER, deliberately, and the row count is the WHOLE reason. `Profile`
-- holds 40 rows and the réparateur queue reads the table wholesale, so an index cannot beat the
-- sequential scan the planner will choose anyway. If the table ever grows enough to need one, a
-- later migration adds it in one line.
--
-- 🛑 NOT because a partial index is unavailable. It IS available, and this was measured on
-- 2026-09-03 rather than reasoned: this schema's generator already sets
-- previewFeatures = ["partialIndexes"], and adding
-- `@@index([verificationRevokedAt], where: { verificationRevokedAt: { not: null } })` to this
-- very model makes `prisma validate` pass. Said here explicitly because an earlier draft of this
-- comment concluded the opposite from there being ZERO existing `@@index(…, where:)` in the file
-- — absence of use is not absence of capability. The row count is the whole reason.
