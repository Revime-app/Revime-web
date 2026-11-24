import type { LegalDocument, LegalSection } from '../lib/documents';

/**
 * Renders one of the client's legal documents verbatim.
 *
 * Two presentational changes only, neither touching the words:
 * - paragraphs the generator prefixed with « • » become list items;
 * - a heading's article number (« 26.1 », « 9 bis. ») hangs in the left margin, because the
 *   numbering is the document's real structure and readers navigate by it.
 */
export function LegalArticle({ document }: { document: LegalDocument }) {
  return (
    <article className="doc">
      <header className="doc__head">
        <h1 className="doc__title">{document.title}</h1>
        <p className="doc__updated">{document.updated}</p>
      </header>
      {document.sections.map((section, i) => (
        <Section key={i} section={section} />
      ))}
    </article>
  );
}

const NUMBERED = /^(\d+(?:\.\d+)*\.?(?:\s(?:bis|ter)\.?)?)\s+(.+)$/;

function Heading({ section }: { section: LegalSection }) {
  const Tag = section.level === 2 ? 'h3' : 'h2';
  const match = NUMBERED.exec(section.heading);
  if (!match) return <Tag className="doc__heading">{section.heading}</Tag>;
  return (
    <Tag className="doc__heading doc__heading--numbered">
      <span className="doc__num">{match[1]}</span> <span>{match[2]}</span>
    </Tag>
  );
}

/**
 * French typography, display only: a guillemet and the high punctuation (: ; ? !) never wrap away
 * from their word. Spaces become no-break spaces; the words are untouched.
 */
export function frenchSpacing(text: string): string {
  return text
    .replace(/« /g, '« ')
    .replace(/ (»|:|;|\?|!)/g, ' $1');
}

function Lines({ text }: { text: string }) {
  const lines = frenchSpacing(text).split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
    </>
  );
}

function Section({ section }: { section: LegalSection }) {
  // Group runs of « • » paragraphs into one list, keep everything else as paragraphs.
  const blocks: Array<{ kind: 'p'; text: string } | { kind: 'ul'; items: string[] }> = [];
  for (const para of section.body) {
    if (para.startsWith('•')) {
      const item = para.replace(/^•\s*/, '');
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'ul') last.items.push(item);
      else blocks.push({ kind: 'ul', items: [item] });
    } else {
      blocks.push({ kind: 'p', text: para });
    }
  }
  return (
    <section className={section.level === 2 ? 'doc__section doc__section--sub' : 'doc__section'}>
      <Heading section={section} />
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>
            <Lines text={b.text} />
          </p>
        ) : (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Lines text={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </section>
  );
}
