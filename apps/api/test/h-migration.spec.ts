import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CF4 sub-project H (spec §4.1). Static checks on the hand-written migration and the schema.
 * fs only - no PrismaService, no database (vitest loads `.env`, whose DATABASE_URL is production).
 */

const PRISMA_DIR = fileURLToPath(new URL('../prisma/', import.meta.url));
const MIGRATION = join(PRISMA_DIR, 'migrations', '20260930040000_quote_requests', 'migration.sql');
const squash = (s: string) => s.replace(/\s+/g, ' ');
const raw = () => {
  expect(existsSync(MIGRATION), 'migration.sql exists').toBe(true);
  return readFileSync(MIGRATION, 'utf8');
};
/** SQL with `--` comments removed. Split on CRLF or LF (a kept `\r` defeats `--.*$`). */
const code = () =>
  squash(
    raw()
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n'),
  );
const schema = () => readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
const block = (kind: 'model' | 'enum', name: string) =>
  squash(schema().match(new RegExp(`^${kind} ${name} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1] ?? '');

describe('H migration: 20260930040000_quote_requests', () => {
  it('carries a CF4-H header comment', () => {
    expect(raw()).toMatch(/^-- CF4-H/);
  });

  it('creates the QuoteClosedReason enum', () => {
    expect(code()).toContain(
      `CREATE TYPE "QuoteClosedReason" AS ENUM ('DECLINED', 'EXPIRED', 'QUOTE_REFUSED', 'CANCELLED_BY_CLIENT');`,
    );
  });

  it.each([
    '"targetRepairerUserId" TEXT',
    '"quoteClosedReason" "QuoteClosedReason"',
    '"quoteDeclineNote" TEXT',
    '"quoteExpiresAt" TIMESTAMP(3)',
    '"quotePreferredTravel" "TravelMode"',
    '"quoteDetails" TEXT',
  ])('adds Demande column %s', (col) => {
    expect(code()).toContain(`ALTER TABLE "Demande" ADD COLUMN ${col}`);
  });

  it('indexes targetRepairerUserId', () => {
    expect(code()).toMatch(/CREATE INDEX "[^"]+" ON "Demande"\("targetRepairerUserId"\);/);
  });

  it('backs H6 with a partial unique index on (author, target) for open private rows', () => {
    const m = code().match(
      /CREATE UNIQUE INDEX "[^"]+" ON "Demande"\("authorUserId", "targetRepairerUserId"\) WHERE ([^;]+);/,
    );
    expect(m, 'partial unique index').not.toBeNull();
    const where = m![1]!;
    expect(where).toContain(`"status" = 'OPEN'`);
    expect(where).toContain('"deletedAt" IS NULL');
    expect(where).toContain('"targetRepairerUserId" IS NOT NULL');
  });

  it.each(['QUOTE_REQUESTED', 'QUOTE_DECLINED', 'QUOTE_EXPIRED', 'QUOTE_REFUSED'])(
    'adds NotificationType %s',
    (v) => {
      expect(code()).toContain(`ALTER TYPE "NotificationType" ADD VALUE '${v}';`);
    },
  );

  it('is additive: no UPDATE / DELETE / DROP / NOT NULL constraint / REFERENCES', () => {
    // `IS NOT NULL` in the partial index's WHERE is a predicate the plan requires, not a constraint.
    expect(code()).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bDROP\b|(?<!IS )NOT NULL|\bREFERENCES\b/i);
  });
});

describe('H schema.prisma', () => {
  it('declares the six optional Demande fields with no relation on the target', () => {
    const d = block('model', 'Demande');
    expect(d).toMatch(/targetRepairerUserId String\?/);
    expect(d).toMatch(/quoteClosedReason QuoteClosedReason\?/);
    expect(d).toMatch(/quoteDeclineNote String\?/);
    expect(d).toMatch(/quoteExpiresAt DateTime\?/);
    expect(d).toMatch(/quotePreferredTravel TravelMode\?/);
    expect(d).toMatch(/quoteDetails String\?/);
    expect(d).not.toMatch(/fields: \[targetRepairerUserId\]/);
    expect(d).toMatch(/@@index\(\[targetRepairerUserId\]\)/);
  });

  it('declares the enum and the four notification values', () => {
    expect(block('enum', 'QuoteClosedReason')).toBe(' DECLINED EXPIRED QUOTE_REFUSED CANCELLED_BY_CLIENT ');
    const n = block('enum', 'NotificationType');
    for (const v of ['QUOTE_REQUESTED', 'QUOTE_DECLINED', 'QUOTE_EXPIRED', 'QUOTE_REFUSED']) {
      expect(n).toMatch(new RegExp(`\\b${v}\\b`));
    }
  });
});
