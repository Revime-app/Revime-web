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
            <Link href="/demandes" aria-current={isOn(pathname, '/demandes') ? 'page' : undefined}>
              Demandes
            </Link>
            <Link href="/reparateurs" aria-current={isOn(pathname, '/reparateurs') ? 'page' : undefined}>
              Réparateurs
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
        <ScreenMotif pathname={pathname} />
        {children}
      </main>

      <SiteFooter />

      <nav className="ap-tabs" aria-label="Navigation">
        <Link href="/" className="ap-tab" aria-current={pathname === '/' ? 'page' : undefined}>
          <IconHome size={22} />
          <span>Accueil</span>
        </Link>
        <Link href="/demandes" className="ap-tab" aria-current={searching ? 'page' : undefined}>
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

/**
 * The app's ScreenMotif (apps/mobile/src/components/ScreenMotif.tsx): a soft Rouge Punch blob
 * and a dotted arc behind each screen, in one of six compositions. Same shapes and opacities;
 * the composition is picked from the path so a page always wears the same one.
 */
const MOTIFS = [
  { blob: 'top:-60px;right:-50px', arc: 'bottom:90px;left:-40px', rot: 20, sweep: 210 },
  { blob: 'top:-44px;left:-40px', arc: 'top:45%;right:-48px', rot: 60, sweep: 200 },
  { blob: 'top:-60px;right:-48px', arc: 'top:-30px;left:-34px', rot: -10, sweep: 230 },
];
function ScreenMotif({ pathname }: { pathname: string }) {
  let h = 0;
  for (const c of pathname.split('/')[1] ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const m = MOTIFS[h % MOTIFS.length]!;
  const css = (s: string) =>
    Object.fromEntries(s.split(';').map((kv) => kv.split(':') as [string, string]));
  const r = 48;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = 50 + r * Math.cos(rad(-90));
  const y1 = 50 + r * Math.sin(rad(-90));
  const x2 = 50 + r * Math.cos(rad(-90 + m.sweep));
  const y2 = 50 + r * Math.sin(rad(-90 + m.sweep));
  return (
    <div className="ap-motif" aria-hidden="true">
      <span className="ap-motif__blob" style={css(m.blob)} />
      <svg className="ap-motif__arc" style={{ ...css(m.arc), transform: `rotate(${m.rot}deg)` }} viewBox="0 0 100 100">
        <path
          d={`M ${x1} ${y1} A ${r} ${r} 0 ${m.sweep > 180 ? 1 : 0} 1 ${x2} ${y2}`}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="0.1 9"
          fill="none"
        />
      </svg>
    </div>
  );
}
