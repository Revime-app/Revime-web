'use client';

import Link from 'next/link';
import { use } from 'react';
import { VERIFIED_BADGE_LABEL, type RepairerProfileDto, type ReviewDto } from '@revime/shared';
import { useApi } from '../../../../lib/client/use-api';
import { IconPin, IconShieldCheck } from '../../../../components/app/icons';
import { Loader, PageTitle, Stars, initials } from '../../../../components/app/ui';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const hhmm = (m: number | null) => (m === null ? '' : `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`);
const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function RepairerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const profile = useApi<RepairerProfileDto>(`/repairers/${id}`);
  const reviews = useApi<ReviewDto[]>(`/repairers/${id}/reviews`);

  if (profile.loading) return <Loader />;
  if (!profile.data) {
    return (
      <div className="ap-page">
        <PageTitle title="Réparateur" back="/reparateurs" />
        <p className="ap-error">{profile.error ?? 'Ce réparateur n’est plus disponible.'}</p>
      </div>
    );
  }
  const r = profile.data as RepairerProfileDto & { specialities?: string[] };
  const week = [1, 2, 3, 4, 5, 6, 0].map((d) => r.availability.find((a) => a.dayOfWeek === d)).filter(Boolean);

  return (
    <div className="ap-page ap-profile">
      <Link href="/reparateurs" className="ap-crumb">
        ‹ Réparateurs
      </Link>
      <section className="ap-profile__head">
        <div className="ap-profile__banner" aria-hidden="true">
          {r.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.bannerUrl} alt="" />
          )}
        </div>
        <div className="ap-profile__id">
          <span className="ap-avatar ap-avatar--xl" aria-hidden="true">
            {r.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.avatarUrl} alt="" />
            ) : (
              initials(r.displayName)
            )}
          </span>
          <div className="ap-profile__who">
            <h1>{r.displayName}</h1>
            <Stars rating={r.rating} count={r.reviewCount} />
            <span className="ap-profile__line">
              {r.verifiedBadge && (
                <span className="ap-verified">
                  <IconShieldCheck size={14} /> {VERIFIED_BADGE_LABEL[r.verifiedBadge]}
                </span>
              )}
              <span className="ap-rcard__area">
                <IconPin size={14} /> {r.serviceAreaLabel ?? 'Zone non précisée'}
                {r.serviceRadiusKm ? ` · jusqu’à ${r.serviceRadiusKm} km` : ''}
              </span>
            </span>
          </div>
          <Link href="/publier" className="ap-btn ap-btn--primary ap-profile__cta">
            Demander un devis
          </Link>
        </div>
      </section>

      <div className="ap-profile__grid">
        <div className="ap-stack">
          <dl className="ap-stats">
            <div>
              <dt>Réparations</dt>
              <dd>{r.repairCount}</dd>
            </div>
            <div>
              <dt>Avis</dt>
              <dd>{r.reviewCount}</dd>
            </div>
            <div>
              <dt>Sur REVIME depuis</dt>
              <dd>{monthYear.format(new Date(r.repairerSince))}</dd>
            </div>
          </dl>
          {r.bio && (
            <section className="ap-box">
              <h2>À propos</h2>
              <p>{r.bio}</p>
            </section>
          )}
          <section className="ap-box">
            <h2>Avis des clients</h2>
            {reviews.loading && <Loader />}
            {!reviews.loading && (reviews.data?.length ?? 0) === 0 && (
              <p className="ap-muted">Pas encore d’avis. Les avis viennent uniquement de clients qui ont payé une réparation sur REVIME.</p>
            )}
            <ul className="ap-reviews">
              {reviews.data?.map((rv) => (
                <li key={rv.id}>
                  <div className="ap-reviews__head">
                    <strong>{rv.authorName}</strong>
                    <span className="ap-reviews__stars" aria-label={`${rv.rating} sur 5`}>
                      {'★'.repeat(rv.rating)}
                      <span>{'★'.repeat(5 - rv.rating)}</span>
                    </span>
                    <span className="ap-muted">{dayFmt.format(new Date(rv.createdAt))}</span>
                  </div>
                  {rv.comment && <p>{rv.comment}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="ap-stack">
          {r.specialities && r.specialities.length > 0 && (
            <section className="ap-box">
              <h2>Spécialités</h2>
              <div className="ap-tags">
                {r.specialities.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
            </section>
          )}
          {week.length > 0 && (
            <section className="ap-box">
              <h2>Horaires</h2>
              <dl className="ap-hours">
                {week.map((a) => (
                  <div key={a!.dayOfWeek}>
                    <dt>{DAYS[a!.dayOfWeek]}</dt>
                    <dd>{a!.closed ? 'Fermé' : `${hhmm(a!.opensAt)} – ${hhmm(a!.closesAt)}`}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section className="ap-box ap-box--dark">
            <IconShieldCheck size={22} />
            <p>
              <strong>Protection REVIME.</strong> Vous payez en ligne, le réparateur est payé seulement quand vous validez
              la réparation.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
