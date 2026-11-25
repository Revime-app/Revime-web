import type { Metadata } from 'next';
import { SessionProvider } from '../../lib/client/session';
import '../app.css';

export const metadata: Metadata = {
  title: 'Connexion',
  robots: { index: false, follow: true },
};

export default function ConnexionLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
