import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CF4 sub-project N (spec §4.5). Static checks on the hand-written migration and the schema.
 * fs only - no PrismaService, no database (vitest loads `.env`, whose DATABASE_URL is production).
 */

const PRISMA_DIR = fileURLToPath(new URL('../prisma/', import.meta.url));
const MIGRATION = join(PRISMA_DIR, 'migrations', '20260930030000_admin_roles_2fa', 'migration.sql');
const squash = (s: string) => s.replace(/\s+/g, ' ');
const sql = () => {
  expect(existsSync(MIGRATION), 'migration.sql exists').toBe(true);
  return squash(readFileSync(MIGRATION, 'utf8'));
};
/** SQL with `--` comments removed. Split on CRLF or LF (a kept `\r` defeats `--.*$`). */
const code = () =>
  squash(
    readFileSync(MIGRATION, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n'),
  );
const model = (name: string) => {
  const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
  return squash(schema.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1] ?? '');
};

/** The body of the CREATE TABLE "twoFactor" statement, up to its closing `);`. */
const twoFactorTable = () => code().match(/CREATE TABLE "twoFactor" \((.*?)\);/)?.[1] ?? '';

describe('N migration: 20260930030000_admin_roles_2fa', () => {
  it('creates the twoFactor table with the plugin columns', () => {
    const t = twoFactorTable();
    expect(t).not.toBe('');
    for (const col of [
      '"id" TEXT NOT NULL',
      '"secret" TEXT NOT NULL',
      '"backupCodes" TEXT NOT NULL',
      '"userId" TEXT NOT NULL',
      '"verified" BOOLEAN',
      '"failedVerificationCount" INTEGER',
      '"lockedUntil" TIMESTAMP(3)',
    ]) {
      expect(t).toContain(col);
    }
  });

  it('references the user with ON DELETE CASCADE', () => {
    expect(code()).toMatch(
      /FOREIGN KEY \("userId"\) REFERENCES "user"\("id"\) ON DELETE CASCADE/,
    );
  });

  it.each([
    'ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" BOOLEAN DEFAULT false',
    'ALTER TABLE "session" ADD COLUMN "twoFactorVerifiedAt" TIMESTAMP(3)',
    'ALTER TABLE "AdminAuditLog" ADD COLUMN "actorRole" TEXT',
  ])('contains %s', (fragment) => {
    expect(code()).toContain(fragment);
  });

  it('has exactly one UPDATE and it is the N6 promotion', () => {
    // `ON UPDATE CASCADE` on the foreign key is a clause, not a statement.
    const updates = code().match(/(?<!ON )\bUPDATE\b[^;]*;/gi) ?? [];
    expect(updates).toEqual([`UPDATE "user" SET "role" = 'super_admin' WHERE "role" = 'admin';`]);
  });

  it('drops and deletes nothing', () => {
    // `ON DELETE CASCADE` on the foreign key is a clause the plan requires, not a statement.
    expect(code()).not.toMatch(/\bDROP\b|(?<!ON )\bDELETE\b/i);
  });

  it('adds NOT NULL only inside the new twoFactor table', () => {
    const outside = code().replace(/CREATE TABLE "twoFactor" \(.*?\);/, '');
    expect(outside).not.toMatch(/NOT NULL/i);
  });

  it('carries a CF4-N header comment', () => {
    expect(sql()).toMatch(/^-- CF4-N/);
  });
});

describe('N schema.prisma', () => {
  it('declares the TwoFactor model with the plugin fields, mapped to "twoFactor"', () => {
    const tf = model('TwoFactor');
    expect(tf).toMatch(/secret String/);
    expect(tf).toMatch(/backupCodes String/);
    expect(tf).toMatch(/userId String/);
    expect(tf).toMatch(/verified Boolean\? @default\(true\)/);
    expect(tf).toMatch(/failedVerificationCount Int\? @default\(0\)/);
    expect(tf).toMatch(/lockedUntil DateTime\?/);
    expect(tf).toMatch(/onDelete: Cascade/);
    expect(tf).toMatch(/@@map\("twoFactor"\)/);
  });

  it('adds the user, session and audit fields', () => {
    expect(model('User')).toMatch(/twoFactorEnabled Boolean\? @default\(false\)/);
    expect(model('Session')).toMatch(/twoFactorVerifiedAt DateTime\?/);
    expect(model('AdminAuditLog')).toMatch(/actorRole String\?/);
  });
});
