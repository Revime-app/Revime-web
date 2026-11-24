import { describe, it, expect } from 'vitest';
import { LEGAL_DOCUMENTS } from '../src/lib/legal';
import { MENTIONS_LEGALES } from '../src/lib/legal/mentions-legales';
import { CGU } from '../src/lib/legal/cgu';
import { CLASSEMENT_RESUME } from '../src/lib/legal/classement-resume';
import { PROTECTION_REVIME } from '../src/lib/legal/protection';
import { POLITIQUE_DE_CONFIDENTIALITE } from '../src/lib/legal/confidentialite';

describe('11 Legal Documents Migration (T1-T2, LEG-01 to LEG-11)', () => {
  it('should register exactly 11 legal documents in LEGAL_DOCUMENTS', () => {
    expect(LEGAL_DOCUMENTS).toHaveLength(11);
  });

  it('all 11 documents must be updated to 10 octobre 2026', () => {
    for (const entry of LEGAL_DOCUMENTS) {
      const doc = entry.getDocument();
      expect(doc.title).toBeTruthy();
      expect(doc.updated).toMatch(/10 octobre 2026/);
      expect(doc.sections.length).toBeGreaterThan(0);
    }
  });

  it('CGU must contain normalized bullet points and non-empty sections', () => {
    const hasBullets = CGU.sections.some((s) => s.body.some((p) => p.startsWith('• ')));
    expect(hasBullets).toBe(true);
  });

  it('CGU must have at least 61 sections, including Section 53 and Section 55', () => {
    expect(CGU.sections.length).toBeGreaterThanOrEqual(61);
    const headings = CGU.sections.map((s) => s.heading);
    expect(headings.some((h) => /^53\.\s+/i.test(h))).toBe(true);
    expect(headings.some((h) => /^55\.\s+/i.test(h))).toBe(true);
  });

  it('POLITIQUE_DE_CONFIDENTIALITE must have level 2 sections', () => {
    const l2Sections = POLITIQUE_DE_CONFIDENTIALITE.sections.filter((s) => s.level === 2);
    expect(l2Sections.length).toBeGreaterThan(0);
    expect(l2Sections.some((s) => s.heading.startsWith('4.1'))).toBe(true);
    expect(l2Sections.some((s) => s.heading.startsWith('18.1'))).toBe(true);
    expect(l2Sections.some((s) => s.heading.startsWith('26.1'))).toBe(true);
  });

  it('shows the titles the client wrote, apostrophe included', () => {
    expect(CGU.title).toBe('CONDITIONS GÉNÉRALES D’UTILISATION — REVIME');
    for (const entry of LEGAL_DOCUMENTS) {
      expect(entry.getDocument().title).toMatch(/^[A-ZÀ-ÝÉÈ0-9 ’'—?·-]+$/);
    }
  });

  it('adds no heading the client did not write', () => {
    for (const entry of LEGAL_DOCUMENTS) {
      const doc = entry.getDocument();
      expect(doc.sections.some((s) => s.heading === 'Introduction'), entry.slug).toBe(false);
    }
    // The summary opens with a paragraph that has no heading in the client's document.
    expect(CLASSEMENT_RESUME.sections[0].heading).toBe('');
  });

  it('keeps every sentence in one paragraph and invents no full stop between two lines', () => {
    for (const entry of LEGAL_DOCUMENTS) {
      for (const section of entry.getDocument().sections) {
        section.body.forEach((p, i) => {
          const where = `${entry.slug} / ${section.heading} / ${p.slice(0, 40)}`;
          // A paragraph that starts in lower case continues a sentence. The client's own layout has
          // two such lines: the e-mail address, URL or clause it puts on a line after a lead-in
          // ending with ':', and the closing clause that follows the bullets of the tariff-change
          // article. Anything else is a sentence the generator tore in two at a line wrap.
          if (!p.startsWith('• ') && /^\p{Ll}/u.test(p)) {
            const previous = section.body[i - 1] ?? '';
            expect(previous.endsWith(':') || p.startsWith('sera communiquée'), where).toBe(true);
          }
          // The generator once joined two lines with '. ' ('Stripe. Traitement des paiements').
          expect(p, where).not.toMatch(/^(Stripe|Twilio|Resend|Render|Vercel|Expo|Supabase)\. /);
          expect(p, where).not.toMatch(/(?:Niveau [1-4]|Remboursement (?:total|partiel)|À domicile|Dépôt en atelier)\. /);
        });
      }
    }
  });

  it('prints prices and statute references the way the client wrote them', () => {
    const everything = LEGAL_DOCUMENTS.flatMap((e) =>
      e.getDocument().sections.flatMap((s) => [s.heading, ...s.body]),
    );
    for (const text of everything) {
      expect(text).not.toMatch(/\d ,\d/); // '7 ,40 €' came from the PDF reader, not from the client
      expect(text).not.toMatch(/\p{L}- \p{Ll}/u); // 'celui- ci'
      expect(text).not.toMatch(/\d- \d/); // 'L221- 25'
      expect(text).not.toMatch(/[’'] [A-ZÀ-Ý]{2}/); // 'D’ AFFICHAGE'
    }
    expect(PROTECTION_REVIME.sections.flatMap((s) => s.body)).toContain(
      '• Protection REVIME : 2,90 € + 4,50 € = 7,40 €',
    );
    expect(CGU.sections.flatMap((s) => s.body).join(' ')).toContain('L221-25 et L221-28');
  });

  it('Mentions Légales must not contain SAS and must have separate address lines', () => {
    for (const section of MENTIONS_LEGALES.sections) {
      expect(section.heading).not.toMatch(/\bSAS\b/);
      for (const p of section.body) {
        expect(p).not.toMatch(/\bREVIME\s+SAS\b/i);
        expect(p).not.toMatch(/\bSAS\s+REVIME\b/i);
      }
    }
    const editeur = MENTIONS_LEGALES.sections.find((s) => s.heading.includes('ÉDITEUR'));
    expect(editeur?.body.some((p) => p.includes('21 Rue Curnonsky\n75017 Paris\nFrance'))).toBe(true);
    expect(editeur?.body.some((p) => p.includes('21 Rue Curnonsky75017 ParisFrance'))).toBe(false);
  });
});
