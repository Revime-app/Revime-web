'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { JourneyStep } from '@revime/shared';
import { useRequireSession } from '../../../../lib/client/session';
import { useConnectStart, useIdentityStart, useRepairerJourney } from '../../../../lib/client/journey';
import { Loader, PageTitle } from '../../../../components/app/ui';

/**
 * The app's « Configuration réparateur » (statut-verification.tsx): the shared journey, step by step,
 * each with its button. Where a réparateur lands right after signing up.
 */
function stepTitle(step: JourneyStep): string {
  return step.progress ? `${step.label} · ${step.progress} · ${step.minutes} min` : `${step.label} · ${step.minutes} min`;
}

export default function StatutVerificationPage() {
  const me = useRequireSession();
  const router = useRouter();
  const { loading, journey, identityError, connectError, reload } = useRepairerJourney();
  const identity = useIdentityStart();
  const payouts = useConnectStart();
  if (!me) return <Loader />;

  if (!me.profile.repairerEnabled) {
    return (
      <div className="ap-page ap-narrow" data-mode="pro">
        <PageTitle title="Configuration réparateur" back="/profil" />
        <p className="ap-muted">Activez d’abord le mode réparateur.</p>
        <Link className="ap-btn ap-btn--primary" href="/mode-reparateur">
          Devenir réparateur
        </Link>
      </div>
    );
  }

  const cta = (step: JourneyStep) => {
    if (step.cta === null) return null;
    switch (step.key) {
      case 'kind':
        return (
          <Link className="ap-btn ap-btn--primary ap-btn--block" href="/mode-reparateur">
            {step.cta}
          </Link>
        );
      case 'identity':
        return (
          <>
            {identity.error && <p className="ap-field__error">{identity.error}</p>}
            <button type="button" className="ap-btn ap-btn--primary ap-btn--block" onClick={() => void identity.start()} disabled={identity.loading}>
              {identity.loading ? 'Ouverture de Stripe…' : step.cta}
            </button>
          </>
        );
      case 'business':
        return (
          <Link className="ap-btn ap-btn--primary ap-btn--block" href="/entreprise">
            {step.cta}
          </Link>
        );
      case 'fiscal':
        return (
          <Link className="ap-btn ap-btn--primary ap-btn--block" href="/fiscalite">
            {step.cta}
          </Link>
        );
      case 'profile':
        return (
          <Link className="ap-btn ap-btn--primary ap-btn--block" href="/profil-pro">
            {step.cta}
          </Link>
        );
      case 'payouts':
        return (
          <>
            {payouts.error && <p className="ap-field__error">{payouts.error}</p>}
            <button type="button" className="ap-btn ap-btn--primary ap-btn--block" onClick={() => void payouts.start()} disabled={payouts.loading}>
              {payouts.loading ? 'Ouverture de Stripe…' : step.cta}
            </button>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="ap-page ap-narrow ap-journey" data-mode="pro">
      <PageTitle title="Configuration réparateur" back="/profil" />
      {loading || !journey ? (
        <Loader />
      ) : (
        <>
          <div className="ap-box ap-journey__head">
            <p>
              <strong>
                {journey.completed <= 1
                  ? `${journey.completed} étape sur ${journey.total} terminée`
                  : `${journey.completed} étapes sur ${journey.total} terminées`}
              </strong>
            </p>
            <div className="ap-journey__bar" role="progressbar" aria-valuemin={0} aria-valuemax={journey.total} aria-valuenow={journey.completed}>
              <span style={{ width: `${(journey.completed / Math.max(journey.total, 1)) * 100}%` }} />
            </div>
          </div>

          <ol className="ap-journey__steps">
            {journey.steps.map((step) => {
              const errored = (step.key === 'identity' && identityError) || (step.key === 'payouts' && connectError);
              if (step.status === 'done' && !errored) {
                return (
                  <li key={step.key} className="ap-jstep is-done">
                    <span className="ap-jstep__tick" aria-hidden="true">
                      ✓
                    </span>
                    <span className="ap-jstep__label">{step.label}</span>
                    {step.value && <span className="ap-jstep__value">{step.value}</span>}
                  </li>
                );
              }
              return (
                <li key={step.key} className={`ap-jstep is-${step.status}`}>
                  <div className="ap-jstep__top">
                    <strong>{stepTitle(step)}</strong>
                    <span className="ap-jstep__chip">{step.status === 'waiting' ? 'En cours' : step.unlocks}</span>
                  </div>
                  <p>{errored ? 'Statut indisponible, réessayez' : step.body}</p>
                  {errored ? (
                    <button type="button" className="ap-link" onClick={reload}>
                      Réessayer
                    </button>
                  ) : step.status === 'waiting' || step.status === 'blocked' ? null : (
                    cta(step)
                  )}
                </li>
              );
            })}
          </ol>

          {journey.complete ? (
            <div className="ap-box">
              <p>Vous pouvez envoyer des offres et recevoir vos paiements.</p>
            </div>
          ) : (
            <div className="ap-journey__later">
              <button type="button" className="ap-btn ap-btn--secondary ap-btn--block" onClick={() => router.push('/demandes')}>
                Configurer plus tard
              </button>
              <p className="ap-hint">Vous pouvez déjà consulter les demandes près de chez vous.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
