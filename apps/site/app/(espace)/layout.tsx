import type { Metadata } from 'next';
import { AppShell } from '../../components/espace/AppShell';
import { RequireSession } from '../../components/espace/Session';
import '../espace.css';

/** The signed-in area is private: never indexed, and blocked in robots.txt as well. */
export const metadata: Metadata = {
  title: { default: 'Mon espace', template: '%s | REVIME' },
  robots: { index: false, follow: false },
};

export default function EspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <AppShell>{children}</AppShell>
    </RequireSession>
  );
}
