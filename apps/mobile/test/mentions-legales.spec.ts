import { describe, it, expect } from 'vitest';
import { MENTIONS_LEGALES } from '../src/lib/legal/mentions-legales';

// The text is the client's own document (LEG-03 replaced the first draft), so these tests pin what
// he approved, per field. They are about CF6-10 (no « SAS ») and CF6-11 (each host and the service
// it provides). Whether the text satisfies LCEN art. 6-III is a question for counsel, not a test.

function section(heading: RegExp) {
  return MENTIONS_LEGALES.sections.find((s) => heading.test(s.heading));
}

/** The line naming a provider and the line right after it, which carries its address and URL. */
function providerBlock(prefix: string) {
  const body = section(/^2\.\s+HÉBERGEUR/i)?.body ?? [];
  const at = body.findIndex((line) => line.startsWith(prefix));
  return { nameLine: body[at] ?? '', detailLine: body[at + 1] ?? '' };
}

describe('MENTIONS_LEGALES (CF6-10): no « SAS »', () => {
  it('has no bare « SAS » anywhere in the document: title, date, headings or any line', () => {
    const everything = [
      MENTIONS_LEGALES.title,
      MENTIONS_LEGALES.updated,
      ...MENTIONS_LEGALES.sections.flatMap((s) => [s.heading, ...s.body]),
    ];
    for (const text of everything) {
      expect(text).not.toMatch(/\bSAS\b/);
    }
  });

  it('designates the publisher as an Entrepreneur individuel trading as REVIME', () => {
    const editeur = section(/ÉDITEUR DU SITE/);

    expect(editeur).toBeDefined();
    // The client's document has the name and the status on two lines, no comma between them.
    expect(editeur?.body).toContain('Malek KLIMANE');
    expect(editeur?.body).toContain('Entrepreneur individuel');
    expect(editeur?.body).not.toContain('Malek KLIMANE, Entrepreneur individuel');
    expect(editeur?.body).toContain('Nom commercial : REVIME');
  });
});

describe('MENTIONS_LEGALES (CF6-11): each host and the service it provides', () => {
  it('has a dedicated hosting section', () => {
    expect(section(/^2\.\s+HÉBERGEUR/i)?.heading).toBe('2. HÉBERGEUR');
  });

  it('names Vercel with the web interfaces it serves, its address and its site', () => {
    const { nameLine, detailLine } = providerBlock('Vercel Inc.');
    expect(nameLine).toContain('site internet et interfaces web');
    expect(detailLine).toContain('440 N Barranca Ave #4133, Covina, CA 91723');
    expect(detailLine).toContain('https://vercel.com');
  });

  it('names Render with the application servers it runs, its address and its site', () => {
    const { nameLine, detailLine } = providerBlock('Render Services, Inc.');
    expect(nameLine).toContain('serveurs applicatifs');
    expect(detailLine).toContain('525 Brannan Street, Suite 300, San Francisco, CA 94107');
    expect(detailLine).toContain('https://render.com');
  });

  it('names Supabase with the database and storage it provides, its address and its site', () => {
    const { nameLine, detailLine } = providerBlock('Supabase');
    expect(nameLine).toContain('base de données et stockage');
    expect(detailLine).toContain('Supabase, Inc.');
    expect(detailLine).toContain('Dover, DE 19901');
    expect(detailLine).toContain('https://supabase.com');
  });

  it('carries the date of the client\'s document', () => {
    expect(MENTIONS_LEGALES.updated).toMatch(/10 octobre 2026/);
  });
});
