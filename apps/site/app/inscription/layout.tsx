import { SessionProvider } from '../../lib/client/session';
import { privatePageMetadata } from '../../lib/seo';
import '../app.css';

export const metadata = privatePageMetadata('Créer un compte', '/inscription');

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
