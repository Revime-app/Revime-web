import Link from 'next/link';
import { PUBLIC_DOCUMENTS, SUPPORT_EMAIL } from '../../lib/documents';

/** The public pages (home, legal documents): the reading layout with its header and footer. */
const LOGO_H = 22;
const LOGO_W = Math.round((LOGO_H * 3749) / 666); // revime-logo.png is 3749 x 666

const FOOTER_SLUGS = ['cgu', 'confidentialite', 'mentions-legales'];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const footerDocs = PUBLIC_DOCUMENTS.filter((d) => FOOTER_SLUGS.includes(d.slug));
  return (
    <>
        <a className="skip" href="#contenu">
          Aller au contenu
        </a>
        <header className="bar">
          <Link href="/" className="bar__brand" aria-label="Revime, accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/revime-logo.png" alt="Revime" width={LOGO_W} height={LOGO_H} />
          </Link>
          <Link href="/connexion" className="bar__login">
            Se connecter
          </Link>
        </header>
        <main id="contenu" className="page">
          {children}
        </main>
        <footer className="foot">
          <nav aria-label="Documents principaux">
            <ul>
              {footerDocs.map((d) => (
                <li key={d.slug}>
                  <Link href={`/${d.slug}`}>{d.label}</Link>
                </li>
              ))}
              <li>
                <Link href="/suppression-compte">Supprimer votre compte</Link>
              </li>
              <li>
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              </li>
            </ul>
          </nav>
        </footer>
    </>
  );
}
