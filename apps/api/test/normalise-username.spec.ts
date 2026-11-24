import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { usernameSchema } from '@revime/shared';
import { normaliseUsernameForWrite } from '../src/auth/normalise-username.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * A stub standing in for Prisma. `taken` is the set of handles the "database"
 * already holds; `seen` records the where-clauses the hook asked about, which is
 * how the self-exclusion case is asserted without a real query log.
 */
function stubPrisma(taken: string[] = []) {
  const seen: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        seen.push(where);
        const username = String(where.username);
        const isInDb = taken.includes(username);
        if (!isInDb) return null;

        // Honor id: { not: ... } self-exclusion
        const idFilter = where.id as { not?: string } | undefined;
        if (idFilter?.not === 'existing-user') return null;

        return { id: 'existing-user' };
      },
    },
  } as unknown as PrismaClient;
  return { prisma, seen };
}

/**
 * better-auth's APIError carries its payload on `body`, but this reads BOTH
 * shapes rather than asserting one: the point of the test is which code was
 * raised, and hard-coding the error's internal shape would make it fail on a
 * library upgrade that changed nothing we care about.
 */
async function codeOf(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    const err = e as { body?: { code?: string }; code?: string };
    return err.body?.code ?? err.code;
  }
}

describe('normaliseUsernameForWrite - create', () => {
  it('MINTS a handle when the write carries none, which is the social-signup path', async () => {
    const { prisma } = stubPrisma();
    const { data } = await normaliseUsernameForWrite(
      prisma,
      { email: 'Camille.Martin@example.com', name: 'Camille Martin' },
      { mode: 'create' },
    );
    expect((data as any).username).toBe('camille_martin');
    // The whole point: whatever it mints must be a handle the validator accepts.
    expect(usernameSchema.safeParse((data as any).username).success).toBe(true);
  });

  it('retries when the first derived candidate is already taken', async () => {
    const { prisma } = stubPrisma(['camille_martin']);
    const { data } = await normaliseUsernameForWrite(
      prisma,
      { email: 'camille.martin@example.com' },
      { mode: 'create' },
    );
    expect((data as any).username).toBe('camille_martin2');
    expect(usernameSchema.safeParse((data as any).username).success).toBe(true);
  });

  it('canonicalises a handle the write DOES carry', async () => {
    const { prisma } = stubPrisma();
    const { data } = await normaliseUsernameForWrite(
      prisma,
      { email: 'a@example.com', username: '  Camille_M  ' },
      { mode: 'create' },
    );
    expect(data.username).toBe('camille_m');
  });

  it('refuses a malformed handle with INVALID_USERNAME', async () => {
    const { prisma } = stubPrisma();
    expect(
      await codeOf(() =>
        normaliseUsernameForWrite(prisma, { email: 'a@example.com', username: 'no' }, { mode: 'create' }),
      ),
    ).toBe('INVALID_USERNAME');
  });

  it('refuses a reserved handle, because the schema owns that rule', async () => {
    const { prisma } = stubPrisma();
    expect(
      await codeOf(() =>
        normaliseUsernameForWrite(prisma, { email: 'a@example.com', username: 'support' }, { mode: 'create' }),
      ),
    ).toBe('INVALID_USERNAME');
  });

  it('refuses a taken handle with USERNAME_ALREADY_EXISTS', async () => {
    const { prisma } = stubPrisma(['camille_m']);
    expect(
      await codeOf(() =>
        normaliseUsernameForWrite(prisma, { email: 'a@example.com', username: 'camille_m' }, { mode: 'create' }),
      ),
    ).toBe('USERNAME_ALREADY_EXISTS');
  });

  it('refuses a PRESENT but blank handle, not minting one', async () => {
    const { prisma } = stubPrisma();
    expect(
      await codeOf(() =>
        normaliseUsernameForWrite(prisma, { email: 'a@example.com', username: '' }, { mode: 'create' }),
      ),
    ).toBe('INVALID_USERNAME');
    expect(
      await codeOf(() =>
        normaliseUsernameForWrite(prisma, { email: 'a@example.com', username: '   ' }, { mode: 'create' }),
      ),
    ).toBe('INVALID_USERNAME');
  });

  it('refuses a PRESENT but non-string handle with INVALID_USERNAME', async () => {
    const { prisma } = stubPrisma();
    expect(
      await codeOf(() =>
        normaliseUsernameForWrite(prisma, { email: 'a@example.com', username: null as any }, { mode: 'create' }),
      ),
    ).toBe('INVALID_USERNAME');
    expect(
      await codeOf(() =>
        normaliseUsernameForWrite(prisma, { email: 'a@example.com', username: 123 as any }, { mode: 'create' }),
      ),
    ).toBe('INVALID_USERNAME');
  });
});

