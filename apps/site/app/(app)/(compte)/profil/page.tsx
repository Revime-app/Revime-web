'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DemandeListItem } from '@revime/shared';
import { useRequireSession, useSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { ACCOUNT_LINKS } from '../../../../components/app/AccountNav';
import { IconBadgeCheck, IconChevronRight, IconLogout } from '../../../../components/app/icons';
import { Loader, initials } from '../../../../components/app/ui';
import { ModeSwitch } from '../../../../components/app/ModeSwitch';

/** The app's Profil tab: the red identity card, the verifications, then the shortcuts. */
export default function ProfilPage() {
  const me = useRequireSession();
  const { signOut } = useSession();
  const router = useRouter();
  const mine = useApi<DemandeListItem[]>(me ? '/demandes/mine' : null);
  if (!me) return <Loader />;
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username;
  const list = mine.data ?? [];
  const inProgress = list.filter((d) => d.status === 'OPEN' || d.status === 'IN_PROGRESS').length;
  const checks = [
    me.emailVerified && 'E-mail vérifié',
    me.phoneVerified && 'Téléphone vérifié',
  ].filter(Boolean) as string[];

  return (
    <div className="ap-page">
      <h1 className="ap-sr">Profil</h1>
      <section className="ap-idcard">
        <div className="ap-idcard__top">
          <span className="ap-idcard__av" aria-hidden="true">
            {initials(name)}
          </span>
          <div>
            <strong>{name}</strong>
            <span>{me.email}</span>
            <span className="ap-idcard__role">{me.profile.activeMode === 'REPAIRER' ? 'Réparateur' : 'Client'}</span>
          </div>
        </div>
        <dl className="ap-idcard__stats">
          <div>
            <dt>Demandes</dt>
            <dd>{mine.data ? list.length : '–'}</dd>
          </div>
          <div>
            <dt>En cours</dt>
            <dd>{mine.data ? inProgress : '–'}</dd>
          </div>
        </dl>
      </section>

      {checks.length > 0 && (
        <ul className="ap-checks">
          {checks.map((c) => (
            <li key={c}>
              <IconBadgeCheck size={18} /> {c}
            </li>
          ))}
        </ul>
      )}

      <div className="ap-only-phone">
        <h2 className="ap-eyebrow-h">Mode</h2>
        <ModeSwitch />
      </div>

      <h2 className="ap-eyebrow-h ap-only-phone">Raccourcis</h2>
      <nav className="ap-shortcuts ap-only-phone" aria-label="Raccourcis">
        {ACCOUNT_LINKS.filter((l) => l.href !== '/profil').map(({ href, label, sub, icon: Icon }) => (
          <Link key={href} href={href}>
            <span className="ap-shortcuts__ic">
              <Icon size={22} />
            </span>
            <IconChevronRight size={18} className="ap-shortcuts__chev" />
            <strong>{label}</strong>
            <span>{sub}</span>
          </Link>
        ))}
      </nav>

      <h2 className="ap-eyebrow-h">Mon compte</h2>
      <dl className="ap-box ap-kv">
        <div>
          <dt>E-mail</dt>
          <dd>{me.email}</dd>
        </div>
        <div>
          <dt>Nom d’utilisateur</dt>
          <dd>@{me.username}</dd>
        </div>
        {me.phone && (
          <div>
            <dt>Téléphone</dt>
            <dd>{me.phone}</dd>
          </div>
        )}
      </dl>

      <button
        type="button"
        className="ap-btn ap-btn--secondary ap-only-mobile"
        onClick={async () => {
          await signOut();
          router.push('/');
        }}
      >
        <IconLogout size={18} /> Se déconnecter
      </button>
    </div>
  );
}
