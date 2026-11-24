'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  normaliseOrderSearch,
  COMMANDE_STATUS_LABEL,
  STEP_LABEL,
  type RefundBreakdown,
} from '@revime/shared';
import { RefundForm, type RefundFormSubmitBody } from '../../components/RefundForm';
import {
  resolveRefundCommandeId,
  isOrderRefundable,
  getUnrefundableReason,
} from '../../lib/refund-form';
import { formatEuros } from '../../lib/money';
import { createLatestGuard } from '../../lib/list-query';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import { CopyableReference } from '../../components/CopyableReference';

export type RemboursementSummary = {
  commandeId: string;
  demandeTitle: string;
  clientName: string;
  repairerName: string;
  clientCity: string | null;
  repairerCity: string | null;
  delivery: string;
  status: string;
  step: string | null;
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
  insuranceCents: number;
  totalCents: number;
  transferred: boolean;
  refunded: boolean;
  disputed: boolean;
  suggestion: { repairCents: number; shippingCents: number; protectionCents: number };
  refund: RefundBreakdown | null;
  shareOwedCents: number;
  cancellationPending: boolean;
  hasStripeCharge?: boolean;
};

type Summary = RemboursementSummary;

const DELIVERY_LABEL: Record<string, string> = {
  HOME: 'À domicile',
  WORKSHOP: 'Atelier',
  PARCEL: 'Colis',
};