describe('normaliseUsernameForWrite - update', () => {
  it('returns the data UNTOUCHED when the write says nothing about the username', async () => {
    const { prisma } = stubPrisma();
    // This hook also fires for email verification, role changes and bans. None of
    // those carry a username, and none of them may have one invented for them.
    const input = { emailVerified: true };
    const { data } = await normaliseUsernameForWrite(prisma, input, {
      mode: 'update',
      currentUserId: 'u1',
    });
    expect(data).toEqual(input);
    expect('username' in data).toBe(false);
  });

  it('refuses a PRESENT but blank handle on update', async () => {
    const { prisma } = stubPrisma();
    expect(
      await codeOf(() =>
        normaliseUsernameForWrite(prisma, { username: '' }, { mode: 'update', currentUserId: 'u1' }),
      ),
    ).toBe('INVALID_USERNAME');
  });

  it('excludes the caller from the duplicate check, so re-saving your own handle is not a conflict', async () => {
    const { prisma, seen } = stubPrisma(['camille_m']);
    // 'existing-user' is the ID the stub returns for any found user, so using it
    // as currentUserId proves self-exclusion works: the handle IS in the DB, but
    // the hook must succeed because it's the caller's own handle.
    const result = await normaliseUsernameForWrite(prisma, { username: 'camille_m' }, {
      mode: 'update',
      currentUserId: 'existing-user',
    });
    expect(result.data.username).toBe('camille_m');
    expect(seen[0]).toMatchObject({ username: 'camille_m', id: { not: 'existing-user' } });
  });

  it('excludes nobody when no currentUserId is given, which fails closed', async () => {
    const { prisma, seen } = stubPrisma();
    await normaliseUsernameForWrite(prisma, { username: 'camille_m' }, { mode: 'update' });
    expect(seen[0]).not.toHaveProperty('id');
  });
});

/**
 * A source-TEXT assertion, which is unusual and deliberate. auth.ts cannot be
 * imported by a test (it constructs a PrismaClient at module scope), so there is
 * no way to observe its hooks at runtime without a database.
 *
 * What this guards is NOT a duplicated `before:` key - tsc catches that with
 * TS1117. It guards the likelier and genuinely silent mistake: a future edit
 * rewrites one `before` body and drops a normaliser's call. Nothing else in this
 * repo would notice, and the consequence is a NOT NULL violation on social
 * signup or a phone that stops being canonicalised.
 */
describe('auth.ts user write hooks', () => {
  const source = readFileSync(new URL('../src/auth/auth.ts', import.meta.url), 'utf8');
  const hookStart = source.indexOf('databaseHooks:');
  if (hookStart === -1) {
    throw new Error('databaseHooks: not found in auth.ts - was it renamed?');
  }
  const hooks = source.slice(hookStart);

  it('has exactly one before hook per write event', () => {
    expect(hooks.match(/\bbefore:/g)).toHaveLength(2);
  });

  it('calls BOTH normalisers on BOTH write paths', () => {
    expect(hooks.match(/normalisePhoneForWrite/g)).toHaveLength(2);
    expect(hooks.match(/normaliseUsernameForWrite/g)).toHaveLength(2);
  });
});
