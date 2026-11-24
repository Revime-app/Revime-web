import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * tip-table-missing-migration — Property 1: Bug Condition. Tip relation exists after migration.
 *
 * `schema.prisma` declares `enum TipCategory` and `model Tip`, but no migration created them, so
 * `prisma.tip.findMany()` raised P2021 in production. This spec is the static counterpart of
 * `isBugCondition`: it reads `prisma/schema.prisma` and every `prisma/migrations/<dir>/migration.sql`
 * with `fs` only. No PrismaService, no database (vitest loads `.env`, whose DATABASE_URL is
 * production).
 *
 * Expected on UNFIXED code: FAILS (no migration mentions TipCategory or "Tip").
 *
 * **Validates: Requirements 1.1, 1.3, 2.3, 2.4**
 */

const PRISMA_DIR = fileURLToPath(new URL('../prisma/', import.meta.url));
const MIGRATIONS_DIR = join(PRISMA_DIR, 'migrations');

const LAST_PRE_FIX_MIGRATION = '20260922000000_catalog_brands_and_models';
const TIP_MIGRATION = '20260923000000_tips';
const OPTIONAL_SEED_MIGRATION = '20260923010000_seed_tips';

/** Collapse runs of whitespace so column assertions don't depend on Prisma's alignment. */
const squash = (sql: string) => sql.replace(/\s+/g, ' ');

const migrationDirs = (): string[] =>
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(MIGRATIONS_DIR, d.name, 'migration.sql')))
    .map((d) => d.name)
    .sort();

const readMigration = (dir: string) => readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8');

const allMigrationSql = (): { dir: string; sql: string }[] =>
  migrationDirs().map((dir) => ({ dir, sql: squash(readMigration(dir)) }));

const schemaEnums = (): string[] =>
  [...readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8').matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]!);

// ---------------------------------------------------------------------------------------------
// migrationsCoverTip(migrationsDir) — the static bug condition
// ---------------------------------------------------------------------------------------------

describe('tip migration: the migration set creates TipCategory and Tip', () => {
  it(`some migration creates enum "TipCategory" ('CLIENT', 'REPAIRER', 'ALL')`, () => {
    const hits = allMigrationSql().filter(({ sql }) =>
      sql.includes(`CREATE TYPE "TipCategory" AS ENUM ('CLIENT', 'REPAIRER', 'ALL')`),
    );
    expect(hits.map((h) => h.dir)).not.toEqual([]);
  });

  it('some migration creates table "Tip"', () => {
    const hits = allMigrationSql().filter(({ sql }) => sql.includes('CREATE TABLE "Tip" ('));
    expect(hits.map((h) => h.dir)).not.toEqual([]);
  });

  // General drift guard: a property over every enum declared in schema.prisma.
  it('every enum declared in schema.prisma is created by some migration', () => {
    const sql = allMigrationSql()
      .map((m) => m.sql)
      .join('\n');
    const missing = schemaEnums().filter((name) => !sql.includes(`CREATE TYPE "${name}"`));
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Fix checking — the shape of 20260923000000_tips/migration.sql
// ---------------------------------------------------------------------------------------------

describe(`tip migration: ${TIP_MIGRATION}/migration.sql`, () => {
  const tipSql = () => {
    const file = join(MIGRATIONS_DIR, TIP_MIGRATION, 'migration.sql');
    expect(existsSync(file), `${TIP_MIGRATION}/migration.sql exists`).toBe(true);
    return squash(readFileSync(file, 'utf8'));
  };

  it('creates the TipCategory enum with exactly CLIENT, REPAIRER, ALL', () => {
    expect(tipSql()).toContain(`CREATE TYPE "TipCategory" AS ENUM ('CLIENT', 'REPAIRER', 'ALL');`);
  });

  it.each([
    '"id" TEXT NOT NULL',
    '"text" TEXT NOT NULL',
    '"category" "TipCategory" NOT NULL',
    '"active" BOOLEAN NOT NULL DEFAULT true',
    '"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")',
  ])('the "Tip" table declares %s', (fragment) => {
    const sql = tipSql();
    const table = sql.match(/CREATE TABLE "Tip" \((.*?)\);/)?.[1] ?? '';
    expect(table).toContain(fragment);
  });

  it('creates the (category, active) index', () => {
    expect(tipSql()).toContain('CREATE INDEX "Tip_category_active_idx" ON "Tip"("category", "active");');
  });

  it('enables Row Level Security on "Tip"', () => {
    expect(tipSql()).toContain('ALTER TABLE "Tip" ENABLE ROW LEVEL SECURITY;');
  });

  /**
   * Was « the ONLY migration after … », which froze the migrations folder: the first later
   * migration (CF4, 2026-09-29) turned this red on main. What it guards is ordering - the Tip
   * table is created DIRECTLY after the catalog migration, with nothing slipped in between -
   * so that is what it now asserts. Later migrations are legitimate and do not concern it.
   */
  it(`comes directly after ${LAST_PRE_FIX_MIGRATION} (later migrations allowed)`, () => {
    const newer = migrationDirs()
      .filter((d) => d > LAST_PRE_FIX_MIGRATION && d !== OPTIONAL_SEED_MIGRATION)
      .sort();
    expect(newer[0]).toBe(TIP_MIGRATION);
  });
});

// ---------------------------------------------------------------------------------------------
// Property 2: Preservation — the new migration only creates Tip objects
//
// Skipped until the migration exists (so it adds no failures on unfixed code).
// **Validates: Requirements 3.1, 3.2, 3.3**
// ---------------------------------------------------------------------------------------------

const TIP_MIGRATION_FILE = join(MIGRATIONS_DIR, TIP_MIGRATION, 'migration.sql');

/** Split a migration into statements, ignoring `--` line comments and blank fragments. */
const statements = (raw: string): string[] =>
  raw
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => squash(s).trim())
    .filter((s) => s.length > 0);

const ALLOWED_STATEMENTS: RegExp[] = [
  /^CREATE TYPE "TipCategory" AS ENUM \(/,
  /^CREATE TABLE "Tip" \(/,
  /^CREATE (UNIQUE )?INDEX "Tip_\w+" ON "Tip"\(/,
  /^ALTER TABLE "Tip" ENABLE ROW LEVEL SECURITY$/,
];

describe.skipIf(!existsSync(TIP_MIGRATION_FILE))(`preservation: ${TIP_MIGRATION} is additive only`, () => {
  const stmts = () => statements(readFileSync(TIP_MIGRATION_FILE, 'utf8'));

  it('has at least one statement', () => {
    expect(stmts().length).toBeGreaterThan(0);
  });

  it('every statement is a whitelisted Tip/TipCategory creation or the Tip RLS enable', () => {
    const offending = stmts().filter((s) => !ALLOWED_STATEMENTS.some((re) => re.test(s)));
    expect(offending).toEqual([]);
  });

  it('contains no DROP, UPDATE, DELETE, TRUNCATE, and no ALTER of another table', () => {
    const offending = stmts().filter(
      (s) =>
        /\b(DROP|UPDATE|DELETE|TRUNCATE)\b/i.test(s) ||
        (/^ALTER\b/i.test(s) && !/^ALTER TABLE "Tip" /.test(s)),
    );
    expect(offending).toEqual([]);
  });
});
