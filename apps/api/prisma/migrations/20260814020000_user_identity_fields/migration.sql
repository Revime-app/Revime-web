-- Prénom, nom and phone for the client's level 1, which he defines as
-- "s'inscrire avec e-mail + téléphone vérifiés".
--
-- These live on "user" beside email/emailVerified rather than on Profile so
-- signup is one atomic call. The alternative finishes signup with a second
-- authenticated request, and the app's one existing post-signup request has been
-- silently broken for weeks.
--
-- phoneVerifiedAt is written only by the server. Better Auth declares it
-- input: false so it cannot be set through a signup body.

-- AlterTable
ALTER TABLE "user"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Backfill from the single existing name field.
--
-- A bare split_part is wrong here: two of the four live names have no space at
-- all, and would get an empty string as a last name, which is data-shaped
-- garbage rather than an honest NULL.
UPDATE "user" SET
  "firstName" = CASE WHEN position(' ' in name) > 0
                     THEN split_part(name, ' ', 1)
                     ELSE name END,
  "lastName"  = CASE WHEN position(' ' in name) > 0
                     THEN substr(name, position(' ' in name) + 1)
                     ELSE NULL END;

-- CreateIndex. NULLs do not collide in Postgres, so existing phoneless rows are
-- fine.
CREATE UNIQUE INDEX "user_phone_key" ON "user"("phone");
