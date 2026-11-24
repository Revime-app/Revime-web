-- V8 B2. When a client validates an order whose réparateur cannot be paid yet (no Connect account,
-- payouts not active, or fiscal information missing), Revime holds the money and tells the réparateur
-- « Votre paiement de X vous attend : terminez votre configuration pour le recevoir. ».
-- Additive: one enum value, no table, no data change.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYOUT_WAITING';
