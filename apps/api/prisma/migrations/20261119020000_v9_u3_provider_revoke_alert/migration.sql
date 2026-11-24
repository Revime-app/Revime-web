-- V9 U3 (CLIENT_FEEDBACK_V9.md DEC9-10 (3)): the dashboard alert raised when an account deletion could not
-- revoke its Apple or Google sign-in. Additive: one enum value, no row touched. Hand-authored.
ALTER TYPE "AdminAlertType" ADD VALUE IF NOT EXISTS 'PROVIDER_REVOKE_FAILED';
