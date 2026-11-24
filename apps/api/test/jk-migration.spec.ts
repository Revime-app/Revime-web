import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CF4 sub-projects J + K (spec §4.1). Static checks on the hand-written migration and schema.
 * fs only - no PrismaService, no database. Pattern: `i-migration.spec.ts`.
 */

const PRISMA_DIR = fileURLToPath(new URL('../prisma/', import.meta.url));
const MIGRATION = join(PRISMA_DIR, 'migrations', '20261001010000_disputes_spaces_push', 'migration.sql');
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

describe('J+K migration: 20261001010000_disputes_spaces_push', () => {
  it('carries a CF4-J+K header comment', () => {
    expect(raw()).toMatch(/^-- CF4-J\+K/);
  });

  it('creates the DisputeMotif enum in Task 1 order', () => {
    expect(code()).toContain(
      `CREATE TYPE "DisputeMotif" AS ENUM ('REPAIR_NON_CONFORMING', 'ITEM_DAMAGED', 'REPAIR_INCOMPLETE', 'DEADLINE_MISSED', 'CLIENT_UNREACHABLE', 'ITEM_NOT_AS_DESCRIBED', 'ITEM_NOT_HANDED_OVER', 'SERVICE_DISAGREEMENT', 'OTHER');`,
    );
  });

  it('creates the DisputeSpace and DisputeMessageAuthor enums', () => {
    expect(code()).toContain(`CREATE TYPE "DisputeSpace" AS ENUM ('CLIENT', 'REPAIRER');`);
    expect(code()).toContain(`CREATE TYPE "DisputeMessageAuthor" AS ENUM ('PARTY', 'REVIME');`);
  });

  it('creates the DisputeMessage table with the spec §4.1 columns', () => {
    const c = code();
    expect(c).toContain('CREATE TABLE "DisputeMessage"');
    for (const col of [
      '"id" TEXT NOT NULL',
      '"disputeId" TEXT NOT NULL',
      '"space" "DisputeSpace" NOT NULL',
      '"author" "DisputeMessageAuthor" NOT NULL',
      '"senderUserId" TEXT',
      '"body" TEXT NOT NULL DEFAULT \'\'',
      '"photoPath" TEXT',
      '"documentPath" TEXT',
      '"documentName" TEXT',
      '"documentSizeBytes" INTEGER',
      '"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
      '"deletedAt" TIMESTAMP(3)',
    ]) {
      expect(c).toContain(col);
    }
  });

  it('cascades on disputeId delete', () => {
    expect(code()).toMatch(
      /ALTER TABLE "DisputeMessage" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("disputeId"\) REFERENCES "Dispute"\("id"\) ON DELETE CASCADE/,
    );
  });

  it('indexes DisputeMessage(disputeId, space, createdAt)', () => {
    expect(code()).toMatch(
      /CREATE INDEX "[^"]+" ON "DisputeMessage"\("disputeId", "space", "createdAt"\);/,
    );
  });

  it('adds Dispute.number with a sequence / autoincrement and a unique index', () => {
    const c = code();
    expect(c).toMatch(/ALTER TABLE "Dispute" ADD COLUMN "number" (SERIAL|INTEGER NOT NULL DEFAULT nextval)/);
    expect(c).toMatch(/CREATE UNIQUE INDEX "[^"]+" ON "Dispute"\("number"\);/);
  });

  it('adds nullable columns to Dispute, Message, and PushToken', () => {
    const c = code();
    expect(c).toContain('ALTER TABLE "Dispute" ADD COLUMN "motif" "DisputeMotif";');
    expect(c).toContain('ALTER TABLE "Dispute" ADD COLUMN "clientLastReadAt" TIMESTAMP(3);');
    expect(c).toContain('ALTER TABLE "Dispute" ADD COLUMN "repairerLastReadAt" TIMESTAMP(3);');
    expect(c).toContain('ALTER TABLE "Message" ADD COLUMN "documentPath" TEXT;');
    expect(c).toContain('ALTER TABLE "Message" ADD COLUMN "documentName" TEXT;');
    expect(c).toContain('ALTER TABLE "Message" ADD COLUMN "documentSizeBytes" INTEGER;');
    expect(c).toContain('ALTER TABLE "PushToken" ADD COLUMN "soundChannel" TEXT;');
  });

  it('adds SUPPORT to MessageKind and DISPUTE_MESSAGE to NotificationType', () => {
    const c = code();
    expect(c).toContain("ALTER TYPE \"MessageKind\" ADD VALUE 'SUPPORT';");
    expect(c).toContain("ALTER TYPE \"NotificationType\" ADD VALUE 'DISPUTE_MESSAGE';");
  });

  it('is additive: no UPDATE / DELETE / DROP statement, and the only NOT NULL column added to existing tables is Dispute.number', () => {
    const c = code();
    const withoutFkClauses = c.replace(/ON (DELETE|UPDATE) (CASCADE|RESTRICT|SET NULL|NO ACTION)/gi, '');
    expect(withoutFkClauses).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bDROP\b/i);

    // Look for all ADD COLUMN in existing tables (Dispute, Message, PushToken)
    const alters = c.match(/ALTER TABLE "(Dispute|Message|PushToken)" ADD COLUMN[^;]*;/g) ?? [];
    for (const alter of alters) {
      if (alter.includes('"number"')) {
        // Dispute.number is the one allowed NOT NULL (via SERIAL / default sequence)
        continue;
      }
      expect(alter).not.toMatch(/NOT NULL/);
    }
  });
});

