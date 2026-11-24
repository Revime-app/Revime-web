import type { Metadata } from 'next';
import Link from 'next/link';
import localFont from 'next/font/local';
import { PUBLIC_DOCUMENTS, SUPPORT_EMAIL } from '../lib/documents';
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from '../lib/site';
import { Analytics } from '../components/Analytics';
import './globals.css';

/** The charte graphique's one typeface. */
const googleSansFlex = localFont({
  src: [
    { path: '../public/fonts/GoogleSansFlex_400Regular.ttf', weight: '400', style: 'normal' },
    { path: '../public/fonts/GoogleSansFlex_600SemiBold.ttf', weight: '600', style: 'normal' },
  ],
  variable: '--font-google-sans',
  fallback: ['Arial', 'sans-serif'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: { icon: '/brand/revime-emblem.png', apple: '/brand/revime-emblem.png' },
  formatDetection: { telephone: false },
};

const LOGO_H = 22;
const LOGO_W = Math.round((LOGO_H * 3749) / 666); // revime-logo.png is 3749 x 666

const FOOTER_SLUGS = ['cgu', 'confidentialite', 'mentions-legales'];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const footerDocs = PUBLIC_DOCUMENTS.filter((d) => FOOTER_SLUGS.includes(d.slug));
  return (
    <html lang="fr" className={googleSansFlex.variable}>
      <body>
        <a className="skip" href="#contenu">
          Aller au contenu
        </a>
        <header className="bar">
          <Link href="/" className="bar__brand" aria-label="Revime, accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/revime-logo.png" alt="Revime" width={LOGO_W} height={LOGO_H} />
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
        <Analytics />
      </body>
    </html>
  );
}
