-- Migration 23. CF-42: the automatic « Paiement effectué » message has no human author.
--
-- 🛑 STATEMENT ORDER IS LOAD-BEARING. Postgres validates a new CHECK against every
-- existing row the moment it is added. So `kind` must exist AND its DEFAULT must have
-- populated every pre-existing row BEFORE the constraint arrives, or every one of those
-- rows violates it and this file fails half-applied. Do not reorder these four steps.

-- 1. The discriminator's type.
CREATE TYPE "MessageKind" AS ENUM ('USER', 'SYSTEM');

-- 2. The column, NOT NULL with a DEFAULT, so every existing row becomes USER in place.
--    This is what makes step 4 safe.
ALTER TABLE "Message" ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'USER';

-- 3. Only now may the sender become optional.
ALTER TABLE "Message" ALTER COLUMN "senderUserId" DROP NOT NULL;

-- 4. Bind the two columns. Without this, a USER row with a null sender and a SYSTEM row
--    with one are both insertable, and MessageDto.mine would silently mis-attribute the
--    first case to the counterpart.
ALTER TABLE "Message" ADD CONSTRAINT "Message_kind_sender_consistent"
  CHECK (
    ("kind" = 'USER' AND "senderUserId" IS NOT NULL)
    OR ("kind" = 'SYSTEM' AND "senderUserId" IS NULL)
  );
