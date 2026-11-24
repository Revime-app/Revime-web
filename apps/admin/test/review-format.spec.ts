import { describe, expect, it } from 'vitest';
import { demoPill, excerpt, reviewStateLabel } from '../lib/review-format';

/** CF4-37 (spec §4.4). Pure helpers of the « Avis » page. */

describe('reviewStateLabel', () => {
  it('visible → « Visible »', () => {
    expect(reviewStateLabel({ hidden: false, moderationMotif: null })).toBe('Visible');
  });

  it('hidden with a motif → « Masqué · <motif> »', () => {
    expect(reviewStateLabel({ hidden: true, moderationMotif: 'PERSONAL_DATA' })).toBe('Masqué · Données personnelles');
    expect(reviewStateLabel({ hidden: true, moderationMotif: 'OTHER' })).toBe('Masqué · Autre');
  });

  it('hidden before L (no motif) → « Masqué · motif non renseigné »', () => {
    expect(reviewStateLabel({ hidden: true, moderationMotif: null })).toBe('Masqué · motif non renseigné');
  });
});

describe('demoPill', () => {
  it('« DÉMO · AVIS FICTIF » for a demo review, null otherwise', () => {
    expect(demoPill(true)).toBe('DÉMO · AVIS FICTIF');
    expect(demoPill(false)).toBeNull();
  });
});

describe('excerpt', () => {
  it('keeps a short comment whole', () => {
    expect(excerpt('Très bien.', 120)).toBe('Très bien.');
  });

  it('cuts a long comment on a word boundary and adds an ellipsis', () => {
    const out = excerpt('mot '.repeat(60).trim(), 120);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it('collapses whitespace and renders a missing comment as « Sans commentaire »', () => {
    expect(excerpt('  a\n\nb  ', 120)).toBe('a b');
    expect(excerpt(null, 120)).toBe('Sans commentaire');
    expect(excerpt('   ', 120)).toBe('Sans commentaire');
  });

  it('cuts a single long word hard', () => {
    expect(excerpt('x'.repeat(200), 120)).toBe(`${'x'.repeat(120)}…`);
  });
});
