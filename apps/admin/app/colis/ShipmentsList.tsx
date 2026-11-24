'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminShipmentListResponse, AdminShipmentListItem, ShipmentDisplayStatus } from '@revime/shared';
import { SHIPMENT_DISPLAY_STATUS_LABEL } from '@revime/shared';
import { buildListQuery, createLatestGuard } from '../../lib/list-query';
import { GenerateShippingLabelModal } from '../../components/GenerateShippingLabelModal';
import { TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

/**
 * P16 & CF4-20: Shipments list on /colis:
 * - Consolidated view of active shipments and unbooked parcel orders.
 * - Visual status badges: Prête, En attente, En transit, Livré, Incident / Bloqué, À commander.
 * - Direct PDF label download button.
 * - Sender drop-off reminder action button.
 * - Carrier label generation modal dialog.
 * - Prominent warning banner when blocked/incident parcels exist.
 * - Pure white surfaces, no pitch-black buttons (var(--navy, #25324f)).
 */

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminShipmentListResponse };

const STATUS_OPTIONS = Object.entries(SHIPMENT_DISPLAY_STATUS_LABEL) as [ShipmentDisplayStatus, string][];

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function legLabel(leg: AdminShipmentListItem['leg']): string {
  return leg === 'OUTBOUND' ? 'Aller' : 'Retour';
}

function renderStatusBadge(row: AdminShipmentListItem) {
  if (row.isBlocked || row.status === 'INCIDENT') {
    return (
      <span
        title={row.blockedReason ?? 'Incident de transport'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: 'var(--red-soft, #feedf0)',
          color: 'var(--red-text, #bd0e26)',
          border: '1px solid var(--red-line, #f7c3ca)',
        }}
      >
        <Icon as={TriangleAlert} /> Incident / Bloqué
      </span>
    );
  }

  if (row.displayStatus === 'A_COMMANDER') {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: 'var(--badge-warning-bg)',
          color: 'var(--badge-warning-text)',
          border: '1px solid var(--badge-warning-border)',
        }}
      >
        À commander
      </span>
    );
  }

  if (row.status === 'CREATED' || row.status === 'DOWNLOADED') {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: 'var(--badge-success-bg)',
          color: 'var(--badge-success-text)',
          border: '1px solid var(--badge-success-border)',
        }}
      >
        Prête
      </span>
    );
  }

  if (row.status === 'DELIVERED' || row.status === 'RETURN_DELIVERED') {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: 'var(--badge-success-bg)',
          color: 'var(--badge-success-text)',
          border: '1px solid var(--badge-success-border)',
        }}
      >
        Livré
      </span>
    );
  }

  if (
    row.status === 'HANDED_OVER' ||
    row.status === 'IN_TRANSIT' ||
    row.status === 'AT_PICKUP_POINT' ||
    row.status === 'RETURN_IN_TRANSIT'
  ) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: 'var(--badge-info-bg)',
          color: 'var(--badge-info-text)',
          border: '1px solid var(--badge-info-border)',
        }}
      >
        En transit
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: 'var(--badge-neutral-bg)',
        color: 'var(--ink2)',
        border: '1px solid var(--line)',
      }}
    >
      En attente
    </span>
  );
}

export interface ShipmentsListProps {
  onOpen: (commandeId: string) => void;
  initialItems?: AdminShipmentListItem[];
}

