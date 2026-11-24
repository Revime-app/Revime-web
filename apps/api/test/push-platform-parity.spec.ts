import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pushPlatformSchema } from '@revime/shared';

/**
 * The same pin `notification-type-parity.spec.ts` gives `NotificationType`: the zod enum is the
 * wire contract and the Prisma enum is the column; a member added to only one typechecks on both
 * sides and fails at runtime.
 */
describe('PushPlatform parity between the wire contract and the column', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

  const prismaMembers = (() => {
    const block = /enum PushPlatform \{([\s\S]*?)\n\}/.exec(schema);
    if (!block) throw new Error('enum PushPlatform not found in schema.prisma');
    return block[1]!
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, '').trim())
      .filter((l) => /^[A-Z_]+$/.test(l));
  })();

  // Vacuity guard: a regex that matches nothing would make both assertions pass trivially.
  it('actually parsed the enum block', () => {
    expect(prismaMembers.length).toBeGreaterThanOrEqual(2);
    expect(prismaMembers).toContain('IOS');
  });

  it('every wire member exists as a column value', () => {
    for (const member of pushPlatformSchema.options) expect(prismaMembers).toContain(member);
  });

  it('every column value exists on the wire', () => {
    for (const member of prismaMembers) expect(pushPlatformSchema.options).toContain(member);
  });
});
