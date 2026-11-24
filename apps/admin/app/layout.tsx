import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { tokensCss } from '@revime/tokens/css';
import { AdminNav } from '../components/AdminNav';
import { AdminGate } from '../components/AdminGate';
import { AdminHeader } from '../components/AdminHeader';
import { AdminThemeProvider } from '../lib/theme';
import './globals.css';

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
  title: 'Tableau de bord Revime',
  description: "Accès réservé à l'équipe Revime",
  icons: {
    icon: '/brand/revime-emblem.png',
    apple: '/brand/revime-emblem.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={googleSansFlex.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('revime-admin-theme');var isDark=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',isDark?'dark':'light');}catch(e){}})();`,
          }}
        />
        {/*
          'pro' rather than 'client': --accent resolves to navy, which frees red for
          destructive actions (refund, delete, suspend). With the brand red AS the accent a
          destructive button cannot distinguish itself. Owner's decision, 2026-09-03.
          🛑 This changes the accent colour on the five pre-existing operator pages, which
          already use var(--accent). That was known and accepted.
          `tokensCss('pro')` also emits the dark-theme overrides (`:root[data-theme="dark"]` and the
          prefers-color-scheme fallback), where --accent and --navy are the lifted blue (`paletteDark.navy`).
        */}
        <style dangerouslySetInnerHTML={{ __html: tokensCss('pro') }} />
      </head>
      <body>
        <AdminThemeProvider>
          <div className="shell">
            <AdminNav />
            <div className="shell__container">
              <AdminGate>
                <AdminHeader />
                <main className="shell__main">{children}</main>
              </AdminGate>
            </div>
          </div>
        </AdminThemeProvider>
      </body>
    </html>
  );
}
