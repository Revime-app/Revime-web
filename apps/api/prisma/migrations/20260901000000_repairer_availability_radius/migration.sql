-- `CF-51` / `CF-52`. A service radius and weekly opening hours. Purely additive: no existing
-- row is touched and NO BACKFILL is possible or wanted. Nobody has stated either, and inventing
-- a default week would turn « has not answered » into « open 09h–18h », which is a claim about
-- the world that nothing checked.

-- AlterTable
ALTER TABLE "RepairerProfile" ADD COLUMN "serviceRadiusKm" INTEGER;

-- A CHOSEN bound, not a derived one: the client never named a range. It excludes 99999 without
-- excluding a regional réparateur.
ALTER TABLE "RepairerProfile" ADD CONSTRAINT "RepairerProfile_serviceRadiusKm_range"
  CHECK ("serviceRadiusKm" IS NULL OR "serviceRadiusKm" BETWEEN 1 AND 150);

-- CreateTable
CREATE TABLE "RepairerAvailability" (
    "id"             TEXT NOT NULL,
    "repairerUserId" TEXT NOT NULL,
    "dayOfWeek"      INTEGER NOT NULL,
    "closed"         BOOLEAN NOT NULL DEFAULT false,
    "opensAt"        INTEGER,
    "closesAt"       INTEGER,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepairerAvailability_repairerUserId_dayOfWeek_key"
  ON "RepairerAvailability"("repairerUserId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "RepairerAvailability_repairerUserId_idx"
  ON "RepairerAvailability"("repairerUserId");

-- AddForeignKey. 🛑 LOWER-CASE "user" — the table is @@map-ed and this is the trap slice 14's
-- plan got wrong.
ALTER TABLE "RepairerAvailability" ADD CONSTRAINT "RepairerAvailability_repairerUserId_fkey"
  FOREIGN KEY ("repairerUserId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ISO-8601 weekdays.
ALTER TABLE "RepairerAvailability" ADD CONSTRAINT "RepairerAvailability_day_range"
  CHECK ("dayOfWeek" BETWEEN 1 AND 7);

-- The CF-D8 pattern: a CHECK binding a discriminator to its dependent columns, so a closed day
-- cannot carry hours and an open one cannot lack them. 1440 is midnight at the END of the day,
-- so a closing time may equal it while an opening time may not exceed the close.
ALTER TABLE "RepairerAvailability" ADD CONSTRAINT "RepairerAvailability_hours"
  CHECK (
    ("closed" = true  AND "opensAt" IS NULL AND "closesAt" IS NULL) OR
    ("closed" = false AND "opensAt" IS NOT NULL AND "closesAt" IS NOT NULL
     AND "opensAt" >= 0 AND "closesAt" <= 1440 AND "opensAt" < "closesAt")
  );

-- RLS on with no policies, matching migrations 27 and 28. Every read and write goes through the
-- API's service role; a direct client has no path in.
ALTER TABLE "RepairerAvailability" ENABLE ROW LEVEL SECURITY;
