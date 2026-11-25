'use client';

import { useMe } from '../../../components/espace/Session';
import { ScreenTitle } from '../../../components/espace/ui';
import { IconLogout } from '../../../components/espace/icons';

export default function ProfilPage() {
  const { me, signOut } = useMe();
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username;
  return (
    <div className="esp-page">
      <ScreenTitle title="Profil" />
      <div className="esp-card esp-profile">
        <span className="esp-avatar esp-avatar--xl" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <p className="esp-card__title">{name}</p>
          <p className="esp-muted">@{me.username}</p>
          <p className="esp-muted">{me.email}</p>
        </div>
      </div>
      <p className="esp-muted esp-small">
        Les réglages du compte (vérification, adresse, paiements, mode réparateur) arrivent sur le site dans les
        prochaines étapes.
      </p>
      <button className="esp-btn esp-btn--secondary" onClick={signOut}>
        <IconLogout size={18} /> Se déconnecter
      </button>
    </div>
  );
}
