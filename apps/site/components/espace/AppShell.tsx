'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DEMO } from '../../lib/client/config';
import { useMe } from './Session';
import { IconHome, IconList, IconLogout, IconMessage, IconPlus, IconUser } from './icons';

const NAV = [
  { href: '/accueil', label: 'Accueil', Icon: IconHome },
  { href: '/mes-demandes', label: 'Mes demandes', Icon: IconList },
  { href: '/messages', label: 'Messages', Icon: IconMessage },
  { href: '/profil', label: 'Profil', Icon: IconUser },
] as const;

function isActive(pathname: string, href: string) {
  if (href === '/mes-demandes') return pathname === href || pathname.startsWith('/demande/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The app's frame on the web. On a phone it is the app: a bottom bar with the red « + » in the
 * middle. From a tablet up, the same entries move to a left rail so the content gets the width.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, signOut } = useMe();
  const name = me.firstName?.trim() || me.username;

  return (
    <div className="esp">
      {DEMO && (
        <div className="esp-demo" role="note">
          Aperçu avec des données fictives. Rien n’est envoyé.
        </div>
      )}
      <aside className="esp-rail" aria-label="Navigation">
        <Link href="/accueil" className="esp-rail__brand" aria-label="REVIME, accueil">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/revime-logo.png" alt="REVIME" width={124} height={22} />
        </Link>
        <Link href="/publier" className="esp-btn esp-btn--primary esp-rail__cta">
          <IconPlus size={18} strokeWidth={2.6} /> Publier une demande
        </Link>
        <nav>
          {NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={isActive(pathname, href) ? 'esp-rail__item is-active' : 'esp-rail__item'}
              aria-current={isActive(pathname, href) ? 'page' : undefined}
            >
              <Icon size={20} /> {label}
            </Link>
          ))}
        </nav>
        <div className="esp-rail__foot">
          <span className="esp-avatar" aria-hidden="true">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="esp-rail__name">{name}</span>
          <button className="esp-iconbtn" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter">
            <IconLogout size={18} />
          </button>
        </div>
      </aside>

      <header className="esp-top">
        <Link href="/accueil" aria-label="REVIME, accueil">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/revime-logo.png" alt="REVIME" width={113} height={20} />
        </Link>
      </header>

      <main id="contenu" className="esp-main">
        {children}
      </main>

      <nav className="esp-tabs" aria-label="Navigation">
        {NAV.slice(0, 2).map(({ href, label, Icon }) => (
          <Link key={href} href={href} className={isActive(pathname, href) ? 'esp-tab is-active' : 'esp-tab'}>
            <Icon size={22} />
            <span>{label === 'Mes demandes' ? 'Demandes' : label}</span>
          </Link>
        ))}
        <Link href="/publier" className="esp-fab" aria-label="Publier une demande">
          <IconPlus size={28} strokeWidth={2.6} />
        </Link>
        {NAV.slice(2).map(({ href, label, Icon }) => (
          <Link key={href} href={href} className={isActive(pathname, href) ? 'esp-tab is-active' : 'esp-tab'}>
            <Icon size={22} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
