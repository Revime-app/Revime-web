-- RU-29 / A3: the verification alert « même IBAN sur plusieurs comptes » needs something that identifies a bank
-- account. The last four digits (ibanLast4) do not. Stripe gives a platform one fingerprint per bank account across
-- all its connected accounts, so two réparateurs with the same value share an IBAN.
-- Additive and nullable, so the running API keeps working while this applies. Filled at each account's next Connect
-- sync (webhook or the admin « Synchroniser »); nothing is backfilled here because the value lives at Stripe.
ALTER TABLE "ConnectAccount" ADD COLUMN "ibanFingerprint" TEXT;
