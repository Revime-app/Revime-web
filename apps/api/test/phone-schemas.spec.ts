import { describe, expect, it } from 'vitest';
import { frAnyPhoneSchema, frPhoneSchema } from '@revime/shared';

describe('frPhoneSchema', () => {
  it.each([
    ['06 12 34 56 78', '+33612345678'],
    ['0612345678', '+33612345678'],
    ['06.12.34.56.78', '+33612345678'],
    ['06-12-34-56-78', '+33612345678'],
    ['+33612345678', '+33612345678'],
    ['+33 6 12 34 56 78', '+33612345678'],
    ['0712345678', '+33712345678'],
  ])('normalises %s to %s', (input, expected) => {
    expect(frPhoneSchema.parse(input)).toBe(expected);
  });

  it('is the reason the unique index can work: two formats collapse to one value', () => {
    // Profile-level uniqueness is enforced on user.phone. Without a single
    // canonical form these two are one phone occupying two rows.
    expect(frPhoneSchema.parse('06 12 34 56 78')).toBe(frPhoneSchema.parse('+33612345678'));
  });

  it('is idempotent, so re-parsing a stored value is safe', () => {
    const once = frPhoneSchema.parse('0612345678');
    expect(frPhoneSchema.parse(once)).toBe(once);
  });

  it.each([
    ['0112345678', 'landline, cannot receive an SMS'],
    ['0912345678', 'VoIP range, not a mobile'],
    ['061234567', 'too short'],
    ['06123456789', 'too long'],
    ['+44612345678', 'foreign number, out of scope for now'],
    ['abcdefghij', 'not a number'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(frPhoneSchema.safeParse(input).success).toBe(false);
  });

  it('reports the rejection in French', () => {
    const result = frPhoneSchema.safeParse('0112345678');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Indiquez un numéro de mobile français (06 ou 07).',
      );
    }
  });
});

describe('frAnyPhoneSchema', () => {
  it('accepts a landline, which a shipping contact may well be', () => {
    expect(frAnyPhoneSchema.parse('01 42 12 34 56')).toBe('+33142123456');
    expect(frAnyPhoneSchema.parse('0912345678')).toBe('+33912345678');
  });

  it('still accepts a mobile, in either notation', () => {
    expect(frAnyPhoneSchema.parse('0612345678')).toBe('+33612345678');
    expect(frAnyPhoneSchema.parse('+33712345678')).toBe('+33712345678');
  });

  it('refuses a leading zero-zero and a wrong length', () => {
    expect(frAnyPhoneSchema.safeParse('0012345678').success).toBe(false);
    expect(frAnyPhoneSchema.safeParse('061234567').success).toBe(false);
  });

  // BOTH directions. The whole point of the second export is that the two
  // disagree: a test proving only that the new one accepts a landline would
  // still pass if someone widened the old one to match.
  it('and frPhoneSchema still refuses that landline, because piece 4 SMSes it', () => {
    const r = frPhoneSchema.safeParse('0142123456');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Indiquez un numéro de mobile français (06 ou 07).');
  });
});
