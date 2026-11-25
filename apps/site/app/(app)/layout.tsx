import { AppShell } from '../../components/app/AppShell';
import { SessionProvider } from '../../lib/client/session';
import '../app.css';

/** Everything that looks like the app: the home, browsing, publishing and the personal pages. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
