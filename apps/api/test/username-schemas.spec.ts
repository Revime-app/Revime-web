import { describe, expect, it } from 'vitest';
import { deriveUsername, RESERVED_USERNAMES, usernameSchema } from '@revime/shared';

/**
 * zod's own defaults are English and surface for the invalid_type case, which
 * authored .regex()/.min() messages do not cover. Same guard as
 * demande-schemas.spec.ts, and for the same reason.
 */
const ZOD_ENGLISH =
  /expected|received|invalid input|invalid option|too small|too big|must contain/i;

const never = () => false;

describe('usernameSchema', () => {
  it('accepts a plain lowercase handle', () => {
    expect(usernameSchema.parse('camille_m')).toBe('camille_m');
  });

  it('lowercases and trims, because the column is canonical-lowercase', () => {
    expect(usernameSchema.parse('  Camille_M  ')).toBe('camille_m');
  });

  it('refuses fewer than 3 characters', () => {
    const r = usernameSchema.safeParse('ab');
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.message).toBe(
      'Entre 3 et 20 caractères : lettres, chiffres et _ uniquement.',
    );
  });

  it('refuses more than 20 characters', () => {
    expect(usernameSchema.safeParse('a'.repeat(21)).success).toBe(false);
  });

  it('refuses characters outside [a-z0-9_]', () => {
    for (const bad of ['camille.m', 'camille-m', 'camille m', 'camillé', 'camille@m']) {
      expect(usernameSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('refuses a handle with no letter at all', () => {
    const r = usernameSchema.safeParse('12345');
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.message).toBe('Ajoutez au moins une lettre.');
  });

  it('refuses a leading or trailing underscore', () => {
    expect(usernameSchema.safeParse('_camille').success).toBe(false);
    expect(usernameSchema.safeParse('camille_').success).toBe(false);
  });

  it('refuses a doubled underscore', () => {
    expect(usernameSchema.safeParse('camille__m').success).toBe(false);
  });

  it('refuses every reserved word, case-insensitively', () => {
    for (const word of RESERVED_USERNAMES) {
      expect(usernameSchema.safeParse(word).success).toBe(false);
      expect(usernameSchema.safeParse(word.toUpperCase()).success).toBe(false);
    }
  });

  it('refuses tombstone usernames starting with supprime_', () => {
    expect(usernameSchema.safeParse('supprime_123').success).toBe(false);
    expect(usernameSchema.safeParse('supprime_user').success).toBe(false);
    expect(usernameSchema.safeParse('supprime').success).toBe(false);
  });

  it('names support and revime among the reserved words', () => {
    // Pinned rather than left to the list's length: @support impersonates a
    // channel that does not exist (CF-D3), which is the reason the list exists.
    expect(RESERVED_USERNAMES).toContain('support');
    expect(RESERVED_USERNAMES).toContain('revime');
  });

  it('never leaks an English zod message', () => {
    for (const bad of ['ab', '', 'A'.repeat(30), 'camille.m', undefined]) {
      const r = usernameSchema.safeParse(bad);
      if (r.success) continue;
      for (const issue of r.error.issues) {
        expect(issue.message).not.toMatch(ZOD_ENGLISH);
      }
    }
  });
});

describe('deriveUsername', () => {
  it('derives from the email local part', () => {
    expect(deriveUsername('Camille.Martin@example.com', never)).toBe('camille_martin');
  });

  it('collapses runs of separators and trims the edges', () => {
    expect(deriveUsername('..camille--martin..@example.com', never)).toBe('camille_martin');
  });

  it('prefixes a letter when the local part is all digits', () => {
    expect(deriveUsername('123456@example.com', never)).toBe('user123456');
  });

  it('produces a valid handle from a local part of only separators', () => {
    const out = deriveUsername('....@example.com', never);
    expect(out).toBe('user');
    expect(usernameSchema.safeParse(out).success).toBe(true);
  });

  it('truncates at 20 characters and leaves no trailing underscore', () => {
    const out = deriveUsername('abcdefghijklmnopqrs_tuv@example.com', never);
    expect(out).toBe('abcdefghijklmnopqrs');
    expect(out.length).toBeLessThanOrEqual(20);
    expect(usernameSchema.safeParse(out).success).toBe(true);
  });

  it('pads a too-short local part with zeros rather than a word', () => {
    // '0' rather than 'user' so a two-letter local part cannot produce an
    // accidental French or English word.
    expect(deriveUsername('ab@example.com', never)).toBe('ab0');
  });

  it('suffixes on collision, and keeps suffixing', () => {
    const taken = new Set(['camille', 'camille2']);
    expect(deriveUsername('camille@example.com', (c) => taken.has(c))).toBe('camille3');
  });

  it('re-truncates when the suffix would overflow 20 characters', () => {
    const base = 'abcdefghijklmnopqrst'; // exactly 20
    const out = deriveUsername(`${base}@example.com`, (c) => c === base);
    expect(out).toBe('abcdefghijklmnopqrs2');
    expect(out.length).toBe(20);
  });

  it('escapes a reserved derivation instead of returning it', () => {
    const out = deriveUsername('support@revime.fr', never);
    expect(RESERVED_USERNAMES).not.toContain(out);
    expect(out).toBe('support2');
  });

  it('always returns something the validator accepts', () => {
    const emails = [
      'a@x.fr', 'ab@x.fr', '1@x.fr', '___@x.fr', 'A.B-C_D@x.fr',
      'admin@x.fr', 'très.accentué@x.fr', 'x'.repeat(40) + '@x.fr',
    ];
    for (const email of emails) {
      expect(usernameSchema.safeParse(deriveUsername(email, never)).success).toBe(true);
    }
  });

  it('derives a valid handle even when email local part starts with supprime_', () => {
    const derived = deriveUsername('supprime_client@example.com', never);
    expect(derived.startsWith('supprime_')).toBe(false);
    expect(usernameSchema.safeParse(derived).success).toBe(true);
  });
});
