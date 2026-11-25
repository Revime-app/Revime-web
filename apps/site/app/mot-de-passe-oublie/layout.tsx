import { SessionProvider } from '../../lib/client/session';
import { privatePageMetadata } from '../../lib/seo';
import '../app.css';

export const metadata = privatePageMetadata('Mot de passe oublié', '/mot-de-passe-oublie');

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
