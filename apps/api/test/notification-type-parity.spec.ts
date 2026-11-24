import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { notificationTypeSchema } from '@revime/shared';

/**
 * `notificationTypeSchema`'s own comment states the hazard this pins: "Keep in step with
 * the `NotificationType` enum in `schema.prisma`. This list is the wire contract and that
 * one is the column; a member added to only one of them typechecks on both sides and fails
 * at runtime."
 *
 * Nothing enforced that until now. This does, in both directions.
 */
describe('NotificationType parity between the wire contract and the column', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

  /** The enum block only, so a member name appearing elsewhere in the file cannot satisfy this. */
  const prismaMembers = (() => {
    const block = /enum NotificationType \{([\s\S]*?)\n\}/.exec(schema);
    if (!block) throw new Error('enum NotificationType not found in schema.prisma');
    return block[1]!
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, '').trim())
      .filter((l) => /^[A-Z0-9_]+$/.test(l));
  })();

  // 🛑 Vacuity guard. A regex that matches nothing would make both assertions below pass
  // trivially. This fails loudly instead.
  it('actually parsed the enum block', () => {
    expect(prismaMembers.length).toBeGreaterThan(5);
    expect(prismaMembers).toContain('OFFER_RECEIVED');
  });

  it('every wire member exists as a column value', () => {
    for (const member of notificationTypeSchema.options) {
      expect(prismaMembers).toContain(member);
    }
  });

  it('every column value exists on the wire', () => {
    for (const member of prismaMembers) {
      expect(notificationTypeSchema.options as readonly string[]).toContain(member);
    }
  });

  it('DEMANDE_MODERATED is present on both sides', () => {
    expect(notificationTypeSchema.options as readonly string[]).toContain('DEMANDE_MODERATED');
    expect(prismaMembers).toContain('DEMANDE_MODERATED');
  });
});