export function ShipmentsList({ onOpen, initialItems }: ShipmentsListProps) {
  const [view, setView] = useState<View>(() => {
    if (initialItems) {
      const distinctCarriers = Array.from(new Set(initialItems.map((i) => i.carrierLabel))).sort();
      return {
        state: 'loaded',
        data: {
          items: initialItems,
          total: initialItems.length,
          page: 1,
          pageSize: 25,
          carriers: distinctCarriers,
        },
      };
    }
    return { state: 'loading' };
  });

  // Filter state
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [carrier, setCarrier] = useState('');
  const [status, setStatus] = useState('');
  const [leg, setLeg] = useState('');
  const [client, setClient] = useState('');
  const [repairer, setRepairer] = useState('');
  const [commande, setCommande] = useState('');
  const [tracking, setTracking] = useState('');
  const [page, setPage] = useState(1);

  // Modal and action states
  const [modalTarget, setModalTarget] = useState<AdminShipmentListItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadGuardRef = useRef(createLatestGuard());
  const hasUserFilteredRef = useRef(false);

  const load = useCallback(async () => {
    const requestNumber = loadGuardRef.current.next();
    setView({ state: 'loading' });
    const qs = buildListQuery({
      from,
      to,
      carrier,
      status,
      leg,
      client,
      repairer,
      commande,
      tracking,
      page,
    });

    try {
      const res = await fetch(`/api/proxy/admin/shipments${qs}`);
      const data = await res.json();
      if (!loadGuardRef.current.isLatest(requestNumber)) return;
      if (!res.ok) {
        setView({ state: 'error', message: data.error?.message || 'Impossible de charger les expéditions.' });
        return;
      }
      setView({ state: 'loaded', data: data as AdminShipmentListResponse });
    } catch {
      if (!loadGuardRef.current.isLatest(requestNumber)) return;
      setView({ state: 'error', message: 'Impossible de charger les expéditions.' });
    }
  }, [from, to, carrier, status, leg, client, repairer, commande, tracking, page]);

  useEffect(() => {
    if (initialItems && !hasUserFilteredRef.current) {
      return;
    }
    void load();
  }, [load, initialItems]);

  function onFromChange(v: string) {
    hasUserFilteredRef.current = true;
    setFrom(v);
    setPage(1);
  }
  function onToChange(v: string) {
    hasUserFilteredRef.current = true;
    setTo(v);
    setPage(1);
  }
  function onCarrierChange(v: string) {
    hasUserFilteredRef.current = true;
    setCarrier(v);
    setPage(1);
  }
  function onStatusChange(v: string) {
    hasUserFilteredRef.current = true;
    setStatus(v);
    setPage(1);
  }
  function onLegChange(v: string) {
    hasUserFilteredRef.current = true;
    setLeg(v);
    setPage(1);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    hasUserFilteredRef.current = true;
    setPage(1);
    void load();
  }

  const handleDownloadPdf = async (row: AdminShipmentListItem) => {
    setDownloadingId(row.shipmentId);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(row.commandeId)}/shipments/${row.leg}/label`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setActionFeedback({ type: 'error', message: data.error?.message || "Impossible de télécharger l'étiquette PDF." });
        return;
      }
      window.open(data.url, '_blank');
    } catch {
      setActionFeedback({ type: 'error', message: "Erreur réseau lors de la récupération de l'étiquette." });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRemind = async (row: AdminShipmentListItem) => {
    if (!window.confirm(`Envoyer un rappel de dépôt de colis pour la commande ${row.orderNumber} ?`)) {
      return;
    }
    setRemindingId(row.shipmentId);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/proxy/admin/commandes/${encodeURIComponent(row.commandeId)}/shipments/${row.leg}/remind`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionFeedback({ type: 'error', message: data.error?.message || "Échec de l'envoi de la relance." });
        return;
      }
      setActionFeedback({ type: 'success', message: `Relance de dépôt envoyée avec succès pour la commande ${row.orderNumber}.` });
    } catch {
      setActionFeedback({ type: 'error', message: "Erreur réseau lors de l'envoi de la relance." });
    } finally {
      setRemindingId(null);
    }
  };

  const carriers = view.state === 'loaded' ? view.data.carriers : [];
  const blockedParcels = view.state === 'loaded' ? view.data.items.filter((item) => item.isBlocked) : [];
  const hasBlockedParcels = blockedParcels.length > 0;

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Liste des expéditions</h2>

      {/* Blocked parcel warning banner */}
      {hasBlockedParcels && (
        <div
          role="alert"
          style={{
            backgroundColor: 'var(--amber-soft, #fffbeb)',
            border: '1px solid var(--amber-line, #fde68a)',
            borderRadius: 'var(--r-card, 8px)',
            padding: '12px 16px',
            marginBottom: '16px',
            color: 'var(--amber-deep, #92400e)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
          }}
        >
          <span style={{ fontSize: '18px' }}><Icon as={TriangleAlert} /></span>
          <div>
            <strong>Attention :</strong> {blockedParcels.length} colis présente(nt) un incident ou sont bloqués depuis plus de 3 jours.
          </div>
        </div>
      )}

      {/* Action feedback */}
      {actionFeedback && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--r-card, 8px)',
            marginBottom: '16px',
            fontSize: '14px',
            backgroundColor: actionFeedback.type === 'success' ? 'var(--badge-success-bg)' : 'var(--red-soft, #feedf0)',
            color: actionFeedback.type === 'success' ? 'var(--badge-success-text)' : 'var(--red-text, #bd0e26)',
            border: `1px solid ${actionFeedback.type === 'success' ? 'var(--badge-success-border)' : 'var(--red-line, #f7c3ca)'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'inherit' }}
          >
            ×
          </button>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'flex-end',
          marginBottom: '1rem',
          backgroundColor: 'var(--paper, #ffffff)',
          padding: '16px',
          borderRadius: 'var(--r-card, 10px)',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      >
        <div>
          <label htmlFor="shipments-from" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Du
          </label>
          <input
            id="shipments-from"
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="shipments-to" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Au
          </label>
          <input
            id="shipments-to"
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="shipments-carrier" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Transporteur
          </label>
          <select
            id="shipments-carrier"
            value={carrier}
            onChange={(e) => onCarrierChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', backgroundColor: 'var(--paper)' }}
          >
            <option value="">Tous</option>
            {carriers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="shipments-status" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Statut
          </label>
          <select
            id="shipments-status"
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', backgroundColor: 'var(--paper)' }}
          >
            <option value="">Tous</option>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="shipments-leg" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Type
          </label>
          <select
            id="shipments-leg"
            value={leg}
            onChange={(e) => onLegChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', backgroundColor: 'var(--paper)' }}
          >
            <option value="">Tous</option>
            <option value="OUTBOUND">Aller</option>
            <option value="RETURN">Retour</option>
          </select>
        </div>

        <div>
          <label htmlFor="shipments-client" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Client
          </label>
          <input
            id="shipments-client"
            type="text"
            value={client}
            onChange={(e) => {
              hasUserFilteredRef.current = true;
              setClient(e.target.value);
            }}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="shipments-repairer" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Réparateur
          </label>
          <input
            id="shipments-repairer"
            type="text"
            value={repairer}
            onChange={(e) => {
              hasUserFilteredRef.current = true;
              setRepairer(e.target.value);
            }}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="shipments-commande" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Commande
          </label>
          <input
            id="shipments-commande"
            type="text"
            value={commande}
            onChange={(e) => {
              hasUserFilteredRef.current = true;
              setCommande(e.target.value);
            }}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="shipments-tracking" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            N° de suivi
          </label>
          <input
            id="shipments-tracking"
            type="text"
            value={tracking}
            onChange={(e) => {
              hasUserFilteredRef.current = true;
              setTracking(e.target.value);
            }}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <button
          type="submit"
          style={{
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 'var(--r-field, 4px)',
            border: '1px solid var(--navy, #25324f)',
            backgroundColor: 'var(--navy, #25324f)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Rechercher
        </button>
      </form>

      {view.state === 'loading' && (
        <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement des expéditions…</p>
      )}

      {view.state === 'error' && (
        <p
          role="alert"
          style={{
            color: 'var(--red-text, #bd0e26)',
            backgroundColor: 'var(--red-soft, #feedf0)',
            padding: '12px 16px',
            borderRadius: 'var(--r-field, 4px)',
            marginBottom: '16px',
          }}
        >
          {view.message}
        </p>
      )}

      {view.state === 'loaded' && (
        <>
          {view.data.items.length === 0 ? (
            <p style={{ color: 'var(--muted, #6b7280)', padding: '32px 0', textAlign: 'center' }}>
              Aucune expédition ne correspond à ces critères.
            </p>
          ) : (
            <>
              <div
                style={{
                  overflowX: 'auto',
                  backgroundColor: 'var(--paper, #ffffff)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: 'var(--r-card, 8px)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <table className="table" style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '12px 14px' }}>Date</th>
                      <th style={{ padding: '12px 14px' }}>Commande</th>
                      <th style={{ padding: '12px 14px' }}>Client</th>
                      <th style={{ padding: '12px 14px' }}>Réparateur</th>
                      <th style={{ padding: '12px 14px' }}>Transporteur</th>
                      <th style={{ padding: '12px 14px' }}>Type</th>
                      <th style={{ padding: '12px 14px' }}>Statut</th>
                      <th style={{ padding: '12px 14px' }}>N° de suivi</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.data.items.map((row) => (
                      <tr key={row.shipmentId}>
                        <td style={{ padding: '12px 14px' }}>{formatDateFr(row.createdAt)}</td>
                        <td style={{ padding: '12px 14px' }}>{row.orderNumber}</td>
                        <td style={{ padding: '12px 14px' }}>{row.clientName}</td>
                        <td style={{ padding: '12px 14px' }}>{row.repairerName}</td>
                        <td style={{ padding: '12px 14px' }}>{row.carrierLabel}</td>
                        <td style={{ padding: '12px 14px' }}>{legLabel(row.leg)}</td>
                        <td style={{ padding: '12px 14px' }}>{renderStatusBadge(row)}</td>
                        <td style={{ padding: '12px 14px' }}>{row.trackingNumber ?? '—'}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            {row.displayStatus === 'A_COMMANDER' ? (
                              <button
                                type="button"
                                onClick={() => setModalTarget(row)}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  backgroundColor: 'var(--navy, #25324f)',
                                  border: '1px solid var(--navy, #25324f)',
                                  borderRadius: 'var(--r-field, 4px)',
                                  color: '#ffffff',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Générer l&#39;étiquette
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleDownloadPdf(row)}
                                  disabled={downloadingId === row.shipmentId || row.hasLabelPdf === false}
                                  title={row.hasLabelPdf === false ? "L'étiquette PDF n'est pas encore disponible" : undefined}
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    backgroundColor: 'var(--paper)',
                                    border: '1px solid var(--line, #dfe2e2)',
                                    borderRadius: 'var(--r-field, 4px)',
                                    color: row.hasLabelPdf === false ? 'var(--muted, #6b7280)' : 'var(--navy-text, #25324f)',
                                    cursor: downloadingId === row.shipmentId ? 'wait' : row.hasLabelPdf === false ? 'not-allowed' : 'pointer',
                                    opacity: row.hasLabelPdf === false ? 0.6 : 1,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {downloadingId === row.shipmentId ? 'Chargement…' : 'Télécharger PDF'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleRemind(row)}
                                  disabled={remindingId === row.shipmentId}
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    backgroundColor: 'var(--paper)',
                                    border: '1px solid var(--line, #dfe2e2)',
                                    borderRadius: 'var(--r-field, 4px)',
                                    color: 'var(--navy-text, #25324f)',
                                    cursor: remindingId === row.shipmentId ? 'wait' : 'pointer',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {remindingId === row.shipmentId ? 'Envoi…' : 'Relance'}
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => onOpen(row.commandeId)}
                              style={{
                                padding: '4px 10px',
                                fontSize: 12,
                                fontWeight: 500,
                                backgroundColor: 'var(--badge-info-bg)',
                                border: '1px solid var(--badge-info-border)',
                                borderRadius: 'var(--r-field, 4px)',
                                color: 'var(--badge-info-text)',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Ouvrir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '16px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                  {view.data.total} expédition(s) · Page {view.data.page} sur{' '}
                  {Math.max(1, Math.ceil(view.data.total / view.data.pageSize))}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={view.data.page <= 1}
                    onClick={() => {
                      hasUserFilteredRef.current = true;
                      setPage((p) => Math.max(1, p - 1));
                    }}
                    style={{
                      padding: '6px 14px',
                      fontSize: '13px',
                      fontWeight: 500,
                      backgroundColor: view.data.page <= 1 ? 'var(--badge-neutral-bg)' : 'var(--paper)',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-field, 4px)',
                      color: view.data.page <= 1 ? 'var(--faint)' : 'var(--ink, #141414)',
                      cursor: view.data.page <= 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Précédent
                  </button>
                  <button
                    type="button"
                    disabled={view.data.page * view.data.pageSize >= view.data.total}
                    onClick={() => {
                      hasUserFilteredRef.current = true;
                      setPage((p) => p + 1);
                    }}
                    style={{
                      padding: '6px 14px',
                      fontSize: '13px',
                      fontWeight: 500,
                      backgroundColor:
                        view.data.page * view.data.pageSize >= view.data.total ? 'var(--badge-neutral-bg)' : 'var(--paper)',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-field, 4px)',
                      color:
                        view.data.page * view.data.pageSize >= view.data.total
                          ? 'var(--faint)'
                          : 'var(--ink, #141414)',
                      cursor:
                        view.data.page * view.data.pageSize >= view.data.total ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Suivant
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Generate Shipping Label Modal */}
      {modalTarget && (
        <GenerateShippingLabelModal
          isOpen={Boolean(modalTarget)}
          onClose={() => setModalTarget(null)}
          commandeId={modalTarget.commandeId}
          orderNumber={modalTarget.orderNumber}
          clientName={modalTarget.clientName}
          repairerName={modalTarget.repairerName}
          leg={modalTarget.leg === 'RETURN' ? 'RETURN' : 'OUTBOUND'}
          onSuccess={() => {
            setActionFeedback({ type: 'success', message: "Étiquette générée avec succès." });
            hasUserFilteredRef.current = true;
            void load();
          }}
        />
      )}
    </div>
  );
}
