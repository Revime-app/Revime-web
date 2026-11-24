import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CF4 sub-project L (spec §4.1). Static checks on the hand-written migration and the schema.
 * fs only - no PrismaService, no database (vitest loads `.env`, whose DATABASE_URL is production).
 * The migration is NEVER applied locally; it ships with the owner's deploy.
 */

const PRISMA_DIR = fileURLToPath(new URL('../prisma/', import.meta.url));
const MIGRATION = join(PRISMA_DIR, 'migrations', '20260930010000_tips_window_review_moderation', 'migration.sql');
const squash = (s: string) => s.replace(/\s+/g, ' ');
const sql = () => {
  expect(existsSync(MIGRATION), 'migration.sql exists').toBe(true);
  return squash(readFileSync(MIGRATION, 'utf8'));
};
/**
 * SQL with `--` comments removed, so the header comment cannot satisfy or trip a check.
 * Split on CRLF or LF: with `core.autocrlf` the checkout is CRLF, and a line keeping its `\r`
 * defeats `--.*$` (`.` does not match `\r`), leaving the comment in.
 */
const code = () =>
  squash(
    readFileSync(MIGRATION, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n'),
  );

const block = (kind: 'model' | 'enum', name: string) => {
  const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
  return squash(schema.match(new RegExp(`^${kind} ${name} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1] ?? '');
};

describe('L migration: 20260930010000_tips_window_review_moderation', () => {
  it.each([
    'ALTER TABLE "Tip" ADD COLUMN "startsAt" TIMESTAMP(3)',
    '"endsAt" TIMESTAMP(3)',
    `CREATE TYPE "ReviewModerationMotif" AS ENUM ('ABUSIVE', 'PERSONAL_DATA', 'OFF_TOPIC', 'FAKE', 'OTHER')`,
    '"moderationMotif" "ReviewModerationMotif"',
    '"moderationNote" TEXT',
    '"moderatedByUserId" TEXT',
  ])('contains %s', (fragment) => {
    expect(code()).toContain(fragment);
  });

  it('is additive: no DROP, NOT NULL, UPDATE, DELETE or foreign key', () => {
    expect(code()).not.toMatch(/\bDROP\b|NOT NULL|\bUPDATE\b|\bDELETE\b|FOREIGN KEY|REFERENCES/i);
  });

  it('carries a CF4-L header comment', () => {
    expect(sql()).toMatch(/^-- CF4-L/);
  });
});

describe('L schema.prisma', () => {
  it('Tip declares startsAt and endsAt, both optional', () => {
    const tip = block('model', 'Tip');
    expect(tip).toMatch(/startsAt DateTime\?/);
    expect(tip).toMatch(/endsAt DateTime\?/);
  });

  it('Review declares the three moderation fields, optional, with no relation for the moderator', () => {
    const review = block('model', 'Review');
    expect(review).toMatch(/moderationMotif ReviewModerationMotif\?/);
    expect(review).toMatch(/moderationNote String\?/);
    expect(review).toMatch(/moderatedByUserId String\?/);
    expect(review).not.toMatch(/fields: \[moderatedByUserId\]/);
  });

  it('declares enum ReviewModerationMotif with the five motifs', () => {
    expect(block('enum', 'ReviewModerationMotif').trim().split(' ').filter((w) => /^[A-Z_]+$/.test(w))).toEqual([
      'ABUSIVE',
      'PERSONAL_DATA',
      'OFF_TOPIC',
      'FAKE',
      'OTHER',
    ]);
  });
});
