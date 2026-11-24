import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from '../lib/site';
import { Analytics } from '../components/Analytics';
import './globals.css';

/** The charte graphique's one typeface. */
const googleSansFlex = localFont({
  src: [
    { path: '../public/fonts/GoogleSansFlex_400Regular.ttf', weight: '400', style: 'normal' },
    { path: '../public/fonts/GoogleSansFlex_500Medium.ttf', weight: '500', style: 'normal' },
    { path: '../public/fonts/GoogleSansFlex_600SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../public/fonts/GoogleSansFlex_700Bold.ttf', weight: '700', style: 'normal' },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={googleSansFlex.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
