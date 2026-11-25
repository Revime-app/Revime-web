'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireSession, useSession } from '../../../lib/client/session';
import { IconChevronRight, IconList, IconLogout, IconMessage } from '../../../components/app/icons';
import { Loader, PageTitle, initials } from '../../../components/app/ui';

export default function ProfilPage() {
  const me = useRequireSession();
  const { signOut } = useSession();
  const router = useRouter();
  if (!me) return <Loader />;
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username;
  return (
    <div className="ap-page ap-narrow">
      <PageTitle title="Profil" />
      <div className="ap-box ap-me">
        <span className="ap-avatar ap-avatar--xl" aria-hidden="true">
          {initials(name)}
        </span>
        <div>
          <strong>{name}</strong>
          <span>@{me.username}</span>
          <span>{me.email}</span>
        </div>
      </div>
      <nav className="ap-list" aria-label="Mon compte">
        <Link href="/mes-demandes">
          <IconList size={20} /> Mes demandes <IconChevronRight size={18} />
        </Link>
        <Link href="/messages">
          <IconMessage size={20} /> Messages <IconChevronRight size={18} />
        </Link>
        <button
          onClick={async () => {
            await signOut();
            router.push('/');
          }}
        >
          <IconLogout size={20} /> Se déconnecter
        </button>
      </nav>
      <p className="ap-hint">
        Vérification du compte, adresse, paiements et mode réparateur arrivent sur le site dans les prochaines étapes.
        En attendant, ils sont dans l’appli.
      </p>
    </div>
  );
}