function RemboursementContent() {
  const searchParams = useSearchParams();
  const [commandeId, setCommandeId] = useState(resolveRefundCommandeId(searchParams));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payShareBusy, setPayShareBusy] = useState(false);
  // CF4-40: display only - the API answers 403 to a role without the permission.
  const adminMe = useAdminMe();
  const canRefund = hasPermission(adminMe, 'refunds.issue');
  const [payShareError, setPayShareError] = useState<string | null>(null);
  // Same-tick double-click guard as `RefundForm.handleConfirm` (Fix round 1):
  // `payShareBusy` is React state and only takes effect on the next render, so
  // two clicks within one event-loop turn would both read `false` and both POST
  // to `/refund/pay-share` - a real money-moving endpoint. The ref is mutated
  // synchronously, closing that window.
  const payShareInFlightRef = useRef(false);

  // CF4-F Task 7, Fix round 1 (review Critical finding): the `?commande=`
  // effect (added for the CF4-19 drawer link) and the manual search form both
  // used to call their own separate, unguarded fetch. A slower earlier fetch
  // resolving after a newer one could overwrite `summary` with another order's
  // data while the visible id already showed a different commande - and the
  // refund/pay-share POSTs and the refetch after them read `summary.commandeId`,
  // so a stale write here is a wrong-order money-moving POST, not just a stale
  // read. Same fix as `/colis`'s `runSearch` (Task 6, Fix round 1): one
  // `createLatestGuard`-wrapped function, used by both call sites, gates every
  // setSummary/setError/setBusy/setSuccess so only the latest request's result
  // is ever applied.
  const searchGuardRef = useRef(createLatestGuard());

  const runSearch = useCallback(async (id: string, onSuccessMessage?: string) => {
    const requestNumber = searchGuardRef.current.next();
    setBusy(true);
    setError(null);
    setSummary(null);
    // Clear the previous refund's confirmation. It now renders outside the summary
    // block, so without this it would sit above a DIFFERENT commande's details and
    // its « Rembourser » button, reading as if that one had already been refunded.
    setSuccess(null);
    setPayShareError(null);

    try {
      const targetId = normaliseOrderSearch(id) || id.trim();
      const response = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(targetId)}`);
      const data = await response.json();
      if (!searchGuardRef.current.isLatest(requestNumber)) return;

      if (!response.ok) {
        setError(data.error?.message || 'Commande introuvable.');
        return;
      }
      setSummary(data);
      // `onSuccessMessage` is set only by a post-action refetch (refund submit,
      // pay-share) that wants its confirmation message to survive the guard's
      // own `setSuccess(null)` above - but only if THIS request is still the
      // latest, i.e. no newer search superseded it in the meantime. Setting it
      // here (inside the same guarded branch as `setSummary`) instead of after
      // `runSearch` returns keeps that check in one place.
      if (onSuccessMessage) setSuccess(onSuccessMessage);
    } catch (err) {
      if (!searchGuardRef.current.isLatest(requestNumber)) return;
      setError('Une erreur est survenue.');
    } finally {
      if (searchGuardRef.current.isLatest(requestNumber)) setBusy(false);
    }
  }, []);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(commandeId);
  }

  // CF4-19 (task 7 brief): the refunds list drawer's « Ouvrir le remboursement »
  // link sets `?commande=` and expects this page to load that order without the
  // operator re-typing the id and clicking Rechercher - the same pre-search
  // `/colis` already does for its own `?commande=` param. Re-runs whenever the
  // URL param changes, not just on first mount, so a second link click while
  // this page is already open still loads the new order. Goes through the same
  // guarded `runSearch` as the manual form (Fix round 1) so this effect and a
  // concurrent manual search can never let a stale response win.
  useEffect(() => {
    const fromUrl = resolveRefundCommandeId(searchParams);
    if (fromUrl) {
      setCommandeId(fromUrl);
      void runSearch(fromUrl);
    }
  }, [searchParams.get('commande'), searchParams.get('id')]);

  async function onRefundSubmit(body: RefundFormSubmitBody) {
    if (!summary) return;

    // Use the loaded summary's commandeId, not the input field state. The input
    // can be edited after a search, so using its value would let the operator
    // refund a commande they are not looking at. Belt and braces: the onChange
    // handler clears the summary, and this fetch reads the row on screen.
    const targetId = summary.commandeId;
    const response = await fetch(`/api/proxy/admin/commandes/${targetId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Une erreur est survenue.');
    }

    // Re-fetch rather than reset: the breakdown and, when a share is owed, the
    // « Verser la part du réparateur » button live off the fresh summary, and the
    // operator stays on the same commande instead of losing their place. Goes
    // through the guarded `runSearch` (Fix round 1) rather than a bare fetch, so
    // a concurrent manual search racing this refetch cannot leave `summary` on
    // the wrong commande - and the confirmation message below is only applied by
    // `runSearch` itself if this refetch is still the latest request, so it can
    // never float above a different, newer order's data.
    //
    // Not "effectué": Stripe can report a refund `pending` when the platform
    // balance is short and settle it later, and the route answers 200 for that
    // too. "Enregistré auprès de Stripe" is true of both outcomes.
    await runSearch(targetId, 'Remboursement enregistré auprès de Stripe.');
  }

  async function onPayShare() {
    if (!summary || payShareInFlightRef.current) return;
    payShareInFlightRef.current = true;
    const targetId = summary.commandeId;
    setPayShareBusy(true);
    setPayShareError(null);
    try {
      const response = await fetch(`/api/proxy/admin/commandes/${targetId}/refund/pay-share`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        setPayShareError(data.error?.message || 'Une erreur est survenue.');
        return;
      }
      // Guarded refetch (Fix round 1): same reasoning as the post-refund
      // refetch above - use `runSearch` so a concurrent search cannot leave the
      // page showing a different commande than the one just paid.
      await runSearch(targetId);
    } catch (err) {
      setPayShareError('Une erreur est survenue.');
    } finally {
      payShareInFlightRef.current = false;
      setPayShareBusy(false);
    }
  }

  return (
    <div className="page page--wide">
      <h1>Remboursement</h1>
      <p>Recherchez une commande par son identifiant, vérifiez les détails, puis procédez au remboursement.</p>

      <div
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: 'var(--r-card, 8px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          padding: '24px',
          margin: '20px 0',
          maxWidth: '720px',
        }}
      >
        <form
          onSubmit={onSearch}
          style={{ display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 320px' }}>
            <label
              htmlFor="commandeId"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--ink, #141414)',
                marginBottom: '6px',
              }}
            >
              Identifiant de commande
            </label>
            <input
              id="commandeId"
              type="text"
              placeholder="ex: CMD-2C53DE51 ou UUID"
              value={commandeId}
              onChange={(e) => {
                setCommandeId(e.target.value);
                setSummary(null);
                setError(null);
                setSuccess(null);
                setPayShareError(null);
              }}
              required
              disabled={busy}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: 'var(--r-field, 4px)',
              border: 'none',
              backgroundColor: busy ? 'var(--faint)' : 'var(--navy, #25324f)',
              color: '#ffffff',
              cursor: busy ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            {busy ? 'Recherche...' : 'Rechercher'}
          </button>
        </form>
      </div>

      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
      {/* OUTSIDE the `summary &&` block, deliberately: the handler sets this and
          nulls the summary in the same render, so inside that block the message can
          never be seen. After an irreversible money movement the operator was left
          looking at a silently reset form, which invites the retry. */}
      {success && <p role="status" style={{ color: 'green' }}>{success}</p>}

      {summary && (
        <RemboursementOrderDetails
          summary={summary}
          canRefund={canRefund}
          onRefundSubmit={onRefundSubmit}
          onPayShare={onPayShare}
          payShareBusy={payShareBusy}
          payShareError={payShareError}
        />
      )}
    </div>
  );
}

