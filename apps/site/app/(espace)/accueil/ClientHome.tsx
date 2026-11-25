'use client';

import Link from 'next/link';
import type { CategoryDto, DemandeListItem } from '@revime/shared';
import { useApi } from '../../../lib/client/use-api';
import { useMe } from '../../../components/espace/Session';
import { DemandeCard } from '../../../components/espace/DemandeCard';
import { Eyebrow, Loader } from '../../../components/espace/ui';
import {
  IconArrowRight,
  IconBike,
  IconGamepad,
  IconLaptop,
  IconPhone,
  IconSearch,
  IconShieldCheck,
  IconWatch,
} from '../../../components/espace/icons';

/** The app's five shortcut tiles (apps/mobile/src/lib/category-tiles.ts), same slugs and labels. */
const TILES = [
  { slug: 'smartphone', label: 'Mobile', Icon: IconPhone },
  { slug: 'ordinateur', label: 'PC', Icon: IconLaptop },
  { slug: 'montres-bijoux', label: 'Montre', Icon: IconWatch },
  { slug: 'console', label: 'Console', Icon: IconGamepad },
  { slug: 'velos', label: 'Vélo', Icon: IconBike },
] as const;

/** The demande the client is following: the newest one that is not finished or cancelled. */
function activeDemande(list: DemandeListItem[] | undefined): DemandeListItem | null {
  return list?.find((d) => d.status === 'OPEN' || d.status === 'IN_PROGRESS') ?? null;
}

export function ClientHome() {
  const { me } = useMe();
  const demandes = useApi<DemandeListItem[]>('/demandes/mine');
  const categories = useApi<CategoryDto[]>('/categories');
  const current = activeDemande(demandes.data);
  const total = demandes.data?.length ?? 0;
  const firstName = me.firstName?.trim();
  const tiles = TILES.map((t) => ({ ...t, id: categories.data?.find((c) => c.slug === t.slug)?.id })).filter(
    (t) => t.id,
  );

  return (
    <div className="esp-page esp-home">
      <Eyebrow red>{firstName ? `BONJOUR ${firstName.toUpperCase()}` : 'BONJOUR'}</Eyebrow>
      <h1 className="esp-headline">
        Une réparation ?<br />
        Comparez, puis choisissez.
      </h1>

      <Link href="/publier" className="esp-search" aria-label="Rechercher une réparation">
        <IconSearch size={18} />
        <span>Rechercher une réparation…</span>
      </Link>

      <Link href="/publier" className="esp-promo">
        <span className="esp-promo__scrim" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="esp-promo__art" src="/illustrations/banner1.webp" alt="" />
        <span className="esp-promo__content">
          <span className="esp-promo__title">
            Un objet cassé ?<br />
            On s’en occupe.
          </span>
          <span className="esp-promo__cta">
            Publier une demande <IconArrowRight size={14} strokeWidth={2.4} />
          </span>
        </span>
      </Link>

      {tiles.length > 0 && (
        <section className="esp-section">
          <div className="esp-section__head">
            <Eyebrow>CATÉGORIES</Eyebrow>
            <Link href="/publier" className="esp-link">
              Tout voir
            </Link>
          </div>
          <div className="esp-tiles">
            {tiles.map(({ slug, label, Icon, id }) => (
              <Link key={slug} href={`/publier?categorie=${id}`} className="esp-tile">
                <span className="esp-tile__icon">
                  <Icon size={24} />
                </span>
                {label}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="esp-section">
        <Eyebrow>MA DEMANDE EN COURS</Eyebrow>
        {demandes.loading && <Loader />}
        {demandes.error && <p className="esp-error">Impossible de charger vos demandes. {demandes.error}</p>}
        {!demandes.loading && !demandes.error && current === null && (
          <div className="esp-card">
            <p className="esp-card__title">Aucune demande en cours</p>
            <p className="esp-muted">
              {total === 0
                ? 'Publiez votre première demande avec le bouton « + ».'
                : 'Publiez-en une nouvelle avec le bouton « + ».'}
            </p>
          </div>
        )}
        {current && <DemandeCard demande={current} highlight />}
        {total > 0 && (current === null || total > 1) && (
          <Link href="/mes-demandes" className="esp-link esp-link--block">
            Voir toutes mes demandes ({total})
          </Link>
        )}
      </section>

      <div className="esp-trust">
        <IconShieldCheck size={22} className="esp-trust__icon" />
        <span>
          <strong>Réparateurs vérifiés</strong>
          <span>Identité et entreprise contrôlées. Ici, la réputation compte plus que le statut.</span>
        </span>
      </div>
    </div>
  );
}
