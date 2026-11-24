-- CF4-M (spec §4.1, CF4-39). Additive only, no backfill.
-- IdentityVerification: an operator's decision on the CURRENT session (accept / refuse /
-- request new documents). Session fields: start() resets them on a new session. History is the
-- admin audit log. decidedByUserId has NO foreign key on purpose: deleting the operator's account
-- must not erase the trail (same reasoning as Review.moderatedByUserId). Existing rows read as
-- undecided, which is exactly today's behaviour.

CREATE TYPE "IdentityDecision" AS ENUM ('ACCEPTED', 'REFUSED', 'DOCUMENTS_REQUESTED');

CREATE TYPE "IdentityDecisionMotif" AS ENUM ('ILLEGIBLE', 'EXPIRED', 'INCONSISTENT', 'WRONG_DOCUMENT', 'OTHER');

ALTER TABLE "IdentityVerification" ADD COLUMN "decision" "IdentityDecision",
ADD COLUMN "decisionMotif" "IdentityDecisionMotif",
ADD COLUMN "decisionNote" TEXT,
ADD COLUMN "decidedAt" TIMESTAMP(3),
ADD COLUMN "decidedByUserId" TEXT;
