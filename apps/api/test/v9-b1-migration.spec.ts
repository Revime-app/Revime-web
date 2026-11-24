import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-04` (6), `DEC9-05`). The migration is read as text: no database
 * (vitest loads `.env`, whose DATABASE_URL is production). Additive only, two backfills on "user".
 */
const FILE = fileURLToPath(
  new URL('../prisma/migrations/20261119010000_v9_b1_signup_completion/migration.sql', import.meta.url),
);
const SCHEMA = fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url));
const squash = (sql: string) => sql.replace(/\s+/g, ' ');
const sql = () => squash(readFileSync(FILE, 'utf8'));
/** The SQL without its `--` comments, so prose cannot satisfy or trip a check. */
const code = () => squash(readFileSync(FILE, 'utf8').replace(/--.*$/gm, ''));

describe('V9 B1 migration', () => {
  it('exists', () => {
    expect(existsSync(FILE)).toBe(true);
  });

  it('creates the sign-up method type and the privacy proof kind', () => {
    expect(sql()).toContain(`CREATE TYPE "SignupMethod" AS ENUM ('APPLE', 'GOOGLE', 'EMAIL');`);
    expect(sql()).toContain(`ALTER TYPE "ConsentProofKind" ADD VALUE IF NOT EXISTS 'PRIVACY_ACCEPTANCE';`);
  });

  it('adds the seven nullable or defaulted columns', () => {
    const s = sql();
    expect(s).toContain('ADD COLUMN "privacyAccepted" BOOLEAN NOT NULL DEFAULT false');
    expect(s).toContain('ADD COLUMN "signupMethod" "SignupMethod"');
    expect(s).toContain('ADD COLUMN "usernameConfirmedAt" TIMESTAMP(3)');
    expect(s).toContain('ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3)');
    expect(s).toContain('ADD COLUMN "privacyVersion" TEXT');
    expect(s).toMatch(/ALTER TABLE "ConsentProof" ADD COLUMN "privacyVersion" TEXT;/);
    expect(s).toContain(`ALTER TABLE "PlatformSettings" ADD COLUMN "privacyCurrentVersion" TEXT NOT NULL DEFAULT '2026-11-19';`);
  });

  it('runs exactly two backfills, both on "user", writing only the method and the confirmed username', () => {
    const updates = code().match(/UPDATE "[^"]+"[^;]*;/g) ?? [];
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u.startsWith('UPDATE "user"')).toBe(true);
    expect(updates[0]).toContain('SET "signupMethod" =');
    expect(updates[1]).toContain('SET "usernameConfirmedAt" = u."createdAt"');
    expect(updates[1]).toContain(`"providerId" = 'credential'`);
  });

  it('drops, deletes and rewrites nothing', () => {
    expect(code()).not.toMatch(/\bDROP\b|\bDELETE\b|ALTER COLUMN/);
  });

  it('is mirrored in the schema', () => {
    const schema = readFileSync(SCHEMA, 'utf8');
    expect(schema).toMatch(/enum SignupMethod \{\s*APPLE\s*GOOGLE\s*EMAIL\s*\}/);
    expect(schema).toMatch(/enum ConsentProofKind \{[^}]*PRIVACY_ACCEPTANCE[^}]*\}/);
    expect(schema).toMatch(/signupMethod\s+SignupMethod\?/);
    expect(schema).toMatch(/usernameConfirmedAt\s+DateTime\?/);
    expect(schema).toMatch(/privacyCurrentVersion\s+String\s+@default\("2026-11-19"\)/);
  });
});
