'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import {
  STEP_LABEL,
  canAdvance,
  canValidate,
  labelReady,
  nextStepFor,
  stepsFor,
  type CommandeDto,
  type CommandeStep,
} from '@revime/shared';
import { api, errorMessage } from '../../../../../lib/client/api';
import { useRequireSession } from '../../../../../lib/client/session';
import { useApi } from '../../../../../lib/client/use-api';
import { SuccessMark } from '../../../../../components/app/SuccessMark';
import { IconShieldCheck, IconStar } from '../../../../../components/app/icons';
import { Loader, PageTitle, euroFmt } from '../../../../../components/app/ui';

/**
 * One réparation, as both parties see it (the app's `commande/[id]`): the steps, the money, and
 * the one thing this person can do next. The rules come from @revime/shared (`canAdvance`,
 * `canValidate`, `labelReady`), so the site offers exactly the buttons the app offers.
 * Parcel labels, relay points, cancellation and disputes stay in the app for now.
 */
const DELIVERY_LABEL = { HOME: 'À domicile', WORKSHOP: 'En atelier', PARCEL: 'Par colis' } as const;
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

function Review({ id, onDone }: { id: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError('Choisissez une note de 1 à 5.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/commandes/${id}/review`, { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="ap-box ap-review" onSubmit={send}>
      <h2>Comment s’est passée la réparation ?</h2>
      <div className="ap-rate" role="radiogroup" aria-label="Note">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} sur 5`}
            className={n <= rating ? 'is-on' : undefined}
            onClick={() => setRating(n)}
          >
            <IconStar size={30} />
          </button>
        ))}
      </div>
      <label className="ap-field">
        <span>Un mot pour les prochains clients (facultatif)</span>
        <textarea rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <p className="ap-error" role="alert">{error}</p>}
      <button className="ap-btn ap-btn--primary" disabled={busy}>{busy ? 'Envoi…' : 'Publier mon avis'}</button>
    </form>
  );
}

export default function CommandePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useRequireSession();
  const res = useApi<CommandeDto>(me ? `/commandes/${id}` : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);

  if (!me || res.loading) return <Loader />;
  if (!res.data) {
    return (
      <div className="ap-page ap-narrow">
        <PageTitle title="Réparation" back="/" />
        <p className="ap-error">{res.error ?? 'Réparation introuvable.'}</p>
      </div>
    );
  }
  const c = res.data;
  const role = c.viewerRole;
  const step = (c.step ?? 'PAID') as CommandeStep;
  const steps = stepsFor(c.delivery);
  const at = steps.indexOf(step);
  const next = nextStepFor(step, c.delivery);
  const blocked = c.status === 'REFUNDED' || c.paymentUnderReview || c.disputeOpen;
  const advanceable = !blocked && canAdvance(step, c.delivery, role) && next !== null && labelReady(next, c);
  const validatable = !blocked && canValidate(step, role);
  const back = role === 'REPAIRER' ? '/mes-missions' : `/mes-demandes/${c.demandeId}`;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      res.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  let headline: string;
  if (c.status === 'REFUNDED') headline = 'Remboursée';
  else if (c.disputeOpen) headline = 'Litige en cours : REVIME examine la situation';
  else if (step === 'RELEASED') headline = role === 'REPAIRER' ? 'Terminée : vous avez été payé' : 'Terminée';
  else if (advanceable || validatable) headline = 'À vous de jouer';
  else headline = role === 'REPAIRER' ? 'En attente du client' : `${c.repairerName} s’en occupe`;

  return (
    <div className="ap-page ap-commande">
      <PageTitle title={c.demandeTitle} back={back} sub={`${DELIVERY_LABEL[c.delivery]}${c.paidAt ? ` · payée le ${dateFmt.format(new Date(c.paidAt))}` : ''}`} />

      <div className="ap-commande__grid">
        <div className="ap-stack">
          <section className={`ap-box ap-commande__now${advanceable || validatable ? ' is-you' : ''}`} aria-live="polite">
            {step === 'RELEASED' && c.status === 'PAID' && <SuccessMark />}
            <p className="ap-commande__eyebrow">Où en est la réparation</p>
            <h2>{headline}</h2>

            {advanceable && next && (
              <>
                <p>{next === 'AWAITING_VALIDATION' ? 'La réparation est finie et l’objet rendu ? Demandez au client de valider : vous serez payé à sa validation.' : `Étape suivante : ${STEP_LABEL[next]}.`}</p>
                <button className={role === 'REPAIRER' ? 'ap-btn ap-btn--primary ap-btn--pro ap-btn--lg' : 'ap-btn ap-btn--primary ap-btn--lg'} disabled={busy} onClick={() => void act(() => api.post(`/commandes/${c.id}/steps`, { step: next }))}>
                  {busy ? 'Un instant…' : next === 'AWAITING_VALIDATION' ? 'Demander le déblocage des fonds' : `Marquer « ${STEP_LABEL[next]} »`}
                </button>
              </>
            )}
            {validatable && (
              <>
                <p>
                  Tout fonctionne ? En validant, vous libérez le paiement de {c.repairerName}. Un souci ? Écrivez-lui d’abord, ou
                  signalez un problème depuis l’appli : REVIME intervient.
                </p>
                <div className="ap-row-actions">
                  <button className="ap-btn ap-btn--primary ap-btn--lg" disabled={busy} onClick={() => void act(() => api.post(`/commandes/${c.id}/release`, {}))}>
                    {busy ? 'Validation…' : 'Valider la réparation'}
                  </button>
                  <Link href="/messages" className="ap-btn ap-btn--secondary">Écrire au réparateur</Link>
                </div>
              </>
            )}
            {error && <p className="ap-error" role="alert">{error}</p>}
          </section>

          <section className="ap-box" aria-labelledby="h-steps">
            <h2 id="h-steps">Les étapes</h2>
            <ol className="ap-timeline">
              {steps.map((s, i) => (
                <li key={s} data-state={i < at || step === 'RELEASED' ? 'done' : i === at ? 'now' : 'next'}>
                  <span className="ap-timeline__dot" aria-hidden="true" />
                  <span>{STEP_LABEL[s]}</span>
                </li>
              ))}
            </ol>
            {c.delivery === 'PARCEL' && (
              <p className="ap-hint">Adresses, étiquettes et points relais du colis : dans l’appli REVIME, avec le même compte.</p>
            )}
          </section>

          {role === 'CLIENT' && step === 'RELEASED' && !c.reviewed && !reviewed && <Review id={c.id} onDone={() => setReviewed(true)} />}
          {reviewed && <p className="ap-published">Merci, votre avis est publié.</p>}
        </div>

        <aside className="ap-stack">
          <section className="ap-box ap-sum">
            {role === 'REPAIRER' ? (
              <>
                <div className="ap-sum__row"><span>Prix de la réparation</span><span>{euroFmt(c.repairCents)}</span></div>
                <div className="ap-sum__row ap-sum__row--total"><span>Vous recevez</span><span>{euroFmt(c.payoutCents)}</span></div>
                <p className="ap-hint">Versé sur votre compte quand le client valide la réparation.</p>
              </>
            ) : (
              <>
                <div className="ap-sum__row"><span>Réparation</span><span>{euroFmt(c.repairCents)}</span></div>
                {c.shippingCents > 0 && <div className="ap-sum__row"><span>Livraison</span><span>{euroFmt(c.shippingCents)}</span></div>}
                <div className="ap-sum__row"><span>Protection REVIME</span><span>{euroFmt(c.protectionCents)}</span></div>
                <div className="ap-sum__row ap-sum__row--total"><span>Payé</span><span>{euroFmt(c.totalCents)}</span></div>
              </>
            )}
          </section>
          <section className="ap-box ap-box--dark">
            <IconShieldCheck size={22} />
            <p>
              <strong>Protection REVIME.</strong> L’argent reste bloqué jusqu’à la validation du client. En cas de problème,
              REVIME intervient.
            </p>
          </section>
          <div className="ap-row-actions">
            <Link href="/messages" className="ap-btn ap-btn--secondary ap-btn--block">Messages</Link>
            {role === 'CLIENT' && <Link href={`/mes-demandes/${c.demandeId}`} className="ap-btn ap-btn--secondary ap-btn--block">Voir la demande</Link>}
          </div>
        </aside>
      </div>
    </div>
  );
}
