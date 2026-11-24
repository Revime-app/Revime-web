import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CF4 sub-project I (spec §4.1). Static checks on the hand-written migration and the schema.
 * fs only - no PrismaService, no database (vitest loads `.env`, whose DATABASE_URL is production).
 * Pattern: `h-migration.spec.ts`.
 */

const PRISMA_DIR = fileURLToPath(new URL('../prisma/', import.meta.url));
const MIGRATION = join(PRISMA_DIR, 'migrations', '20260930050000_cancellation_requests', 'migration.sql');
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

describe('I migration: 20260930050000_cancellation_requests', () => {
  it('carries a CF4-I header comment', () => {
    expect(raw()).toMatch(/^-- CF4-I/);
  });

  it('creates the CancellationRequestStatus enum in Task 1 order', () => {
    expect(code()).toContain(
      `CREATE TYPE "CancellationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REFUSED', 'WITHDRAWN', 'SUPERSEDED');`,
    );
  });

  it('creates the CancellationReason enum in Task 1 order', () => {
    expect(code()).toContain(
      `CREATE TYPE "CancellationReason" AS ENUM ('NO_LONGER_NEEDED', 'TOO_SLOW', 'REPAIRER_UNRESPONSIVE', 'OTHER_SOLUTION', 'OTHER');`,
    );
  });

  it('creates the CancellationRequest table with the spec §4.1 columns', () => {
    const c = code();
    expect(c).toContain('CREATE TABLE "CancellationRequest"');
    for (const col of [
      '"id" TEXT NOT NULL',
      '"commandeId" TEXT NOT NULL',
      '"requestedByUserId" TEXT NOT NULL',
      '"reason" "CancellationReason" NOT NULL',
      '"comment" TEXT',
      '"status" "CancellationRequestStatus" NOT NULL',
      '"decidedAt" TIMESTAMP(3)',
      '"decidedByUserId" TEXT',
      '"refusalNote" TEXT',
    ]) {
      expect(c).toContain(col);
    }
  });

  it('cascades on commandeId delete', () => {
    expect(code()).toMatch(
      /ALTER TABLE "CancellationRequest" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("commandeId"\) REFERENCES "Commande"\("id"\) ON DELETE CASCADE/,
    );
  });

  it('has a partial unique index on commandeId WHERE status = PENDING', () => {
    expect(code()).toMatch(
      /CREATE UNIQUE INDEX "[^"]+" ON "CancellationRequest"\("commandeId"\) WHERE "status" = 'PENDING';/,
    );
  });

  it('indexes (status, createdAt)', () => {
    expect(code()).toMatch(
      /CREATE INDEX "[^"]+" ON "CancellationRequest"\("status", "createdAt"\);/,
    );
  });

  it('adds Commande.cancellationRequestedAt with no NOT NULL', () => {
    expect(code()).toContain('ALTER TABLE "Commande" ADD COLUMN "cancellationRequestedAt" TIMESTAMP(3);');
  });

  it.each(['CANCELLATION_REQUESTED', 'CANCELLATION_WITHDRAWN', 'CANCELLATION_REFUSED'])(
    'adds NotificationType %s',
    (v) => {
      expect(code()).toContain(`ALTER TYPE "NotificationType" ADD VALUE '${v}';`);
    },
  );

  it('is additive: no UPDATE / DELETE / DROP statement, and no NOT NULL outside the CancellationRequest table', () => {
    const c = code();
    // `ON DELETE CASCADE` / `ON UPDATE CASCADE` are legitimate FK clauses, not destructive
    // statements - excluded the same way h-migration.spec.ts excludes `IS NOT NULL` from its
    // own NOT NULL ban. Strip them before checking for a bare UPDATE/DELETE/DROP keyword.
    const withoutFkClauses = c.replace(/ON (DELETE|UPDATE) (CASCADE|RESTRICT|SET NULL|NO ACTION)/gi, '');
    expect(withoutFkClauses).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bDROP\b/i);
    // The relaxed check (handoff fact): the NOT NULL ban excludes CancellationRequest's own
    // required columns, but the single Commande ALTER line must still carry none.
    const commandeLine = c.match(/ALTER TABLE "Commande" ADD COLUMN "cancellationRequestedAt"[^;]*;/)?.[0] ?? '';
    expect(commandeLine).not.toMatch(/NOT NULL/);
  });

  it('has no other ALTER TABLE "Commande" line', () => {
    const alters = code().match(/ALTER TABLE "Commande" ADD COLUMN[^;]*;/g) ?? [];
    expect(alters).toHaveLength(1);
  });
});

describe('I schema.prisma', () => {
  it('declares the CancellationRequest model', () => {
    const m = block('model', 'CancellationRequest');
    expect(m).toMatch(/commandeId\s+String/);
    expect(m).toMatch(/requestedByUserId\s+String/);
    expect(m).toMatch(/reason\s+CancellationReason/);
    expect(m).toMatch(/comment\s+String\?/);
    expect(m).toMatch(/status\s+CancellationRequestStatus/);
    expect(m).toMatch(/decidedAt\s+DateTime\?/);
    expect(m).toMatch(/decidedByUserId\s+String\?/);
    expect(m).toMatch(/refusalNote\s+String\?/);
    expect(m).toMatch(/onDelete:\s*Cascade/);
  });

  it('declares both enums with the Task 1 member order', () => {
    expect(block('enum', 'CancellationRequestStatus')).toBe(' PENDING APPROVED REFUSED WITHDRAWN SUPERSEDED ');
    expect(block('enum', 'CancellationReason')).toBe(
      ' NO_LONGER_NEEDED TOO_SLOW REPAIRER_UNRESPONSIVE OTHER_SOLUTION OTHER ',
    );
  });

  it('declares Commande.cancellationRequestedAt and its relation to CancellationRequest', () => {
    const c = block('model', 'Commande');
    expect(c).toMatch(/cancellationRequestedAt\s+DateTime\?/);
    expect(c).toMatch(/cancellationRequests\s+CancellationRequest\[\]/);
  });

  it('declares the three notification values', () => {
    const n = block('enum', 'NotificationType');
    for (const v of ['CANCELLATION_REQUESTED', 'CANCELLATION_WITHDRAWN', 'CANCELLATION_REFUSED']) {
      expect(n).toMatch(new RegExp(`\\b${v}\\b`));
    }
  });
});
