'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import {
  DELAY_OPTIONS,
  PARTS_OPTIONS,
  WARRANTY_OPTIONS,
  type CreateOfferInput,
  type DemandeDto,
  type MyParticularQuotaResponse,
  type RepairerProfileDto,
} from '@revime/shared';
import { api, ApiError, errorMessage } from '../../../../../lib/client/api';
import { useRequireSession } from '../../../../../lib/client/session';
import { useApi } from '../../../../../lib/client/use-api';
import { CategoryIcon, iconForLabel } from '../../../../../components/app/categories';
import { SuccessMark } from '../../../../../components/app/SuccessMark';
import { IconPin, IconShieldCheck } from '../../../../../components/app/icons';
import { Loader, Stars, ago, euroFmt, initials } from '../../../../../components/app/ui';

/**
 * « Faire une offre », the app's `demande/[id]/offre`: price, delay, warranty, parts, where, parcel,
 * a word. Same `POST /demandes/:id/offers` and same limits; the server refuses what it must
 * (already offered, own demande, particulier cap) and its French message is shown as is.
 * Beside the form, the offer as the client will see it, updated as you type.
 */
type Warranty = (typeof WARRANTY_OPTIONS)[number];
type Parts = (typeof PARTS_OPTIONS)[number];

export default function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useRequireSession();
  const router = useRouter();
  const demande = useApi<DemandeDto>(me ? `/demandes/${id}` : null);
  const mine = useApi<RepairerProfileDto>(me ? `/repairers/${me.id}` : null);
  const quota = useApi<MyParticularQuotaResponse>(me && me.repairer?.kind === 'INDIVIDUAL' ? '/users/me/particular-quota' : null);

  const [price, setPrice] = useState('');
  const [hours, setHours] = useState<number>(48);
  const [warranty, setWarranty] = useState<Warranty>('3 mois');
  const [parts, setParts] = useState<Parts>('Pièce compatible');
  const [travel, setTravel] = useState<'WORKSHOP' | 'HOME'>('WORKSHOP');
  const [parcel, setParcel] = useState(false);
  const [comment, setComment] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!me || demande.loading) return <Loader />;
  if (me.profile.activeMode !== 'REPAIRER') {
    return (
      <div className="ap-page ap-narrow">
        <div className="ap-empty">
          <strong>Passez en mode réparateur pour faire une offre</strong>
          <span>Un seul compte : choisissez « Réparateur » dans le sélecteur de mode.</span>
          <Link href="/parametres" className="ap-btn ap-btn--pro">Changer de mode</Link>
        </div>
      </div>
    );
  }
  if (!demande.data) {
    return (
      <div className="ap-page ap-narrow">
        <Link href="/demandes" className="ap-crumb">‹ Demandes</Link>
        <p className="ap-error">{demande.error ?? 'Demande introuvable.'}</p>
      </div>
    );
  }
  const d = demande.data;
  const needsPostal = !me.repairer?.postalCode;
  const cents = Math.round(Number(price.replace(',', '.')) * 100);
  const priceOk = Number.isFinite(cents) && cents > 0;
  const blocked = quota.data?.offerBlockedMessage ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!priceOk) return setFields({ priceCents: 'Indiquez votre prix.' });
    setBusy(true);
    setFields({});
    setError(null);
    try {
      if (needsPostal) await api.patch('/users/me/repairer', { postalCode: postalCode.trim() });
      const input: CreateOfferInput = {
        priceCents: cents,
        delayHours: hours,
        warrantyLabel: warranty,
        partsLabel: parts,
        travel,
        acceptsParcel: parcel,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      };
      await api.post(`/demandes/${id}/offers`, input);
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="ap-page ap-narrow">
        <div className="ap-published">
          <SuccessMark />
          <h1>Offre envoyée</h1>
          <p>Le client la voit tout de suite, à côté des autres. Vous êtes prévenu dès qu’il choisit.</p>
          <div className="ap-row-actions">
            <Link href="/mes-propositions" className="ap-btn ap-btn--pro">Mes propositions</Link>
            <button className="ap-btn ap-btn--secondary" onClick={() => router.push('/demandes')}>Voir d’autres demandes</button>
          </div>
        </div>
      </div>
    );
  }

  const name = me.repairer?.displayName ?? me.username;
  return (
    <div className="ap-page ap-offerform">
      <Link href="/demandes" className="ap-crumb">‹ Demandes près de chez moi</Link>
      <header className="ap-pay__head">
        <h1>Faire une offre</h1>
        <p className="ap-muted">Le client compare les offres sur le prix, le délai, la garantie et votre note. Soyez clair et précis.</p>
      </header>

      <div className="ap-pay__grid">
        <form className="ap-stack" onSubmit={submit} noValidate>
          <section className="ap-box ap-offerform__demande">
            <span className="ap-offerform__ic" aria-hidden="true">
              <CategoryIcon path={iconForLabel(d.category.labelFr)} size={26} />
            </span>
            <div>
              <p className="ap-tile__cat">{d.category.labelFr}</p>
              <strong>{d.title}</strong>
              <p className="ap-tile__meta">
                <IconPin size={14} /> {d.locationLabel} · publiée {ago(d.createdAt)}
              </p>
              <p>{d.description}</p>
              {d.mode === 'BUDGET' && d.budgetCents ? <p className="ap-sheet__budget">Budget du client : {euroFmt(d.budgetCents)}</p> : null}
            </div>
          </section>

          {blocked && <p className="ap-note">{blocked}</p>}

          <section className="ap-box ap-form">
            <label className="ap-field">
              <span>Votre prix, pièces et main-d’œuvre comprises</span>
              <span className="ap-money">
                <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0" aria-invalid={fields.priceCents ? true : undefined} />
                <b>€</b>
              </span>
              {fields.priceCents && <em className="ap-field__error">{fields.priceCents}</em>}
            </label>

            <fieldset className="ap-chips">
              <legend>Délai de réparation</legend>
              {DELAY_OPTIONS.map((o) => (
                <button key={o.hours} type="button" aria-pressed={hours === o.hours} onClick={() => setHours(o.hours)}>{o.label}</button>
              ))}
            </fieldset>
            <fieldset className="ap-chips">
              <legend>Garantie</legend>
              {WARRANTY_OPTIONS.map((w) => (
                <button key={w} type="button" aria-pressed={warranty === w} onClick={() => setWarranty(w)}>{w}</button>
              ))}
            </fieldset>
            <fieldset className="ap-chips">
              <legend>Pièces</legend>
              {PARTS_OPTIONS.map((p) => (
                <button key={p} type="button" aria-pressed={parts === p} onClick={() => setParts(p)}>{p}</button>
              ))}
            </fieldset>
            <fieldset className="ap-chips">
              <legend>Où se fait la réparation</legend>
              <button type="button" aria-pressed={travel === 'WORKSHOP'} onClick={() => setTravel('WORKSHOP')}>Dans mon atelier</button>
              <button type="button" aria-pressed={travel === 'HOME'} onClick={() => setTravel('HOME')}>Je me déplace</button>
              <button type="button" aria-pressed={parcel} onClick={() => setParcel((v) => !v)}>J’accepte l’envoi par colis</button>
            </fieldset>
            {parcel && <p className="ap-hint">Le client renseigne le poids et les dimensions au paiement.</p>}
            {needsPostal && (
              <label className="ap-field">
                <span>Votre code postal</span>
                <small className="ap-field__hint">Pour calculer la distance avec le client. Demandé une seule fois.</small>
                <input inputMode="numeric" maxLength={5} value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))} placeholder="ex. 69003" />
                {fields.postalCode && <em className="ap-field__error">{fields.postalCode}</em>}
              </label>
            )}
            <label className="ap-field">
              <span>Un mot pour le client (facultatif)</span>
              <textarea rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ce que vous allez faire, ce qui est compris, vos disponibilités…" />
              {fields.comment && <em className="ap-field__error">{fields.comment}</em>}
            </label>
          </section>
          {error && <p className="ap-error" role="alert">{error}</p>}
          <button className="ap-btn ap-btn--pro ap-btn--lg ap-btn--block" disabled={busy || Boolean(blocked) || (needsPostal && postalCode.length !== 5)}>
            {busy ? 'Envoi…' : priceOk ? `Envoyer mon offre à ${euroFmt(cents)}` : 'Envoyer mon offre'}
          </button>
        </form>

        <aside className="ap-pay__aside ap-stack">
          <p className="ap-dash__h">Ce que verra le client</p>
          <div className="ap-offer ap-offer--preview" aria-live="polite">
            <span className="ap-offer__head">
              <span className="ap-avatar ap-avatar--lg" aria-hidden="true">{initials(name)}</span>
              <span className="ap-offer__who">
                <strong>{name}</strong>
                <Stars rating={mine.data?.rating ?? null} count={mine.data?.reviewCount ?? 0} />
              </span>
              <span className="ap-offer__price" key={cents}>{priceOk ? euroFmt(cents) : '— €'}</span>
            </span>
            <span className="ap-offer__facts">
              <span><small>Délai</small>{DELAY_OPTIONS.find((o) => o.hours === hours)?.label}</span>
              <span><small>Garantie</small>{warranty}</span>
              <span><small>Pièces</small>{parts}</span>
            </span>
            <span className="ap-offer__where">{travel === 'HOME' ? 'Chez le client' : 'En atelier'}{parcel ? ' ou par colis' : ''}</span>
            {comment.trim() && <span className="ap-offer__comment">« {comment.trim()} »</span>}
          </div>
          <section className="ap-box ap-box--dark">
            <IconShieldCheck size={22} />
            <p>
              <strong>Payé à coup sûr.</strong> Le client paie avant que vous commenciez ; l’argent vous est versé quand il valide la
              réparation.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
