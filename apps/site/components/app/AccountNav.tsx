'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '../../lib/client/session';
import {
  IconBadgeCheck,
  IconBriefcase,
  IconCompare,
  IconHeart,
  IconHome,
  IconSearch,
  IconInbox,
  IconLogout,
  IconMessage,
  IconSettings,
  IconUser,
  IconWrench,
} from './icons';
import { initials } from './ui';
import { ModeSwitch } from './ModeSwitch';

/**
 * The app's « Raccourcis » (Profil tab), as a website does it: a column that stays beside every
 * personal page on a computer, instead of a grid you go back to between screens. On a phone the
 * column is hidden and the Profil page shows the grid, as in the app.
 */
export const ACCOUNT_LINKS = [
  { href: '/mes-demandes', label: 'Mes réparations', sub: 'En cours et terminées', icon: IconWrench },
  { href: '/offres-recues', label: 'Mes offres reçues', sub: 'Offres des réparateurs', icon: IconInbox },
  { href: '/messages', label: 'Messages', sub: 'Vos conversations', icon: IconMessage },
  { href: '/favoris', label: 'Mes favoris', sub: 'Réparateurs et annonces sauvegardés', icon: IconHeart },
  { href: '/profil', label: 'Mon profil', sub: 'Compte et vérifications', icon: IconUser },
  { href: '/parametres', label: 'Paramètres', sub: 'Compte, mode et documents', icon: IconSettings },
] as const;

/** The réparateur's rubriques, in the app's words (Profil tab, réparateur mode). */
export const PRO_LINKS = [
  { href: '/tableau-de-bord', label: 'Tableau de bord', sub: 'À faire et activité', icon: IconHome },
  { href: '/statut-verification', label: 'Configuration', sub: 'Identité, entreprise, versements', icon: IconBadgeCheck },
  { href: '/demandes', label: 'Demandes près de chez moi', sub: 'Faire une offre', icon: IconSearch },
  { href: '/mes-propositions', label: 'Mes propositions', sub: 'Offres et devis demandés', icon: IconCompare },
  { href: '/mes-missions', label: 'Mes réparations', sub: 'En cours, revenus', icon: IconBriefcase },
  { href: '/messages', label: 'Messages', sub: 'Vos conversations', icon: IconMessage },
  { href: '/profil-pro', label: 'Mon profil public', sub: 'Ce que voient les clients', icon: IconUser },
  { href: '/parametres', label: 'Paramètres', sub: 'Compte, mode et documents', icon: IconSettings },
] as const;

export function AccountNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { me, signOut } = useSession();
  const name = me ? [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username : '';
  return (
    <aside className={me?.profile.activeMode === 'REPAIRER' ? 'ap-acnav ap-acnav--pro' : 'ap-acnav'} aria-label="Mon espace">
      {me && (
        <Link href="/profil" className="ap-acnav__me">
          <span className="ap-acnav__av" aria-hidden="true">
            {initials(name)}
          </span>
          <span>
            <strong>{name}</strong>
            <span>{me.profile.activeMode === 'REPAIRER' ? 'Réparateur' : 'Client'}</span>
          </span>
        </Link>
      )}
      <ModeSwitch compact />
      <nav>
        {(me?.profile.activeMode === 'REPAIRER' ? PRO_LINKS : ACCOUNT_LINKS).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined}>
            <span className="ap-acnav__ic">
              <Icon size={18} />
            </span>
            {label}
          </Link>
        ))}
      </nav>
      <button
        type="button"
        className="ap-acnav__out"
        onClick={async () => {
          await signOut();
          router.push('/');
        }}
      >
        <IconLogout size={18} /> Se déconnecter
      </button>
    </aside>
  );
}
