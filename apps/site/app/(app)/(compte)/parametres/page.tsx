'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireSession, useSession } from '../../../../lib/client/session';
import { PUBLIC_DOCUMENTS, SUPPORT_EMAIL } from '../../../../lib/documents';
import { IconChevronRight } from '../../../../components/app/icons';
import { Loader, PageTitle } from '../../../../components/app/ui';
import { ModeSwitch } from '../../../../components/app/ModeSwitch';

/**
 * The app's Paramètres, sorted the same way (Compte, Mode, Confidentialité, Informations légales).
 * What the site cannot change yet says where it is changed today, instead of a dead row.
 */
export default function ParametresPage() {
  const me = useRequireSession();
  const { signOut } = useSession();
  const router = useRouter();
  if (!me) return <Loader />;
  const privacy = PUBLIC_DOCUMENTS.filter((d) => /confidentialit/i.test(d.label));
  const legal = PUBLIC_DOCUMENTS.filter((d) => !/confidentialit/i.test(d.label));
  return (
    <div className="ap-page">
      <PageTitle title="Paramètres" />

      <h2 className="ap-eyebrow-h">Compte</h2>
      <dl className="ap-box ap-kv">
        <div>
          <dt>Nom</dt>
          <dd>{[me.firstName, me.lastName].filter(Boolean).join(' ') || '–'}</dd>
        </div>
        <div>
          <dt>E-mail</dt>
          <dd>{me.email}</dd>
        </div>
        <div>
          <dt>Téléphone</dt>
          <dd>{me.phone ?? 'Non renseigné'}</dd>
        </div>
      </dl>
      <p className="ap-hint">Mot de passe oublié ? <Link href="/mot-de-passe-oublie">Recevoir un lien</Link>. La sécurité et les notifications se modifient dans l’appli.</p>

      <h2 className="ap-eyebrow-h">Mode</h2>
      <ModeSwitch />
      <p className="ap-hint">Un seul compte, deux usages. Le mode est le même sur le site et dans l’appli.</p>

      <h2 className="ap-eyebrow-h">Confidentialité</h2>
      <nav className="ap-list">
        {privacy.map((d) => (
          <Link key={d.slug} href={`/${d.slug}`}>
            {d.label} <IconChevronRight size={18} />
          </Link>
        ))}
      </nav>

      <h2 className="ap-eyebrow-h">Informations légales</h2>
      <nav className="ap-list">
        {legal.map((d) => (
          <Link key={d.slug} href={`/${d.slug}`}>
            {d.label} <IconChevronRight size={18} />
          </Link>
        ))}
      </nav>

      <h2 className="ap-eyebrow-h">Aide</h2>
      <nav className="ap-list">
        <a href={`mailto:${SUPPORT_EMAIL}`}>
          Contacter le support <IconChevronRight size={18} />
        </a>
        <Link href="/suppression-compte">
          Supprimer mon compte <IconChevronRight size={18} />
        </Link>
        <button
          onClick={async () => {
            await signOut();
            router.push('/');
          }}
        >
          Se déconnecter
        </button>
      </nav>
    </div>
  );
}
