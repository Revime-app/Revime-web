-- V8 E1 (DEC8-08 (1), (4)). Two « finish your setup » reminders, 3 and 8 days after a repairer turned on
-- repairer mode, while setup is unfinished. One notification type, and one marker per reminder on the
-- repairer's profile, so each reminder is sent at most once.
-- The DDL is `prisma migrate diff` from the previous schema; the UPDATE is hand-written.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SETUP_REMINDER';

-- AlterTable
ALTER TABLE "RepairerProfile" ADD COLUMN     "setupReminder3dAt" TIMESTAMP(3),
ADD COLUMN     "setupReminder8dAt" TIMESTAMP(3);

-- Backfill (DEC8-08 (4)): every repairer profile that exists when E1 goes live is marked settled, so the
-- client's test accounts and the demo world never get a reminder. Only the two new columns are written.
UPDATE "RepairerProfile" SET "setupReminder3dAt" = CURRENT_TIMESTAMP, "setupReminder8dAt" = CURRENT_TIMESTAMP;
