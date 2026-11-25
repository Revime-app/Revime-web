'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, use, useMemo, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import {
  computeAmounts,
  DELIVERY_OPTIONS,
  LEGAL_WITHDRAWAL_WAIVER_TEXT,
  VERIFIED_BADGE_LABEL,
  type CheckoutSessionResponse,
  type CreateCheckoutInput,
  type DeliveryMode,
  type ExecutionDelayPreference,
  type OfferDto,
} from '@revime/shared';
import { api, errorMessage } from '../../../../../../lib/client/api';
import { DEMO } from '../../../../../../lib/client/config';
import { useRequireSession } from '../../../../../../lib/client/session';
import { useApi } from '../../../../../../lib/client/use-api';
import { IconShieldCheck } from '../../../../../../components/app/icons';
import { Loader, Stars, euroFmt, initials } from '../../../../../../components/app/ui';

/**
 * Web payment. The same steps as the app's « Paiement sécurisé » screen (apps/mobile, never
 * changed): delivery, the escrow promise, the breakdown from `computeAmounts` (the very function
 * the server charges with), the right of withdrawal for a professional, then the card.
 *
 * The Stripe key is not in the site: the API returns it with each checkout, like the app reads it.
 * The PaymentIntent is card-only, so Stripe's Payment Element shows the card form and runs
 * 3D Secure itself; it leaves the page only if the bank insists, and comes back to /paiement/recu.
 */

const stripeCache = new Map<string, Promise<Stripe | null>>();
const stripeFor = (key: string) => {
  if (!stripeCache.has(key)) stripeCache.set(key, loadStripe(key));
  return stripeCache.get(key)!;
};

const TEST_CARDS = [
  ['Paiement accepté', '4242 4242 4242 4242'],
  ['3D Secure', '4000 0027 6000 3184'],
  ['Paiement refusé', '4000 0000 0000 0002'],
] as const;

