-- CF4-E: system messages and notification routing. Five members: two for the dispute
-- lifecycle (DISPUTE_OPENED, DISPUTE_DISMISSED) and three for identity verification
-- outcomes (IDENTITY_VERIFIED, IDENTITY_DOCUMENTS_REQUIRED, VERIFICATION_REVOKED). Keep in
-- step with `notificationTypeSchema` in packages/shared.
--
-- ALTER TYPE ... ADD VALUE may not have its new value USED in the same transaction, and
-- Prisma runs this file in one. Nothing here uses the new values, so the constraint is met.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_OPENED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_DISMISSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'IDENTITY_VERIFIED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'IDENTITY_DOCUMENTS_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VERIFICATION_REVOKED';
