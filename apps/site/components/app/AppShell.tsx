'use client';

import Link from 'next/link';
import { Spotlight } from './Spotlight';
import { NotifBell } from './NotifBell';
import { usePathname } from 'next/navigation';
import { DEMO } from '../../lib/client/config';
import { useSession } from '../../lib/client/session';
import { IconBriefcase, IconHelp, IconHome, IconMessage, IconPlus, IconSearch, IconUser } from './icons';
import { SiteFooter } from './SiteFooter';

function isOn(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One frame for every visitor, signed in or not. On a computer, a top bar with the search, the two
 * things to browse and the account. On a phone it is the app: a slim top bar and the bottom bar
 * with the red « + » in the middle (Accueil, Recherche, +, Messages, Profil).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, me } = useSession();
  const signedIn = status === 'in';
  const loginHref = (to: string) => (signedIn ? to : `/connexion?suite=${encodeURIComponent(to)}`);
  const searching = isOn(pathname, '/reparateurs') || isOn(pathname, '/demandes');
  const pro = signedIn && me?.profile.activeMode === 'REPAIRER';
  const inAccount = ['/profil', '/mes-demandes', '/offres-recues', '/favoris', '/parametres', '/mes-propositions', '/mes-missions', '/profil-pro', '/commandes', '/notifications'].some((h) => isOn(pathname, h));
  /** The visitor's four doors: the same bar shape as the app, with what a visitor needs. */
  const visitorTabs = [
    { href: '/', label: 'Accueil', icon: IconHome, on: pathname === '/', cls: undefined },
    { href: '/reparateurs', label: 'Trouver un réparateur', icon: IconSearch, on: searching, cls: undefined },
    { href: '/comment-ca-marche', label: 'Comment ça marche', icon: IconHelp, on: isOn(pathname, '/comment-ca-marche'), cls: undefined },
    { href: '/devenir-reparateur', label: 'Devenir réparateur', icon: IconBriefcase, on: isOn(pathname, '/devenir-reparateur'), cls: 'is-pro' },
  ];
  /** Signed in: the app's tab bar, word for word (Accueil, Recherche, Messages, Profil). */
  const memberTabs = [
    { href: pro ? '/tableau-de-bord' : '/', label: 'Accueil', icon: IconHome, on: pathname === '/' || isOn(pathname, '/tableau-de-bord'), cls: undefined },
    { href: pro ? '/demandes' : '/reparateurs', label: 'Recherche', icon: IconSearch, on: searching, cls: undefined },
    { href: '/messages', label: 'Messages', icon: IconMessage, on: isOn(pathname, '/messages'), cls: undefined },
    { href: '/profil', label: 'Profil', icon: IconUser, on: inAccount, cls: undefined },
  ];

  return (
    <div className="ap">
      <Spotlight />
      <div className="ap-progress" aria-hidden="true" />
      <a className="ap-skip" href="#contenu">
        Aller au contenu
      </a>
      {DEMO && <div className="ap-demo">Aperçu avec des données fictives : rien n’est envoyé.</div>}

      <header className="ap-header">
        <div className="ap-header__in">
          <Link href="/" className="ap-logo" aria-label="REVIME, accueil">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/revime-logo.png" alt="REVIME" width={124} height={22} />
            {signedIn && <span className={pro ? 'ap-modebadge ap-modebadge--pro' : 'ap-modebadge'}>{pro ? 'Réparateur' : 'Client'}</span>}
          </Link>
          <nav className={pro ? 'ap-nav ap-nav--pro' : 'ap-nav'} aria-label="Principale">
            {(signedIn ? memberTabs : visitorTabs).map(({ href, label, icon: Icon, on, cls }) => (
              <Link key={label} href={href} className={cls} aria-current={on ? 'page' : undefined}>
                <Icon size={19} /> {label}
              </Link>
            ))}
          </nav>
          <div className="ap-header__end">
            <NotifBell />
            {status === 'out' && (
              <Link href={`/connexion?suite=${encodeURIComponent(pathname)}`} className="ap-login">
                Se connecter
              </Link>
            )}
            {pro ? (
              <Link href="/demandes" className="ap-btn ap-btn--primary ap-btn--pro ap-publish">
                <IconBriefcase size={18} /> Voir les demandes
              </Link>
            ) : (
              <Link href="/publier" className="ap-btn ap-btn--primary ap-publish">
                <IconPlus size={18} strokeWidth={2.6} /> Publier une demande
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="contenu" className="ap-main">
        <ScreenMotif pathname={pathname} />
        {children}
      </main>

      <SiteFooter />

      <nav className="ap-tabs" aria-label="Navigation">
        <Link href={pro ? '/tableau-de-bord' : '/'} className="ap-tab" aria-current={pathname === '/' || isOn(pathname, '/tableau-de-bord') ? 'page' : undefined}>
          <IconHome size={22} />
          <span>Accueil</span>
        </Link>
        <Link href="/demandes" className="ap-tab" aria-current={searching ? 'page' : undefined}>
          <IconSearch size={22} />
          <span>Recherche</span>
        </Link>
        {pro ? (
          <Link href="/demandes" className="ap-fab ap-fab--pro" aria-label="Voir les demandes">
            <IconBriefcase size={26} />
          </Link>
        ) : (
          <Link href="/publier" className="ap-fab" aria-label="Publier une demande">
            <IconPlus size={28} strokeWidth={2.6} />
          </Link>
        )}
        <Link href={loginHref('/messages')} className="ap-tab" aria-current={isOn(pathname, '/messages') ? 'page' : undefined}>
          <IconMessage size={22} />
          <span>Messages</span>
        </Link>
        <Link
          href={loginHref('/profil')}
          className="ap-tab"
          aria-current={inAccount ? 'page' : undefined}
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
