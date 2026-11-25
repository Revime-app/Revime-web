'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DemandeListItem } from '@revime/shared';
import { useRequireSession, useSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { useConnectStart, useRepairerJourney } from '../../../../lib/client/journey';
import { ACCOUNT_LINKS, PRO_LINKS } from '../../../../components/app/AccountNav';
import { IconBadgeCheck, IconChevronRight, IconLogout } from '../../../../components/app/icons';
import { Loader, initials } from '../../../../components/app/ui';
import { ModeSwitch } from '../../../../components/app/ModeSwitch';
import { AvatarEditor } from '../../../../components/app/PhotoUpload';
import { SettingsRow, SettingsSection } from '../../../../components/app/Settings';

/**
 * The app's Profil tab ((tabs)/profil.tsx): the identity band in the mode's colour (red for a client,
 * Bleu Ink for a réparateur), the verifications, the réparateur's setup, zone, identity, company and
 * payouts, the shortcuts, then the account.
 */
function RepairerBlocks() {
  const { me } = useSession();
  const { loading, journey, connect, verificationLabel } = useRepairerJourney();
  const payouts = useConnectStart();
  if (!me?.repairer) return null;
  const r = me.repairer;
  const connectLabel = connect?.transfersActive ? 'Activés' : connect?.status ? 'À compléter' : 'Non configurés';

  return (
    <>
      {!loading && journey && !journey.complete && (
        <Link href="/statut-verification" className="ap-setup">
          <span className="ap-setup__text">
            <strong>Terminez votre configuration</strong>
            <span>
              {journey.completed} étape{journey.completed > 1 ? 's' : ''} sur {journey.total} · environ {journey.minutesLeft} min
            </span>
          </span>
          <span className="ap-setup__bar" aria-hidden="true">
            <span style={{ width: `${(journey.completed / Math.max(journey.total, 1)) * 100}%` }} />
          </span>
          <IconChevronRight size={18} />
        </Link>
      )}

      <SettingsSection title="Zone d'intervention">
        <SettingsRow
          label="Code postal"
          value={r.postalCode ? [r.postalCode, r.serviceAreaLabel].filter(Boolean).join(' · ') : 'Non renseigné'}
          href="/profil-pro#zone"
        />
      </SettingsSection>

      <SettingsSection title="Mon identité">
        <SettingsRow label="Vérification d'identité" value={verificationLabel ?? '…'} href="/statut-verification" />
      </SettingsSection>

      {r.kind === 'PRO' && (
        <SettingsSection title="Mon entreprise">
          <SettingsRow
            label="Professionnel vérifié"
            value={me.profile.verificationLevel === 'BUSINESS' ? 'Vérifiée' : 'À vérifier'}
            href="/entreprise"
          />
        </SettingsSection>
      )}

      <SettingsSection title="Informations fiscales">
        <SettingsRow label="Déclaration DAC7" value={r.fiscalCompleted ? 'Renseignée' : 'À compléter'} href="/fiscalite" />
      </SettingsSection>

      {me.connectEnabled && (
        <SettingsSection title="Mes virements">
          <SettingsRow
            label="Versements"
            value={payouts.loading ? 'Ouverture de Stripe…' : connectLabel}
            onClick={payouts.loading ? null : () => void payouts.start()}
          />
        </SettingsSection>
      )}
      {payouts.error && <p className="ap-field__error">{payouts.error}</p>}
    </>
  );
}

export default function ProfilPage() {
  const me = useRequireSession();
  const { signOut } = useSession();
  const router = useRouter();
  const pro = me?.profile.activeMode === 'REPAIRER';
  const mine = useApi<DemandeListItem[]>(me && !pro ? '/demandes/mine' : null);
  if (!me) return <Loader />;
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username;
  const avatar = me.avatarUrl ?? me.image ?? null;
  const list = mine.data ?? [];
  const inProgress = list.filter((d) => d.status === 'OPEN' || d.status === 'IN_PROGRESS').length;
  const checks = [
    me.emailVerified && 'E-mail vérifié',
    me.phoneVerified && 'Téléphone vérifié',
    (me.profile.verificationLevel === 'IDENTITY' || me.profile.verificationLevel === 'BUSINESS') && 'Identité vérifiée',
    me.profile.verificationLevel === 'BUSINESS' && 'Professionnel vérifié',
  ].filter(Boolean) as string[];

  return (
    <div className="ap-page">
      <h1 className="ap-sr">Profil</h1>
      <section className="ap-idcard">
        <div className="ap-idcard__top">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ap-idcard__av ap-idcard__av--img" src={avatar} alt="" />
          ) : (
            <span className="ap-idcard__av" aria-hidden="true">
              {initials(name)}
            </span>
          )}
          <div>
            <strong>{pro && me.repairer?.displayName ? me.repairer.displayName : name}</strong>
            <span>@{me.username}</span>
            <span className="ap-idcard__role">{pro ? 'Réparateur' : 'Client'}</span>
          </div>
        </div>
        {!pro && (
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
        )}
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

      {pro ? <RepairerBlocks /> : <AvatarEditor me={me} />}

      <div className="ap-only-phone">
        <h2 className="ap-eyebrow-h">Mode</h2>
        <ModeSwitch />
      </div>

      <h2 className="ap-eyebrow-h ap-only-phone">Raccourcis</h2>
      <nav className="ap-shortcuts ap-only-phone" aria-label="Raccourcis">
        {(pro ? PRO_LINKS : ACCOUNT_LINKS)
          .filter((l) => l.href !== '/profil')
          .map(({ href, label, sub, icon: Icon }) => (
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

      <SettingsSection title="Mon compte">
        <SettingsRow label="E-mail" value={me.email} href="/parametres/compte" />
        <SettingsRow label="Nom d’utilisateur" value={`@${me.username}`} href="/parametres/compte" />
        <SettingsRow label="Téléphone" value={me.phone ?? 'Non renseigné'} href="/parametres/compte" />
        <SettingsRow label="Paramètres" href="/parametres" />
      </SettingsSection>

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
