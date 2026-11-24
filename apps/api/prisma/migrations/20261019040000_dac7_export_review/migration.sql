-- RU-28 / CMP-D4: the DAC7 annual export reports money by the date it moved, and shows a masked IBAN.
-- Both columns are additive and nullable, so the running API keeps working while this applies.

-- When the transfer to the reparateur was made. `releasedAt` is the date the order was released, which
-- differs for an order held for an incomplete fiscal declaration and paid by a later sweep.
ALTER TABLE "Commande" ADD COLUMN "transferredAt" TIMESTAMP(3);

-- Every row that already has a transfer was paid at release (the fiscal hold is new in this round), so
-- its release date is the only date there is, and the right one.
UPDATE "Commande" SET "transferredAt" = "releasedAt" WHERE "stripeTransferId" IS NOT NULL;

-- Last four characters of the payout account's IBAN, read from Stripe at sync time. Null until a sync
-- sees a bank account: the export then shows no IBAN rather than an invented one.
ALTER TABLE "ConnectAccount" ADD COLUMN "ibanLast4" TEXT;
