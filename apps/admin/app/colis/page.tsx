'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { normaliseOrderSearch } from '@revime/shared';
import { ShipmentsList } from './ShipmentsList';
import { createLatestGuard } from '../../lib/list-query';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import { formatEuros } from '../../lib/money';
import {
  commandeStatusLabel,
  commandeStepLabel,
  deliveryModeLabel,
  shipmentLegLabel,
  shipmentStatusLabel,
} from '../../lib/status-labels';

type Summary = {
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
  totalCents: number;
  transferred: boolean;
  /** Livraison Boxtal: the transport insurance line, 0 when the client declined it. */
  insuranceCents: number;
  /** Livraison Boxtal: empty for local orders and for manual-driver parcels. */
  shipments: {
    leg: 'OUTBOUND' | 'RETURN';
    status: string;
    carrierLabel: string;
    quotedCostExclTaxCents: number;
    billedExclTaxCents: number | null;
    boxtalOrderId: string | null;
    labelReady: boolean;
    failureReason: string | null;
  }[];
};

function ColisContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [commandeId, setCommandeId] = useState(searchParams.get('commande') ?? '');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [outboundTrackingNumber, setOutboundTrackingNumber] = useState('');
  const [returnTrackingNumber, setReturnTrackingNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // CF4-40: display only - the API answers 403 to a role without the permission.
  const adminMe = useAdminMe();
  const canShip = hasPermission(adminMe, 'shipping.operate');
  // CF4-F Task 6, Fix round 1 (review Important finding): the `?commande=`
  // effect and the manual search form both call `runSearch`, and a slower
  // earlier fetch resolving after a newer one must not overwrite `summary` with
  // another order's data while the input/URL already show a different id -
  // the operator saves tracking numbers and retries Boxtal off `summary`, so a
  // stale one is a wrong-order write, not just a stale read. A monotonically
  // increasing request number (not AbortController): both response branches
  // below already parse the JSON body on success and on error, so the guard
  // just gates which parsed result is allowed to call setSummary/setError/
  // setBusy, without adding a second AbortError code path to the same fetch.
  const searchGuardRef = useRef(createLatestGuard());

  const runSearch = useCallback(async (id: string) => {
    const requestNumber = searchGuardRef.current.next();
    setBusy(true);
    setError(null);
    setSummary(null);
    // Clear the previous save's confirmation. It now renders outside the summary
    // block, so without this it would sit above a DIFFERENT commande's details and
    // read as if that one's labels had already been saved.
    setSuccess(null);

    try {
      const targetId = normaliseOrderSearch(id) || id.trim();
      const response = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(targetId)}`);

      if (!response.ok) {
        const data = await response.json();
        if (!searchGuardRef.current.isLatest(requestNumber)) return;
        setError(data.error?.message || "Commande introuvable.");
        setBusy(false);
        return;
      }

      const data = await response.json();
      if (!searchGuardRef.current.isLatest(requestNumber)) return;
      setSummary(data);
    } catch (err) {
      if (!searchGuardRef.current.isLatest(requestNumber)) return;
      setError("Une erreur est survenue.");
    } finally {
      if (searchGuardRef.current.isLatest(requestNumber)) setBusy(false);
    }
  }, []);

  // CF4-F Task 6 (controller notes): the shipments list's « Ouvrir » action sets
  // `?commande=` and this page must load that order's per-order tools without the
  // operator re-typing the id, the same way /remboursement reads its own
  // `commande` search param. Re-runs whenever the URL param changes (a second
  // « Ouvrir » click on a different row while this page is already open), not
  // just on first mount.
  useEffect(() => {
    const fromUrl = searchParams.get('commande');
    if (fromUrl) {
      setCommandeId(fromUrl);
      void runSearch(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('commande')]);

  function onOpenFromList(id: string) {
    // router.push (not a Link): the id comes from a table row's click handler, not
    // a static href, and pushing keeps this the same page instance so `summary`
    // state below updates in place instead of a full navigation/remount.
    router.push(`/colis?commande=${encodeURIComponent(id)}`);
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(commandeId);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary) return;

    if (outboundTrackingNumber.trim() === returnTrackingNumber.trim()) {
      setError("Les numéros de suivi aller et retour doivent être différents.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      // Use the loaded summary's commandeId, not the input field state. The input
      // can be edited after a search, so using its value would let the operator
      // write tracking numbers to a commande they are not looking at. Belt and
      // braces: the onChange handler clears the summary, and this fetch reads the
      // row on screen.
      const response = await fetch(`/api/proxy/admin/commandes/${summary.commandeId}/parcel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outboundTrackingNumber, returnTrackingNumber }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || "Une erreur est survenue.");
        setBusy(false);
        return;
      }

      setSuccess("Étiquettes enregistrées.");
      setCommandeId('');
      setSummary(null);
      setOutboundTrackingNumber('');
      setReturnTrackingNumber('');
    } catch (err) {
      setError("Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Livraison Boxtal (spec §7.8): re-order a leg Boxtal refused. Reads the loaded summary's id,
   * not the input field, for the same reason `onSubmit` does. The summary is re-fetched so the
   * leg's new status is what the operator sees, not what he assumes.
   */
  async function onRetry(leg: 'OUTBOUND' | 'RETURN') {
    if (!summary) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/proxy/admin/commandes/${summary.commandeId}/shipments/${leg}/retry`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error?.message || 'La relance a échoué.');
        return;
      }
      setSuccess(`Commande Boxtal relancée (${leg === 'OUTBOUND' ? 'aller' : 'retour'}).`);
      const fresh = await fetch(`/api/proxy/admin/commandes/${summary.commandeId}`);
      if (fresh.ok) setSummary(await fresh.json());
    } catch {
      setError('Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page--wide">
      <h1>Étiquettes colis</h1>

      {/* CF4-F Task 6: the shipments list, filters + pagination, with an « Ouvrir »
          action per row that loads the per-order tools below via `?commande=`. */}
      <ShipmentsList onOpen={onOpenFromList} />

      <p>Recherchez une commande par son identifiant, vérifiez les détails, puis enregistrez les numéros de suivi.</p>

      <form onSubmit={onSearch}>
        <div>
          <label htmlFor="commandeId">Identifiant de commande</label>
          <input
            id="commandeId"
            type="text"
            value={commandeId}
            onChange={(e) => {
              setCommandeId(e.target.value);
              setSummary(null);
              setError(null);
              setSuccess(null);
            }}
            required
            disabled={busy}
          />
        </div>
        <button type="submit" disabled={busy}>
          {busy ? 'Recherche...' : 'Rechercher'}
        </button>
      </form>

      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
      {/* OUTSIDE the `summary &&` block, deliberately: the handler sets this and
          nulls the summary in the same render, so inside that block the message can
          never be seen and the operator gets no confirmation at all. */}
      {success && <p role="status" style={{ color: 'green' }}>{success}</p>}

      {summary && (
        <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid var(--line)' }}>
          <h2>Détails de la commande</h2>
          <dl>
            <dt>Demande</dt>
            <dd>{summary.demandeTitle}</dd>
            <dt>Client</dt>
            <dd>{summary.clientName}{summary.clientCity ? ` (${summary.clientCity})` : ''}</dd>
            <dt>Réparateur</dt>
            <dd>{summary.repairerName}{summary.repairerCity ? ` (${summary.repairerCity})` : ''}</dd>
            <dt>Livraison</dt>
            <dd>{deliveryModeLabel(summary.delivery)}</dd>
            <dt>Statut</dt>
            <dd>{commandeStatusLabel(summary.status)}</dd>
            <dt>Étape</dt>
            <dd>{summary.step ? commandeStepLabel(summary.step) : 'N/A'}</dd>
            <dt>Total</dt>
            <dd><strong>{formatEuros(summary.totalCents)}</strong></dd>
          </dl>

          <form hidden={!canShip} onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
            <div>
              <label htmlFor="outboundTrackingNumber">Numéro de suivi aller</label>
              <input
                id="outboundTrackingNumber"
                type="text"
                value={outboundTrackingNumber}
                onChange={(e) => setOutboundTrackingNumber(e.target.value)}
                required
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor="returnTrackingNumber">Numéro de suivi retour</label>
              <input
                id="returnTrackingNumber"
                type="text"
                value={returnTrackingNumber}
                onChange={(e) => setReturnTrackingNumber(e.target.value)}
                required
                disabled={busy}
              />
            </div>
            <button type="submit" disabled={busy}>
              {busy ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>

          {/* Livraison Boxtal: the two legs as Boxtal sees them. Absent for local orders and for
              manual-driver parcels, where the form above is the whole story. */}
          {summary.shipments.length > 0 && (
            <section style={{ marginTop: 16 }}>
              <h2 style={{ fontSize: 15 }}>Expéditions Boxtal</h2>
              {summary.shipments.map((s) => (
                <div key={s.leg} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginTop: 8 }}>
                  <strong>{shipmentLegLabel(s.leg)}</strong> · {s.carrierLabel} · {shipmentStatusLabel(s.status)}
                  <div>Devis HT : {formatEuros(s.quotedCostExclTaxCents)} · Facturé HT : {s.billedExclTaxCents === null ? '—' : formatEuros(s.billedExclTaxCents)}</div>
                  <div>Ordre Boxtal : {s.boxtalOrderId ?? '-'} · Étiquette : {s.labelReady ? 'enregistrée' : 'absente'}</div>
                  {s.failureReason && <div style={{ color: 'var(--badge-danger-text)' }}>Échec : {s.failureReason}</div>}
                  {s.status === 'FAILED' && (
                    <button hidden={!canShip} type="button" disabled={busy} onClick={() => void onRetry(s.leg)} style={{ marginTop: 8 }}>
                      Relancer la commande Boxtal
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function ColisPage() {
  return (
    <Suspense fallback={<div className="page page--wide"><p>Chargement...</p></div>}>
      <ColisContent />
    </Suspense>
  );
}
