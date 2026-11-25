'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { DEMO } from '../../lib/client/config';
import { useSession } from '../../lib/client/session';
import { IconHome, IconMessage, IconPlus, IconSearch, IconUser } from './icons';
import { SiteFooter } from './SiteFooter';
import { initials } from './ui';

function isOn(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The header search: one field, straight to the réparateurs who fix that. */
function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className="ap-hsearch"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/reparateurs?q=${encodeURIComponent(q.trim())}` : '/reparateurs');
      }}
    >
      <IconSearch size={18} />
      <input
        aria-label="Rechercher un réparateur"
        placeholder="Que faut-il réparer ?"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}

function AccountMenu() {
  const { me, signOut } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  if (!me) return null;
  const name = me.firstName?.trim() || me.username;
  return (
    <div className="ap-menu" ref={ref}>
      <button
        className="ap-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Compte de ${name}`}
        onClick={() => setOpen((o) => !o)}
      >
        {initials(name)}
      </button>
      {open && (
        <div className="ap-menu__panel" role="menu">
          <p className="ap-menu__who">
            <strong>{name}</strong>
            <span>{me.email}</span>
          </p>
          <Link role="menuitem" href="/mes-demandes" onClick={() => setOpen(false)}>
            Mes demandes
          </Link>
          <Link role="menuitem" href="/messages" onClick={() => setOpen(false)}>
            Messages
          </Link>
          <Link role="menuitem" href="/profil" onClick={() => setOpen(false)}>
            Profil
          </Link>
          <button
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.push('/');
            }}
          >
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One frame for every visitor, signed in or not. On a computer, a top bar with the search, the two
 * things to browse and the account. On a phone it is the app: a slim top bar and the bottom bar
 * with the red « + » in the middle (Accueil, Recherche, +, Messages, Profil).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status } = useSession();
  const signedIn = status === 'in';
  const loginHref = (to: string) => (signedIn ? to : `/connexion?suite=${encodeURIComponent(to)}`);
  const searching = isOn(pathname, '/reparateurs') || isOn(pathname, '/demandes');

  return (
    <div className="ap">
      <a className="ap-skip" href="#contenu">
        Aller au contenu
      </a>
      {DEMO && <div className="ap-demo">Aperçu avec des données fictives : rien n’est envoyé.</div>}

      <header className="ap-header">
        <div className="ap-header__in">
          <Link href="/" className="ap-logo" aria-label="REVIME, accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/revime-logo.png" alt="REVIME" width={124} height={22} />
          </Link>
          <HeaderSearch />
          <nav className="ap-nav" aria-label="Principale">
            <Link href="/reparateurs" aria-current={isOn(pathname, '/reparateurs') ? 'page' : undefined}>
              Réparateurs
            </Link>
            <Link href="/demandes" aria-current={isOn(pathname, '/demandes') ? 'page' : undefined}>
              Demandes
            </Link>
            {signedIn && (
              <>
                <Link href="/mes-demandes" aria-current={isOn(pathname, '/mes-demandes') ? 'page' : undefined}>
                  Mes demandes
                </Link>
                <Link href="/messages" aria-current={isOn(pathname, '/messages') ? 'page' : undefined}>
                  Messages
                </Link>
              </>
            )}
          </nav>
          <div className="ap-header__end">
            {status === 'out' && (
              <Link href={`/connexion?suite=${encodeURIComponent(pathname)}`} className="ap-login">
                Se connecter
              </Link>
            )}
            {signedIn && <AccountMenu />}
            <Link href="/publier" className="ap-btn ap-btn--primary ap-publish">
              <IconPlus size={18} strokeWidth={2.6} /> Publier une demande
            </Link>
          </div>
        </div>
      </header>

      <main id="contenu" className="ap-main">
        {children}
      </main>

      <SiteFooter />

      <nav className="ap-tabs" aria-label="Navigation">
        <Link href="/" className="ap-tab" aria-current={pathname === '/' ? 'page' : undefined}>
          <IconHome size={22} />
          <span>Accueil</span>
        </Link>
        <Link href="/reparateurs" className="ap-tab" aria-current={searching ? 'page' : undefined}>
          <IconSearch size={22} />
          <span>Recherche</span>
        </Link>
        <Link href="/publier" className="ap-fab" aria-label="Publier une demande">
          <IconPlus size={28} strokeWidth={2.6} />
        </Link>
        <Link href={loginHref('/messages')} className="ap-tab" aria-current={isOn(pathname, '/messages') ? 'page' : undefined}>
          <IconMessage size={22} />
          <span>Messages</span>
        </Link>
        <Link
          href={loginHref('/profil')}
          className="ap-tab"
          aria-current={isOn(pathname, '/profil') || isOn(pathname, '/mes-demandes') ? 'page' : undefined}
        >
          <IconUser size={22} />
          <span>Profil</span>
        </Link>
      </nav>
    </div>
  );
}
