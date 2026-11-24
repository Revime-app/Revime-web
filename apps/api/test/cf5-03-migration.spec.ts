import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CF5-03. `Message_kind_sender_consistent` (migration 20260825010000_message_kind) allowed only
 * USER-with-sender and SYSTEM-without; `SUPPORT` (20261001010000) was added to the enum without
 * widening it, so every « REVIME — Support » insert in a main conversation failed 23514 in
 * production. Static checks only - fs, no database (vitest loads `.env`, whose DATABASE_URL is
 * production). The migration is NEVER applied locally; it ships with the owner's deploy.
 */

const MIGRATION = join(
  fileURLToPath(new URL('../prisma/migrations/', import.meta.url)),
  '20261002010000_message_support_kind',
  'migration.sql',
);
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
/** SQL without `--` comments; split on CRLF or LF so a trailing `\r` cannot keep a comment in. */
const code = () => {
  expect(existsSync(MIGRATION), 'migration.sql exists').toBe(true);
  return squash(
    readFileSync(MIGRATION, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n'),
  );
};

describe('CF5-03 migration: 20261002010000_message_support_kind', () => {
  it('drops the old constraint before re-adding it under the same name', () => {
    const sql = code();
    const drop = sql.indexOf('ALTER TABLE "Message" DROP CONSTRAINT "Message_kind_sender_consistent"');
    const add = sql.indexOf('ALTER TABLE "Message" ADD CONSTRAINT "Message_kind_sender_consistent"');
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it.each([
    `("kind" = 'USER' AND "senderUserId" IS NOT NULL)`,
    `("kind" = 'SYSTEM' AND "senderUserId" IS NULL)`,
    `("kind" = 'SUPPORT' AND "senderUserId" IS NULL)`,
  ])('keeps or adds the arm %s', (arm) => {
    expect(code()).toContain(arm);
  });

  it('touches nothing else: one DROP CONSTRAINT, no data change, no enum change', () => {
    const sql = code();
    expect(sql.match(/\bDROP\b/gi)).toHaveLength(1);
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b|ALTER TYPE|DROP COLUMN|DROP TABLE/i);
  });
});
