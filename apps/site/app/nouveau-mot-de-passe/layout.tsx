import { SessionProvider } from '../../lib/client/session';
import { privatePageMetadata } from '../../lib/seo';
import '../app.css';

export const metadata = privatePageMetadata('Nouveau mot de passe', '/nouveau-mot-de-passe');

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
