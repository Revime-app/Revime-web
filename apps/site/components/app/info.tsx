import Link from 'next/link';

/** Shared blocks for the public information pages (one page per menu entry, as on Murfy). */
export function Crumbs({ here }: { here: string }) {
  return (
    <nav className="ap-crumbs" aria-label="Fil d’Ariane">
      <Link href="/">Accueil</Link> › <span aria-current="page">{here}</span>
    </nav>
  );
}

export function InfoHero({
  eyebrow,
  title,
  lede,
  tone = 'red',
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  tone?: 'red' | 'navy';
  children?: React.ReactNode;
}) {
  return (
    <header className={`ap-ihero ap-ihero--${tone}`}>
      <p className="ap-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="ap-ihero__lede">{lede}</p>
      {children}
    </header>
  );
}

export function Steps({ items, tone = 'red' }: { items: { title: string; text: string; who?: string }[]; tone?: 'red' | 'navy' }) {
  return (
    <ol className={`ap-isteps ap-isteps--${tone}`}>
      {items.map((s, i) => (
        <li key={s.title}>
          <span className="ap-isteps__n" aria-hidden="true">
            {i + 1}
          </span>
          <div className="ap-isteps__card">
            {s.who && <span className="ap-isteps__who">{s.who}</span>}
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CtaBand({ title, text, cta, href, tone = 'red' }: { title: string; text: string; cta: string; href: string; tone?: 'red' | 'navy' }) {
  return (
    <section className={`ap-ctaband ap-ctaband--${tone}`}>
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
      <Link href={href}>{cta}</Link>
    </section>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="ap-faq">
      {items.map((f) => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}
