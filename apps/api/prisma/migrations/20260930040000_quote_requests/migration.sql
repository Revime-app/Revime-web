-- CF4-H (CF4-24 / CF4-25): private « Demander un devis » requests.
-- Spec docs/superpowers/specs/2026-09-30-cf4-h-devis-browse-design.md §4.1.
--
-- A private request is a "Demande" with "targetRepairerUserId" set; every existing row keeps
-- NULL (= public). Additive only: one enum, six nullable columns, two indexes, four
-- NotificationType values. No data statement. Hand-written, NEVER applied locally; applied at
-- the owner's deploy after 20260930030000_admin_roles_2fa.
--
-- No foreign key on "targetRepairerUserId": deleting an account must not cascade away order
-- history (same call as Review.moderatedByUserId). Account deletion closes the request instead.
--
-- ALTER TYPE ... ADD VALUE may not have its new value USED in the same transaction, and
-- nothing below uses it.

CREATE TYPE "QuoteClosedReason" AS ENUM ('DECLINED', 'EXPIRED', 'QUOTE_REFUSED', 'CANCELLED_BY_CLIENT');

ALTER TABLE "Demande" ADD COLUMN "targetRepairerUserId" TEXT;
ALTER TABLE "Demande" ADD COLUMN "quoteClosedReason" "QuoteClosedReason";
ALTER TABLE "Demande" ADD COLUMN "quoteDeclineNote" TEXT;
ALTER TABLE "Demande" ADD COLUMN "quoteExpiresAt" TIMESTAMP(3);
ALTER TABLE "Demande" ADD COLUMN "quotePreferredTravel" "TravelMode";
ALTER TABLE "Demande" ADD COLUMN "quoteDetails" TEXT;

CREATE INDEX "Demande_targetRepairerUserId_idx" ON "Demande"("targetRepairerUserId");

-- H6: one open private request per client -> réparateur pair. SQL-only (Prisma cannot express
-- a partial unique index); the service maps its P2002 to the French message.
CREATE UNIQUE INDEX "Demande_open_quote_request_key" ON "Demande"("authorUserId", "targetRepairerUserId") WHERE "status" = 'OPEN' AND "deletedAt" IS NULL AND "targetRepairerUserId" IS NOT NULL;

ALTER TYPE "NotificationType" ADD VALUE 'QUOTE_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'QUOTE_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'QUOTE_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'QUOTE_REFUSED';