export interface RemboursementOrderDetailsProps {
  summary: RemboursementSummary;
  canRefund: boolean;
  onRefundSubmit: (body: RefundFormSubmitBody) => Promise<void>;
  onPayShare: () => Promise<void>;
  payShareBusy: boolean;
  payShareError: string | null;
}

export function RemboursementOrderDetails({
  summary,
  canRefund,
  onRefundSubmit,
  onPayShare,
  payShareBusy,
  payShareError,
}: RemboursementOrderDetailsProps) {
  const isPaid = isOrderRefundable(summary.status);
  return (
    <div
      style={{
        marginTop: '24px',
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        padding: '24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--ink, #141414)' }}>
          Détails de la commande
        </h2>
        <CopyableReference
          value={summary.commandeId}
          prefix="CMD"
          href={`/paiements?commande=${summary.commandeId}`}
        />
      </div>

      {summary.cancellationPending && (
        <p
          role="alert"
          style={{
            margin: '0 0 1rem 0',
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--badge-warning-bg)',
            color: 'var(--badge-warning-text)',
            border: '1px solid var(--badge-warning-border)',
            borderRadius: 'var(--r-field, 4px)',
            fontSize: '13px',
          }}
        >
          Une demande d&apos;annulation est en attente sur cette commande. Un remboursement ici
          la clôturera comme acceptée.
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '16px',
          padding: '16px',
          backgroundColor: 'var(--badge-neutral-bg)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: 'var(--r-card, 6px)',
          marginBottom: '24px',
        }}
      >
        <dl style={{ margin: 0, display: 'contents' }}>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Demande</dt>
            <dd style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)' }}>{summary.demandeTitle}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Client</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{summary.clientName}{summary.clientCity ? ` (${summary.clientCity})` : ''}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Réparateur</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{summary.repairerName}{summary.repairerCity ? ` (${summary.repairerCity})` : ''}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Livraison</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{DELIVERY_LABEL[summary.delivery] ?? summary.delivery}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Statut</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{(COMMANDE_STATUS_LABEL as Record<string, string>)[summary.status] ?? summary.status}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Étape</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{summary.step ? ((STEP_LABEL as Record<string, string>)[summary.step] ?? summary.step) : 'N/A'}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Réparation</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{formatEuros(summary.repairCents)}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Expédition</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{formatEuros(summary.shippingCents)}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Commission</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{formatEuros(summary.protectionCents)}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Total</dt>
            <dd style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink, #141414)' }}><strong>{formatEuros(summary.totalCents)}</strong></dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Virement effectué</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{summary.transferred ? 'Oui' : 'Non'}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Tentative de remboursement</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{summary.refunded ? 'Oui' : 'Non'}</dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Contestation en cours</dt>
            <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{summary.disputed ? 'Oui' : 'Non'}</dd>
          </div>
        </dl>
      </div>

      {summary.refund && (
        <div
          style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: 'var(--badge-neutral-bg)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 6px)',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--ink, #141414)' }}>
            Remboursement effectué
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <dl style={{ margin: 0, display: 'contents' }}>
              <div>
                <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Réparation remboursée</dt>
                <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{formatEuros(summary.refund.repairCents)}</dd>
              </div>
              <div>
                <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Livraison et assurance remboursées</dt>
                <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{formatEuros(summary.refund.shippingCents)}</dd>
              </div>
              <div>
                <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Commission remboursée</dt>
                <dd style={{ margin: 0, fontSize: '14px', color: 'var(--ink, #141414)' }}>{formatEuros(summary.refund.protectionCents)}</dd>
              </div>
              <div>
                <dt style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted, #6b7280)', fontWeight: 600, marginBottom: '2px' }}>Total remboursé</dt>
                <dd style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--ink, #141414)' }}><strong>{formatEuros(summary.refund.totalCents)}</strong></dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {canRefund && summary.shareOwedCents > 0 && (
        <div style={{ marginTop: '1rem' }}>
          {payShareError && <p role="alert" style={{ color: 'red' }}>{payShareError}</p>}
          <button type="button" onClick={onPayShare} disabled={payShareBusy}>
            {payShareBusy
              ? 'Versement...'
              : `Verser la part du réparateur (${formatEuros(summary.shareOwedCents)})`}
          </button>
        </div>
      )}

      {!isPaid && !summary.refund && (
        <div
          role="alert"
          style={{
            marginTop: '1rem',
            padding: '0.875rem 1rem',
            backgroundColor: 'var(--badge-warning-bg)',
            border: '1px solid var(--badge-warning-border)',
            borderRadius: '4px',
            color: 'var(--badge-warning-text)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            Remboursement impossible
          </div>
          <div style={{ fontSize: '13px' }}>
            {getUnrefundableReason(summary.status)}
          </div>
        </div>
      )}

      {isPaid && summary.hasStripeCharge === false && !summary.refund && (
        <div
          role="alert"
          style={{
            marginTop: '1rem',
            padding: '0.875rem 1rem',
            backgroundColor: 'var(--badge-warning-bg)',
            border: '1px solid var(--badge-warning-border)',
            borderRadius: '4px',
            color: 'var(--badge-warning-text)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            Remboursement impossible
          </div>
          <div style={{ fontSize: '13px' }}>
            Cette commande ne dispose pas de charge Stripe à rembourser. Vérifiez la transaction dans Stripe ou annulez la commande.
          </div>
        </div>
      )}

      {canRefund && isPaid && summary.hasStripeCharge !== false && !summary.refund && (
        <div style={{ marginTop: '1rem' }}>
          <RefundForm
            mode="commande"
            summary={{
              order: {
                repairCents: summary.repairCents,
                shippingCents: summary.shippingCents,
                insuranceCents: summary.insuranceCents,
                protectionCents: summary.protectionCents,
                transferred: summary.transferred,
              },
              suggestion: summary.suggestion,
            }}
            onSubmit={onRefundSubmit}
            commandeId={summary.commandeId}
            clientName={summary.clientName}
            repairerName={summary.repairerName}
          />
        </div>
      )}
    </div>
  );
}

export default function RemboursementPage() {
  return (
    <Suspense fallback={<div className="page page--wide"><p>Chargement...</p></div>}>
      <RemboursementContent />
    </Suspense>
  );
}
