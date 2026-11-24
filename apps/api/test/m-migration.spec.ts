import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CF4 sub-project M (spec §4.1). Static checks on the hand-written migration and the schema.
 * fs only - no PrismaService, no database (vitest loads `.env`, whose DATABASE_URL is production).
 * The migration is NEVER applied locally; it ships with the owner's deploy.
 */

const PRISMA_DIR = fileURLToPath(new URL('../prisma/', import.meta.url));
const MIGRATION = join(PRISMA_DIR, 'migrations', '20260930020000_identity_decisions', 'migration.sql');
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

const block = (kind: 'model' | 'enum', name: string) => {
  const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
  return squash(schema.match(new RegExp(`^${kind} ${name} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1] ?? '');
};
const members = (name: string) =>
  block('enum', name)
    .trim()
    .split(' ')
    .filter((w) => /^[A-Z_]+$/.test(w));

describe('M migration: 20260930020000_identity_decisions', () => {
  it.each([
    `CREATE TYPE "IdentityDecision" AS ENUM ('ACCEPTED', 'REFUSED', 'DOCUMENTS_REQUESTED')`,
    `CREATE TYPE "IdentityDecisionMotif" AS ENUM ('ILLEGIBLE', 'EXPIRED', 'INCONSISTENT', 'WRONG_DOCUMENT', 'OTHER')`,
    'ALTER TABLE "IdentityVerification" ADD COLUMN "decision" "IdentityDecision"',
    '"decisionMotif" "IdentityDecisionMotif"',
    '"decisionNote" TEXT',
    '"decidedAt" TIMESTAMP(3)',
    '"decidedByUserId" TEXT',
  ])('contains %s', (fragment) => {
    expect(code()).toContain(fragment);
  });

  it('is additive: no DROP, NOT NULL, UPDATE, DELETE or foreign key', () => {
    expect(code()).not.toMatch(/\bDROP\b|NOT NULL|\bUPDATE\b|\bDELETE\b|FOREIGN KEY|REFERENCES/i);
  });

  it('carries a CF4-M header comment', () => {
    expect(sql()).toMatch(/^-- CF4-M/);
  });
});

describe('M schema.prisma', () => {
  it('IdentityVerification declares the five decision fields, optional, no relation for the decider', () => {
    const iv = block('model', 'IdentityVerification');
    expect(iv).toMatch(/decision IdentityDecision\?/);
    expect(iv).toMatch(/decisionMotif IdentityDecisionMotif\?/);
    expect(iv).toMatch(/decisionNote String\?/);
    expect(iv).toMatch(/decidedAt DateTime\?/);
    expect(iv).toMatch(/decidedByUserId String\?/);
    expect(iv).not.toMatch(/fields: \[decidedByUserId\]/);
  });

  it('declares both enums with their members in order', () => {
    expect(members('IdentityDecision')).toEqual(['ACCEPTED', 'REFUSED', 'DOCUMENTS_REQUESTED']);
    expect(members('IdentityDecisionMotif')).toEqual(['ILLEGIBLE', 'EXPIRED', 'INCONSISTENT', 'WRONG_DOCUMENT', 'OTHER']);
  });
});
