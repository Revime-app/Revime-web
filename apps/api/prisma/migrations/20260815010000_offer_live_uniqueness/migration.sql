-- Offer history: a réparateur may accumulate offers on one demande over time,
-- but only one of them may be live at a time.
--
-- DROP INDEX is correct and ALTER TABLE ... DROP CONSTRAINT would fail here.
-- Verified against the live database at design time: pg_constraint on "Offer"
-- holds only Offer_pkey and the two foreign keys, so the compound uniqueness is
-- a plain unique index with no constraint backing it.
DROP INDEX "Offer_demandeId_repairerUserId_key";

-- listForDemande now reads every offer on a demande, and the partial index below
-- covers only the live ones. Without this the query that grows fastest with
-- usage is unindexed.
CREATE INDEX "Offer_demandeId_idx" ON "Offer"("demandeId");

CREATE UNIQUE INDEX "Offer_demandeId_repairerUserId_key" ON "Offer"("demandeId", "repairerUserId") WHERE ("status" = 'SENT' AND "deletedAt" IS NULL);
