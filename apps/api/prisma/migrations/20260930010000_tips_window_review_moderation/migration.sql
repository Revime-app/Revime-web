-- CF4-L (spec §4.1, CF4-37 / CF4-38). Additive only, no backfill.
-- Tip: optional display window. A null bound is open; endsAt is EXCLUSIVE. Null windows keep
-- every existing tip showing exactly as today.
-- Review: the moderation trail of a hide (hidden IS "deletedAt"). moderatedByUserId has NO
-- foreign key on purpose: deleting the moderator's account must not erase the trail (same
-- reasoning as Demande.hiddenByUserId). Rows hidden before this deploy read as hidden with
-- no motif ("motif non renseigné").

ALTER TABLE "Tip" ADD COLUMN "startsAt" TIMESTAMP(3),
ADD COLUMN "endsAt" TIMESTAMP(3);

CREATE TYPE "ReviewModerationMotif" AS ENUM ('ABUSIVE', 'PERSONAL_DATA', 'OFF_TOPIC', 'FAKE', 'OTHER');

ALTER TABLE "Review" ADD COLUMN "moderationMotif" "ReviewModerationMotif",
ADD COLUMN "moderationNote" TEXT,
ADD COLUMN "moderatedByUserId" TEXT;
