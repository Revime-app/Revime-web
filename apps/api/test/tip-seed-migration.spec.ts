import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CF6-17: the baseline tips migration.
 *
 * 🛑 `20261011030000_seed_baseline_tips` is APPLIED in production (checked in `_prisma_migrations`,
 * 2026-10-18), so its file must never be edited: Prisma refuses to deploy over a changed checksum.
 * This spec therefore reads the SQL as data. It does not run it (no database in a unit run), so
 * what it proves is the SHAPE of the rows against the `Tip` model, not the statement's execution.
 */

const PRISMA_DIR = fileURLToPath(new URL('../prisma/', import.meta.url));
const SQL = readFileSync(
  join(PRISMA_DIR, 'migrations', '20261011030000_seed_baseline_tips', 'migration.sql'),
  'utf8',
);
const SCHEMA = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');

/** `('id', 'text', 'CATEGORY', true, ...)` tuples, with SQL's doubled quotes unescaped. */
function seededRows() {
  const values = SQL.slice(SQL.indexOf('VALUES'), SQL.indexOf('ON CONFLICT'));
  const rows = [...values.matchAll(/\(\s*'([^']+)',\s*'((?:[^']|'')*)',\s*'([A-Z]+)',\s*(true|false),/g)];
  return rows.map(([, id, text, category, active]) => ({
    id,
    text: text!.replace(/''/g, "'"),
    category,
    active: active === 'true',
  }));
}

describe('CF6-17: seed_baseline_tips', () => {
  const rows = seededRows();

  it('seeds exactly one ACTIVE tip for each audience, with distinct ids and non-empty text', () => {
    expect(rows.map((r) => r.category).sort()).toEqual(['CLIENT', 'REPAIRER']);
    expect(rows.every((r) => r.active)).toBe(true);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => r.text.trim().length > 0)).toBe(true);
  });

  it('uses only categories and columns that exist on the Tip model', () => {
    const model = SCHEMA.match(/model Tip \{[\s\S]*?\n\}/)![0];
    const enumBody = SCHEMA.match(/enum TipCategory \{([\s\S]*?)\}/)![1]!;
    for (const r of rows) expect(enumBody).toContain(r.category);

    const columns = SQL.match(/INSERT INTO "Tip" \(([^)]*)\)/)![1]!.split(',').map((c) => c.trim().replace(/"/g, ''));
    for (const c of columns) expect(model).toMatch(new RegExp(`^\\s*${c}\\s`, 'm'));
  });

  it('is idempotent on the primary key, so re-running never duplicates or overwrites an edited tip', () => {
    expect(SQL).toContain('ON CONFLICT ("id") DO NOTHING');
  });
});
