/**
 * Pre-push guard: a change to `schema.prisma` that alters the database must ship a migration.
 *
 * RU-32: `c8cfcb81` and `ce5d2748` added columns (`user.birthDate`, the fiscal and DAC7 tables) to
 * the schema with no migration. The code deployed, Prisma selected `user.birthDate`, and every
 * login failed with P2022 until the migration was applied by hand about 37 minutes later.
 * `prisma migrate deploy` cannot notice: it applies the migrations that exist.
 *
 * Compares the schema at `base` with the schema at `head` (SQL-level, so comments and pure
 * client-side edits do not count) and, when they differ, requires at least one migration.sql
 * ADDED between the two. It cannot prove the migration is the right one: it catches the
 * forgotten one.
 *
 * Usage (from apps/api):
 *   npm run check:schema-migration                       # origin/main..HEAD
 *   npx tsx scripts/check-schema-migration.ts <base> [head]
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA_PATH = 'apps/api/prisma/schema.prisma';
const MIGRATION_SQL = /^apps\/api\/prisma\/migrations\/[^/]+\/migration\.sql$/;

export interface SchemaMigrationIo {
  /** Schema file content at a git ref. */
  schemaAt(ref: string): string;
  /** `prisma migrate diff --exit-code` between two schema texts: true when they differ. */
  schemasDiffer(fromSchema: string, toSchema: string): boolean;
  /** `git diff --name-status base...head`, one `<status>\t<path>` per line. */
  nameStatus(base: string, head: string): string;
}

export interface SchemaMigrationVerdict {
  ok: boolean;
  message: string;
}

/** Paths of migration.sql files that were ADDED (status `A`) in a `--name-status` listing. */
export function addedMigrationFiles(nameStatus: string): string[] {
  return nameStatus
    .split(/\r?\n/)
    .map((line) => line.split('\t'))
    .filter(([status, path]) => status === 'A' && path !== undefined && MIGRATION_SQL.test(path))
    .map(([, path]) => path as string);
}

export function checkSchemaMigration(base: string, head: string, io: SchemaMigrationIo): SchemaMigrationVerdict {
  if (!io.schemasDiffer(io.schemaAt(base), io.schemaAt(head))) {
    return { ok: true, message: `schema.prisma does not change the database between ${base} and ${head}.` };
  }
  const added = addedMigrationFiles(io.nameStatus(base, head));
  if (added.length > 0) {
    return { ok: true, message: `schema.prisma changes the database and ${added.length} migration(s) were added.` };
  }
  return {
    ok: false,
    message:
      `schema.prisma changes the database between ${base} and ${head} but no migration.sql was added. ` +
      `Production would deploy code that selects columns that do not exist. ` +
      `Show the SQL with: git show ${base}:${SCHEMA_PATH} > old.prisma && ` +
      `npx prisma migrate diff --from-schema old.prisma --to-schema prisma/schema.prisma --script, ` +
      `then hand-author the migration (never migrate dev).`,
  };
}

function git(args: string[]): string {
  const r = spawnSync('git', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout;
}

function realIo(): SchemaMigrationIo {
  return {
    schemaAt: (ref) => git(['show', `${ref}:${SCHEMA_PATH}`]),
    schemasDiffer: (fromSchema, toSchema) => {
      const dir = mkdtempSync(join(tmpdir(), 'schema-migration-'));
      try {
        const from = join(dir, 'from.prisma');
        const to = join(dir, 'to.prisma');
        writeFileSync(from, fromSchema);
        writeFileSync(to, toSchema);
        const r = spawnSync(
          'npx',
          ['--no-install', 'prisma', 'migrate', 'diff', '--from-schema', `"${from}"`, '--to-schema', `"${to}"`, '--exit-code', '--script'],
          // prisma.config.ts reads DIRECT_URL eagerly; a schema-to-schema diff never connects.
          { encoding: 'utf-8', shell: true, env: { ...process.env, DIRECT_URL: process.env.DIRECT_URL ?? 'postgresql://unused:unused@localhost:5432/unused' } },
        );
        if (r.status === 0) return false;
        if (r.status === 2) return true;
        throw new Error(`prisma migrate diff failed (exit ${r.status}): ${r.stderr.trim() || r.stdout.trim()}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    nameStatus: (base, head) => git(['diff', '--name-status', `${base}...${head}`]),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base = 'origin/main', head = 'HEAD'] = process.argv.slice(2);
  try {
    const verdict = checkSchemaMigration(base, head, realIo());
    console.log(verdict.ok ? `OK: ${verdict.message}` : `FAIL: ${verdict.message}`);
    process.exit(verdict.ok ? 0 : 1);
  } catch (e) {
    console.error(`check-schema-migration could not run: ${(e as Error).message}`);
    process.exit(1);
  }
}
