import { describe, it, expect } from 'vitest';
import {
  addedMigrationFiles,
  checkSchemaMigration,
  type SchemaMigrationIo,
} from '../scripts/check-schema-migration.js';

const MIG = 'apps/api/prisma/migrations/20261017233000_compliance_and_lot4_schema_sync/migration.sql';

function io(over: { differ: boolean; nameStatus?: string }): SchemaMigrationIo {
  return {
    schemaAt: (ref) => `schema@${ref}`,
    schemasDiffer: (a, b) => {
      expect(a).toBe('schema@base');
      expect(b).toBe('schema@head');
      return over.differ;
    },
    nameStatus: () => over.nameStatus ?? '',
  };
}

describe('addedMigrationFiles', () => {
  it('keeps only ADDED migration.sql files', () => {
    const out = [
      `A\t${MIG}`,
      'A\tapps/api/prisma/migrations/20261019030000_x/migration.sql',
      `M\tapps/api/prisma/migrations/20261001000000_old/migration.sql`,
      'A\tapps/api/prisma/migrations/20261019030000_x/notes.md',
      'A\tapps/api/prisma/schema.prisma',
      'D\tapps/api/prisma/migrations/20261001000000_old/migration.sql',
    ].join('\r\n');
    expect(addedMigrationFiles(out)).toEqual([
      MIG,
      'apps/api/prisma/migrations/20261019030000_x/migration.sql',
    ]);
  });

  it('is empty for an empty listing', () => {
    expect(addedMigrationFiles('')).toEqual([]);
  });
});

describe('checkSchemaMigration', () => {
  it('passes when the schema does not change the database, whatever else changed', () => {
    const v = checkSchemaMigration('base', 'head', io({ differ: false, nameStatus: 'M\tREADME.md' }));
    expect(v.ok).toBe(true);
  });

  it('FAILS when the schema changes the database and no migration was added (c8cfcb81)', () => {
    const v = checkSchemaMigration(
      'base',
      'head',
      io({ differ: true, nameStatus: 'M\tapps/api/prisma/schema.prisma\nA\tapps/api/src/x.ts' }),
    );
    expect(v.ok).toBe(false);
    expect(v.message).toContain('no migration.sql was added');
    expect(v.message).toContain('never migrate dev');
  });

  it('does not accept an edited old migration in place of a new one', () => {
    const v = checkSchemaMigration(
      'base',
      'head',
      io({ differ: true, nameStatus: 'M\tapps/api/prisma/migrations/20261001000000_old/migration.sql' }),
    );
    expect(v.ok).toBe(false);
  });

  it('passes when the schema changes the database and a migration was added', () => {
    const v = checkSchemaMigration('base', 'head', io({ differ: true, nameStatus: `A\t${MIG}` }));
    expect(v.ok).toBe(true);
    expect(v.message).toContain('1 migration(s)');
  });
});
