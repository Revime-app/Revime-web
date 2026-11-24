import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` `DEC9-10` (3)). One additive enum value for the failed-revocation alert.
 * Read as text: no database (vitest loads `.env`, whose DATABASE_URL is production).
 */
const FILE = fileURLToPath(
  new URL('../prisma/migrations/20261119020000_v9_u3_provider_revoke_alert/migration.sql', import.meta.url),
);
const SCHEMA = fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url));
const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim();
/** The SQL without its `--` comments, so prose cannot satisfy or trip a check. */
const code = () => squash(readFileSync(FILE, 'utf8').replace(/--.*$/gm, ''));

describe('V9 U3 migration', () => {
  it('exists', () => {
    expect(existsSync(FILE)).toBe(true);
  });

  it('adds exactly one alert type value and nothing else', () => {
    expect(code()).toBe(`ALTER TYPE "AdminAlertType" ADD VALUE IF NOT EXISTS 'PROVIDER_REVOKE_FAILED';`);
  });

  it('the schema lists the value in AdminAlertType', () => {
    const schema = readFileSync(SCHEMA, 'utf8');
    const block = schema.slice(schema.indexOf('enum AdminAlertType {'));
    expect(block.slice(0, block.indexOf('}'))).toMatch(/^\s+PROVIDER_REVOKE_FAILED$/m);
  });
});
