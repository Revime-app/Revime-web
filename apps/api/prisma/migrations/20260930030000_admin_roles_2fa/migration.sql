-- CF4-N (CF4-40 roles, CF4-41 staff 2FA). Spec docs/superpowers/specs/2026-09-30-cf4-n-admin-roles-2fa-design.md §4.5.
-- Hand-written. Additive, except the ONE data statement at the end (decision N6).

-- Better Auth twoFactor plugin table (node_modules/better-auth/dist/plugins/two-factor/schema.mjs).
CREATE TABLE "twoFactor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "failedVerificationCount" INTEGER DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "twoFactor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "twoFactor_secret_idx" ON "twoFactor"("secret");
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor"("userId");

ALTER TABLE "twoFactor" ADD CONSTRAINT "twoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Plugin field on the user.
ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" BOOLEAN DEFAULT false;

-- N5: the proof of the second factor lives on the SESSION, stamped by our hooks.after.
ALTER TABLE "session" ADD COLUMN "twoFactorVerifiedAt" TIMESTAMP(3);

-- The actor's role at the time of the action.
ALTER TABLE "AdminAuditLog" ADD COLUMN "actorRole" TEXT;

-- N6: today's admin account becomes the Super Admin. The table is mapped "user".
UPDATE "user" SET "role" = 'super_admin' WHERE "role" = 'admin';