describe('J+K schema.prisma', () => {
  it('declares the DisputeMessage model', () => {
    const m = block('model', 'DisputeMessage');
    expect(m).toMatch(/disputeId\s+String/);
    expect(m).toMatch(/space\s+DisputeSpace/);
    expect(m).toMatch(/author\s+DisputeMessageAuthor/);
    expect(m).toMatch(/senderUserId\s+String\?/);
    expect(m).toMatch(/body\s+String\s+@default\(""\)/);
    expect(m).toMatch(/photoPath\s+String\?/);
    expect(m).toMatch(/documentPath\s+String\?/);
    expect(m).toMatch(/documentName\s+String\?/);
    expect(m).toMatch(/documentSizeBytes\s+Int\?/);
    expect(m).toMatch(/onDelete:\s*Cascade/);
    expect(m).toMatch(/@@index\(\[disputeId,\s*space,\s*createdAt\]\)/);
  });

  it('declares Dispute with number, motif, read markers, and messages relation', () => {
    const d = block('model', 'Dispute');
    expect(d).toMatch(/number\s+Int\s+@unique\s+@default\(autoincrement\(\)\)/);
    expect(d).toMatch(/motif\s+DisputeMotif\?/);
    expect(d).toMatch(/clientLastReadAt\s+DateTime\?/);
    expect(d).toMatch(/repairerLastReadAt\s+DateTime\?/);
    expect(d).toMatch(/messages\s+DisputeMessage\[\]/);
  });

  it('declares DisputeMotif enum with the Task 1 member order', () => {
    expect(block('enum', 'DisputeMotif')).toBe(
      ' REPAIR_NON_CONFORMING ITEM_DAMAGED REPAIR_INCOMPLETE DEADLINE_MISSED CLIENT_UNREACHABLE ITEM_NOT_AS_DESCRIBED ITEM_NOT_HANDED_OVER SERVICE_DISAGREEMENT OTHER ',
    );
  });

  it('declares DisputeSpace and DisputeMessageAuthor enums', () => {
    expect(block('enum', 'DisputeSpace')).toBe(' CLIENT REPAIRER ');
    expect(block('enum', 'DisputeMessageAuthor')).toBe(' PARTY REVIME ');
  });

  it('declares MessageKind.SUPPORT and NotificationType.DISPUTE_MESSAGE', () => {
    expect(block('enum', 'MessageKind')).toMatch(/\bSUPPORT\b/);
    expect(block('enum', 'NotificationType')).toMatch(/\bDISPUTE_MESSAGE\b/);
  });

  it('declares Message document fields and PushToken soundChannel', () => {
    const msg = block('model', 'Message');
    expect(msg).toMatch(/documentPath\s+String\?/);
    expect(msg).toMatch(/documentName\s+String\?/);
    expect(msg).toMatch(/documentSizeBytes\s+Int\?/);

    const pt = block('model', 'PushToken');
    expect(pt).toMatch(/soundChannel\s+String\?/);
  });
});