function Row({ label, value, strong }: { label: React.ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'ap-sum__row ap-sum__row--total' : 'ap-sum__row'}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function TestNotice() {
  return (
    <div className="ap-testnotice" role="note">
      <strong>Mode test</strong>
      <p>Aucun débit réel. N’utilisez pas votre vraie carte : elle serait refusée. Utilisez une carte de test (date future, n’importe quel code).</p>
      <ul>
        {TEST_CARDS.map(([l, n]) => (
          <li key={n}>
            {l} : <code>{n}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The card step: Stripe's own form, then « Payer ». */
function CardForm({ total, onPaid, demandeId, commandeId }: { total: number; onPaid: () => void; demandeId: string; commandeId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: err } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/mes-demandes/${demandeId}/paiement/recu?c=${commandeId}`,
      },
    });
    if (err) {
      setError(err.message ?? 'Le paiement a échoué. Réessayez.');
      setBusy(false);
      return;
    }
    onPaid();
  }

  return (
    <form onSubmit={submit} className="ap-stack">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <p className="ap-error" role="alert">{error}</p>}
      <button className="ap-btn ap-btn--primary ap-btn--block ap-btn--lg" disabled={!stripe || busy}>
        {busy ? 'Paiement en cours…' : `Payer ${euroFmt(total)} en toute sécurité`}
      </button>
    </form>
  );
}

function Withdrawal({
  isPro,
  pref,
  setPref,
  accepted,
  setAccepted,
}: {
  isPro: boolean;
  pref: ExecutionDelayPreference;
  setPref: (p: ExecutionDelayPreference) => void;
  accepted: boolean;
  setAccepted: (v: boolean) => void;
}) {
  if (!isPro) {
    return (
      <p className="ap-note">
        <strong>Réparateur particulier :</strong> le droit de rétractation ne s’applique pas. Votre paiement reste protégé
        par REVIME jusqu’à votre validation. <Link href="/cgu">En savoir plus</Link>
      </p>
    );
  }
  return (
    <section className="ap-box">
      <h2>Démarrage de la réparation</h2>
      {pref === 'WAIT_14_DAYS' ? (
        <>
          <p>
            <strong>Délai de rétractation de 14 jours choisi.</strong> La réparation débutera à la fin du délai légal de
            rétractation de 14 jours. Votre paiement reste protégé par REVIME jusqu’à la fin de la prestation.
          </p>
          <button type="button" className="ap-link" onClick={() => setPref('IMMEDIATE')}>
            Revenir au démarrage immédiat
          </button>
        </>
      ) : (
        <>
          <label className="ap-check">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>{LEGAL_WITHDRAWAL_WAIVER_TEXT}</span>
          </label>
          <button type="button" className="ap-link ap-link--muted" onClick={() => setPref('WAIT_14_DAYS')}>
            Je préfère attendre 14 jours avant le début de la réparation
          </button>
        </>
      )}
      <p className="ap-hint">
        Vous êtes face à un professionnel : vous avez 14 jours pour vous rétracter.{' '}
        <Link href="/cgu">Droit de rétractation et formulaire</Link>
      </p>
    </section>
  );
}

function Payment({ id, offerId }: { id: string; offerId: string | null }) {
  const me = useRequireSession();
  const router = useRouter();
  const offers = useApi<OfferDto[]>(me ? `/demandes/${id}/offers` : null);
  const offer = useMemo(() => (offers.data ?? []).find((o) => o.id === offerId) ?? null, [offers.data, offerId]);

  const [delivery, setDelivery] = useState<DeliveryMode | null>(null);
  const chosen: DeliveryMode = delivery ?? (offer?.travel === 'HOME' ? 'HOME' : 'WORKSHOP');
  const [pref, setPref] = useState<ExecutionDelayPreference>('IMMEDIATE');
  const [accepted, setAccepted] = useState(false);
  const [session, setSession] = useState<CheckoutSessionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me || offers.loading) return <Loader />;
  const back = `/mes-demandes/${id}`;
  if (!offer || offer.status !== 'SENT') {
    return (
      <div className="ap-page ap-narrow">
        <Link href={back} className="ap-crumb">‹ Retour aux offres</Link>
        <div className="ap-empty">
          <strong>Cette offre n’est plus disponible</strong>
          <span>Retournez aux offres reçues pour en choisir une autre.</span>
          <Link href={back} className="ap-btn ap-btn--secondary">Retour aux offres</Link>
        </div>
      </div>
    );
  }

  const isPro = offer.verifiedBadge === 'BUSINESS';
  // The app quotes a parcel live with Boxtal when the server says so; that step stays in the app
  // for now, so the site offers the parcel only under the flat fee.
  const quoting = Boolean(me.shippingQuotesEnabled);
  const options = DELIVERY_OPTIONS.filter((o) => o.id !== 'PARCEL' || (offer.acceptsParcel && !quoting));
  const amounts = computeAmounts(offer.priceCents, chosen);
  const gated = isPro && pref === 'IMMEDIATE' && !accepted;
  const testMode = session?.isTestMode ?? me.stripeTestMode ?? false;
  const locked = session !== null;
  const done = (commandeId: string) => router.replace(`/mes-demandes/${id}/paiement/recu?c=${commandeId}`);

  async function start() {
    if (gated) return;
    setBusy(true);
    setError(null);
    const input: CreateCheckoutInput = {
      delivery: chosen,
      delayPreference: pref,
      withdrawalWaiver:
        isPro && pref === 'IMMEDIATE'
          ? { accepted: true, acceptedAt: new Date().toISOString(), acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT }
          : null,
    };
    try {
      setSession(await api.post<CheckoutSessionResponse>(`/offers/${offer!.id}/checkout`, input));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-page ap-pay">
      <Link href={back} className="ap-crumb">‹ Retour aux offres</Link>
      <header className="ap-pay__head">
        <h1>Paiement sécurisé</h1>
        <p className="ap-muted">Réglez en toute confiance : le réparateur n’est payé qu’après votre validation.</p>
      </header>

      <div className="ap-pay__grid">
        <div className="ap-stack">
          <section className="ap-box ap-payrep">
            <span className="ap-avatar ap-avatar--lg" aria-hidden="true">{initials(offer.repairerName)}</span>
            <div>
              <strong>{offer.repairerName}</strong>
              <Stars rating={offer.rating} count={offer.reviewCount} />
              {offer.verifiedBadge && (
                <span className="ap-verified">
                  <IconShieldCheck size={13} /> {VERIFIED_BADGE_LABEL[offer.verifiedBadge]}
                </span>
              )}
            </div>
            <span className="ap-payrep__price">{euroFmt(offer.priceCents)}</span>
          </section>

          <fieldset className="ap-box ap-choices" disabled={locked}>
            <legend>
              <h2>Livraison</h2>
            </legend>
            {options.map((o) => (
              <label key={o.id} className="ap-choice" data-active={o.id === chosen || undefined}>
                <input type="radio" name="delivery" checked={o.id === chosen} onChange={() => setDelivery(o.id)} />
                <span>
                  <strong>{o.label}</strong>
                  <small>{o.sub}</small>
                </span>
                <b>{o.feeCents > 0 ? `+${euroFmt(o.feeCents)}` : 'Gratuit'}</b>
              </label>
            ))}
            {offer.acceptsParcel && quoting && (
              <p className="ap-hint">L’envoi par colis, avec son prix calculé selon l’objet, se choisit dans l’appli REVIME.</p>
            )}
          </fieldset>

          <fieldset className="ap-fieldset-plain" disabled={locked}>
            <Withdrawal isPro={isPro} pref={pref} setPref={setPref} accepted={accepted} setAccepted={setAccepted} />
          </fieldset>
        </div>

        <aside className="ap-stack ap-pay__aside">
          <section className="ap-box ap-box--dark">
            <IconShieldCheck size={22} />
            <p>
              <strong>Votre argent est protégé.</strong> Le réparateur n’est payé qu’une fois que vous avez validé la
              réparation. En cas de problème, REVIME intervient.{' '}
              <Link href="/protection-revime">Comment ça marche</Link>
            </p>
          </section>

          <section className="ap-box ap-sum">
            <Row label="Réparation" value={euroFmt(amounts.repairCents)} />
            <Row label="Livraison" value={amounts.shippingCents > 0 ? euroFmt(amounts.shippingCents) : 'Gratuit'} />
            <Row label={<Link href="/protection-revime">Protection REVIME</Link>} value={euroFmt(amounts.protectionCents)} />
            <Row label="Total" value={euroFmt(amounts.totalCents)} strong />
          </section>

          {testMode && <TestNotice />}

          {!session && (
            <div className="ap-stack">
              {error && <p className="ap-error" role="alert">{error}</p>}
              <button className="ap-btn ap-btn--primary ap-btn--block ap-btn--lg" disabled={gated || busy} onClick={() => void start()}>
                {busy ? 'Préparation…' : `Continuer vers le paiement`}
              </button>
              <p className="ap-hint ap-center-text">
                {gated ? 'Cochez la case ou choisissez d’attendre 14 jours pour continuer.' : 'Carte bancaire. Paiement chiffré par Stripe.'}
              </p>
            </div>
          )}

          {session && DEMO && (
            <div className="ap-stack">
              <div className="ap-cardstub">Ici s’affiche le formulaire de carte sécurisé de Stripe.</div>
              <button className="ap-btn ap-btn--primary ap-btn--block ap-btn--lg" onClick={() => done(session.commandeId)}>
                Payer {euroFmt(amounts.totalCents)} en toute sécurité
              </button>
            </div>
          )}

          {session && !DEMO && session.publishableKey && (
            <Elements
              stripe={stripeFor(session.publishableKey)}
              options={{
                clientSecret: session.paymentIntentClientSecret,
                locale: 'fr',
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#f61b39',
                    colorText: '#010524',
                    colorDanger: '#f61b39',
                    borderRadius: '12px',
                    fontFamily: '"Google Sans Flex", system-ui, sans-serif',
                  },
                },
              }}
            >
              <CardForm total={amounts.totalCents} demandeId={id} commandeId={session.commandeId} onPaid={() => done(session.commandeId)} />
            </Elements>
          )}
          {session && !DEMO && !session.publishableKey && (
            <p className="ap-error">Configuration de paiement incomplète. Contactez le support REVIME.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function WithParams({ id }: { id: string }) {
  const offerId = useSearchParams().get('offre');
  return <Payment id={id} offerId={offerId} />;
}

export default function PaiementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Loader />}>
      <WithParams id={id} />
    </Suspense>
  );
}
