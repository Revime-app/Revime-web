import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('consent proof migration and schema', () => {
  const migrationDir = path.resolve(__dirname, '../prisma/migrations/20261011040000_consent_proof_storage');
  const migrationFile = path.join(migrationDir, 'migration.sql');
  const schemaFile = path.resolve(__dirname, '../prisma/schema.prisma');

  it('contains migration.sql file for consent proof storage', () => {
    expect(fs.existsSync(migrationFile)).toBe(true);
  });

  it('defines ConsentProof model and ConsentProofKind enum in schema.prisma', () => {
    const schema = fs.readFileSync(schemaFile, 'utf-8');
    expect(schema).toContain('enum ConsentProofKind');
    expect(schema).toContain('model ConsentProof');
    expect(schema).toContain('CGU_ACCEPTANCE');
    expect(schema).toContain('WITHDRAWAL_WAIVER_IMMEDIATE');
    expect(schema).toContain('WITHDRAWAL_WAIVER_WAIT_14_DAYS');
  });

  it('defines PostgreSQL immutability trigger in migration.sql', () => {
    const sql = fs.readFileSync(migrationFile, 'utf-8');
    expect(sql).toContain('prevent_consent_proof_mutation');
    expect(sql).toContain('CREATE TRIGGER trg_prevent_consent_proof_mutation');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "ConsentProof"');
  });

  it('includes idempotent historical backfill queries for users and commandes', () => {
    const sql = fs.readFileSync(migrationFile, 'utf-8');
    expect(sql).toContain('INSERT INTO "ConsentProof"');
    expect(sql).toContain('FROM "user"');
    expect(sql).toContain('FROM "Commande"');
    expect(sql).toContain('NOT EXISTS');
  });

  it('enforces onDelete: Restrict on foreign key relations to avoid trigger conflicts', () => {
    const schema = fs.readFileSync(schemaFile, 'utf-8');
    expect(schema).toMatch(/user\s+User\s+@relation\(fields:\s*\[userId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/);
    expect(schema).toMatch(/commande\s+Commande\?\s+@relation\(fields:\s*\[commandeId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/);

    const sql = fs.readFileSync(migrationFile, 'utf-8');
    expect(sql).toContain('FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(sql).toContain('FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE RESTRICT ON UPDATE CASCADE');
  });
});
