'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminOffreListResponse } from '@revime/shared';
import { OFFER_STATUS_LABEL, OFFER_UNANSWERED_AFTER_DAYS } from '@revime/shared';
import { OfferInspectionDrawer } from './OfferInspectionDrawer';
import { formatEuros } from '../../lib/money';
import { Package, TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminOffreListResponse };

type SortByOption = 'created_desc' | 'created_asc' | 'price_asc' | 'price_desc';

const STATUS_TABS: Array<{ label: string; value: string }> = [
  { label: 'Tous', value: '' },
  { label: 'Envoyée', value: 'SENT' },
  { label: 'Acceptée', value: 'ACCEPTED' },
  { label: 'Non retenue', value: 'REJECTED' },
  { label: 'Retirée', value: 'WITHDRAWN' },
];

export default function OffresPage() {
  const [view, setView] = useState<View>({ state: 'loading' });

  // Filters state
  const [statut, setStatut] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [mode, setMode] = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [sortBy, setSortBy] = useState<SortByOption>('created_desc');
  const [page, setPage] = useState(1);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

  // Debounce search input (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Debounce price inputs (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinPrice(minPriceInput);
      setMaxPrice(maxPriceInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [minPriceInput, maxPriceInput]);

  const load = useCallback(async () => {
    setView({ state: 'loading' });
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (statut) params.set('statut', statut);
    if (kind) params.set('kind', kind);
    if (mode === 'WORKSHOP') params.set('travel', 'WORKSHOP');
    if (mode === 'HOME') params.set('travel', 'HOME');
    if (mode === 'PARCEL_ONLY') params.set('parcel', 'true');

    const parsedMin = minPrice.trim() ? Number(minPrice) : NaN;
    if (!Number.isNaN(parsedMin) && parsedMin >= 0) {
      params.set('minPriceCents', String(Math.round(parsedMin * 100)));
    }
    const parsedMax = maxPrice.trim() ? Number(maxPrice) : NaN;
    if (!Number.isNaN(parsedMax) && parsedMax >= 0) {
      params.set('maxPriceCents', String(Math.round(parsedMax * 100)));
    }

    if (du) params.set('du', du);
    if (au) params.set('au', au);
    if (sortBy) params.set('sortBy', sortBy);
    params.set('page', String(page));

    try {
      const r = await fetch(`/api/proxy/admin/offres?${params.toString()}`);
      // 🛑 No `?? []`. A failed fetch must never render as an empty list.
      if (!r.ok) {
        setView({ state: 'error', message: 'Impossible de charger les offres.' });
        return;
      }
      const data = (await r.json()) as AdminOffreListResponse;
      setView({ state: 'loaded', data });
    } catch {
      setView({ state: 'error', message: 'Impossible de charger les offres.' });
    }
  }, [q, statut, kind, mode, minPrice, maxPrice, du, au, sortBy, page]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const rawStatus = (search.get('status') || search.get('statut') || '').toUpperCase();
    if (['SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'].includes(rawStatus)) {
      setStatut(rawStatus);
    }
    const initialQ = search.get('q');
    if (initialQ) setSearchInput(initialQ);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);


  const hasActiveFilters = Boolean(
    statut ||
      searchInput.trim() ||
      kind ||
      mode ||
      minPriceInput.trim() ||
      maxPriceInput.trim() ||
      du ||
      au ||
      (sortBy && sortBy !== 'created_desc'),
  );

  const resetFilters = () => {
    setStatut('');
    setSearchInput('');
    setQ('');
    setKind('');
    setMode('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setMinPrice('');
    setMaxPrice('');
    setDu('');
    setAu('');
    setSortBy('created_desc');
    setPage(1);
  };

  return (
    <div className="page page--wide">
      <h1>Offres</h1>
      <p style={{ color: 'var(--muted, #6b7280)', marginBottom: '24px', fontSize: '15px' }}>
        Gestion et modération des offres émises par les réparateurs.
      </p>

      {/* Segmented Status Tabs */}
      <div
        role="tablist"
        aria-label="Statut des offres"
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        {STATUS_TABS.map((tab) => {
          const isActive = statut === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                if (statut !== tab.value) {
                  setStatut(tab.value);
                  setPage(1);
                }
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '9999px',
                border: isActive ? '1px solid var(--primary, #111827)' : '1px solid var(--line, #dfe2e2)',
                backgroundColor: isActive ? 'var(--primary, #111827)' : 'var(--paper, #ffffff)',
                color: isActive ? '#fff' : 'var(--ink, #141414)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Rich Filter Bar */}
      <div
        className="filters"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          marginBottom: '1.5rem',
          backgroundColor: 'var(--paper, #ffffff)',
          padding: '16px',
          borderRadius: 'var(--r-card, 10px)',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      >
        <input
          type="search"
          value={searchInput}
          placeholder="Rechercher (demande, réparateur, garantie, pièces...)"
          onChange={(e) => {
            setPage(1);
            setSearchInput(e.target.value);
          }}
          style={{
            minWidth: '260px',
            flex: '1 1 240px',
            padding: '8px 12px',
            fontSize: '14px',
            borderRadius: 'var(--r-field, 4px)',
            border: '1px solid var(--line, #dfe2e2)',
          }}
          aria-label="Recherche offres"
        />

        <select
          value={kind}
          onChange={(e) => {
            setPage(1);
            setKind(e.target.value);
          }}
          aria-label="Type de réparateur"
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            borderRadius: 'var(--r-field, 4px)',
            border: '1px solid var(--line, #dfe2e2)',
            backgroundColor: 'var(--paper)',
          }}
        >
          <option value="">Tous types</option>
          <option value="PROFESSIONNEL">Professionnel</option>
          <option value="PARTICULIER">Particulier</option>
        </select>

        <select
          value={mode}
          onChange={(e) => {
            setPage(1);
            setMode(e.target.value);
          }}
          aria-label="Mode d'intervention"
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            borderRadius: 'var(--r-field, 4px)',
            border: '1px solid var(--line, #dfe2e2)',
            backgroundColor: 'var(--paper)',
          }}
        >
          <option value="">Tous modes</option>
          <option value="WORKSHOP">Atelier</option>
          <option value="HOME">Domicile</option>
          <option value="PARCEL_ONLY">Colis uniquement</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Min (€)"
            value={minPriceInput}
            onChange={(e) => {
              setPage(1);
              setMinPriceInput(e.target.value);
            }}
            style={{
              width: '85px',
              padding: '8px 10px',
              fontSize: '14px',
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
            }}
            aria-label="Prix minimum en euros"
          />
          <span style={{ color: 'var(--muted, #6b7280)', fontSize: '14px' }}>–</span>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Max (€)"
            value={maxPriceInput}
            onChange={(e) => {
              setPage(1);
              setMaxPriceInput(e.target.value);
            }}
            style={{
              width: '85px',
              padding: '8px 10px',
              fontSize: '14px',
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
            }}
            aria-label="Prix maximum en euros"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="filter-du" style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', margin: 0 }}>
            Du
          </label>
          <input
            id="filter-du"
            type="date"
            value={du}
            onChange={(e) => {
              setPage(1);
              setDu(e.target.value);
            }}
            style={{
              padding: '8px 10px',
              fontSize: '14px',
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
            }}
            aria-label="Date de début"
          />
          <label htmlFor="filter-au" style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', margin: 0 }}>
            Au
          </label>
          <input
            id="filter-au"
            type="date"
            value={au}
            onChange={(e) => {
              setPage(1);
              setAu(e.target.value);
            }}
            style={{
              padding: '8px 10px',
              fontSize: '14px',
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
            }}
            aria-label="Date de fin"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => {
            setPage(1);
            setSortBy(e.target.value as SortByOption);
          }}
          aria-label="Trier par"
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            borderRadius: 'var(--r-field, 4px)',
            border: '1px solid var(--line, #dfe2e2)',
            backgroundColor: 'var(--paper)',
          }}
        >
          <option value="created_desc">Plus récentes</option>
          <option value="created_asc">Plus anciennes</option>
          <option value="price_asc">Prix croissant</option>
          <option value="price_desc">Prix décroissant</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--muted, #6b7280)',
              backgroundColor: 'var(--badge-neutral-bg)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {view.state === 'loading' && (
        <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement des offres…</p>
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

      {view.state === 'loaded' && view.data.items.length === 0 && view.data.total === 0 && (
        <p style={{ color: 'var(--muted, #6b7280)', marginTop: '1.5rem' }}>
          Aucune offre ne correspond à ces critères.
        </p>
      )}

      {view.state === 'loaded' && view.data.items.length === 0 && view.data.total > 0 && (
        <p style={{ color: 'var(--muted, #6b7280)', marginTop: '1.5rem' }}>
          Aucune offre sur cette page. Réduisez le numéro de page.
        </p>
      )}

      {view.state === 'loaded' && view.data.items.length > 0 && (
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
            <table className="table" style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px 14px' }}>Demande</th>
                  <th style={{ padding: '12px 14px' }}>Réparateur</th>
                  <th style={{ padding: '12px 14px' }}>Prix & Révision</th>
                  <th style={{ padding: '12px 14px' }}>Mode & Délai</th>
                  <th style={{ padding: '12px 14px' }}>Statut</th>
                  <th style={{ padding: '12px 14px' }}>Signalements</th>
                  <th style={{ padding: '12px 14px' }}>Date</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {view.data.items.map((offer) => {
                  const isSelected = selectedOfferId === offer.offerId;
                  return (
                    <tr
                      key={offer.offerId}
                      style={{
                        backgroundColor: isSelected ? 'var(--badge-info-bg)' : undefined,
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                        <Link
                          href={`/demandes/${offer.demandeId}`}
                          style={{
                            fontWeight: 600,
                            color: 'var(--navy-text, #25324f)',
                            textDecoration: 'none',
                            display: 'block',
                            maxWidth: '220px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={offer.demandeTitle}
                        >
                          {offer.demandeTitle}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                        <div>
                          <Link
                            href={`/utilisateurs/${offer.repairerUserId}`}
                            style={{
                              fontWeight: 600,
                              color: 'var(--ink, #141414)',
                              textDecoration: 'none',
                            }}
                          >
                            {offer.repairerName}
                          </Link>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              marginTop: '4px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor:
                                  offer.repairerKind === 'PROFESSIONNEL' ? 'var(--badge-info-bg)' : 'var(--badge-neutral-bg)',
                                color:
                                  offer.repairerKind === 'PROFESSIONNEL' ? 'var(--badge-info-text)' : 'var(--ink2)',
                                border: `1px solid ${
                                  offer.repairerKind === 'PROFESSIONNEL' ? 'var(--badge-info-border)' : 'var(--line)'
                                }`,
                              }}
                            >
                              {offer.repairerKind === 'PROFESSIONNEL' ? 'PRO' : 'PARTICULIER'}
                            </span>
                            <span
                              style={{
                                fontSize: '12px',
                                color: offer.repairerRating != null ? 'var(--badge-warning-text)' : 'var(--muted, #6b7280)',
                                fontWeight: 500,
                              }}
                            >
                              {offer.repairerRating != null
                                ? `★ ${offer.repairerRating.toFixed(1)} (${offer.repairerReviewCount})`
                                : '★ Nouveau'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: 'var(--ink, #141414)', fontSize: '14px' }}>
                              {formatEuros(offer.priceCents)}
                            </span>
                            {offer.isOverBudget && offer.overBudgetCents ? (
                              <span
                                style={{
                                  background: 'var(--badge-warning-bg)',
                                  color: 'var(--badge-warning-text)',
                                  border: '1px solid var(--badge-warning-border)',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Icon as={TriangleAlert} /> Dépasse le budget (+{formatEuros(offer.overBudgetCents)})
                              </span>
                            ) : null}
                          </div>
                          {offer.revision.total > 1 && (
                            <div style={{ marginTop: '3px' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  backgroundColor: 'var(--badge-neutral-bg)',
                                  color: 'var(--ink2)',
                                  border: '1px solid var(--line)',
                                }}
                              >
                                Rév. {offer.revision.position}/{offer.revision.total}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 500,
                                backgroundColor: 'var(--navy-soft, #f0f1f5)',
                                color: 'var(--navy-text, #25324f)',
                              }}
                            >
                              {offer.travel === 'WORKSHOP' ? 'Atelier' : 'Domicile'}
                            </span>
                            {offer.acceptsParcel && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  backgroundColor: 'var(--badge-warning-bg)',
                                  color: 'var(--badge-warning-text)',
                                  border: '1px solid var(--badge-warning-border)',
                                }}
                              >
                                <Icon as={Package} /> Colis
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                            Délai : {offer.delayHours}h
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          {offer.hasPendingPaymentOrder ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                fontSize: '12px',
                                fontWeight: 600,
                                backgroundColor: 'var(--badge-warning-bg)',
                                color: 'var(--badge-warning-text)',
                                border: '1px solid var(--badge-warning-border)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Acceptée — paiement en attente
                            </span>
                          ) : offer.isUnanswered ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                fontSize: '12px',
                                fontWeight: 600,
                                backgroundColor: 'var(--badge-neutral-bg)',
                                color: 'var(--muted)',
                                border: '1px solid var(--line)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {`Sans réponse (+${OFFER_UNANSWERED_AFTER_DAYS} j)`}
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                fontSize: '12px',
                                fontWeight: 600,
                                backgroundColor:
                                  offer.status === 'ACCEPTED'
                                    ? 'var(--green-soft, #e7f8f0)'
                                    : offer.status === 'SENT'
                                    ? 'var(--badge-info-bg)'
                                    : 'var(--badge-neutral-bg)',
                                color:
                                  offer.status === 'ACCEPTED'
                                    ? 'var(--green-deep, #0a8a50)'
                                    : offer.status === 'SENT'
                                    ? 'var(--badge-info-text)'
                                    : 'var(--ink2)',
                                border: `1px solid ${
                                  offer.status === 'ACCEPTED'
                                    ? 'var(--badge-success-border)'
                                    : offer.status === 'SENT'
                                    ? 'var(--badge-info-border)'
                                    : 'var(--line)'
                                }`,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {OFFER_STATUS_LABEL[offer.status] ?? offer.status}
                            </span>
                          )}
                          {offer.withdrawn && offer.deletedReason && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: 'var(--red-soft, #feedf0)',
                                color: 'var(--red-text, #bd0e26)',
                                border: '1px solid var(--badge-danger-border)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Retirée (Modérée)
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                        {offer.conversationReportCount > 0 ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '12px',
                              fontWeight: 600,
                              backgroundColor: 'var(--badge-danger-bg)',
                              color: 'var(--badge-danger-text)',
                              border: '1px solid var(--badge-danger-border)',
                              whiteSpace: 'nowrap',
                            }}
                            title={`${offer.conversationReportCount} signalement(s) sur la conversation liée`}
                          >
                            <Icon as={TriangleAlert} /> {offer.conversationReportCount}
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '12px',
                              fontWeight: 500,
                              backgroundColor: 'var(--badge-neutral-bg)',
                              color: 'var(--muted, #6b7280)',
                            }}
                          >
                            0
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                          {new Date(offer.createdAt).toLocaleDateString('fr-FR')}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedOfferId(offer.offerId)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '6px 12px',
                            backgroundColor: isSelected
                              ? 'var(--muted, #6b7280)'
                              : 'var(--navy, #25324f)',
                            color: '#ffffff',
                            borderRadius: 'var(--r-field, 4px)',
                            border: 'none',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Inspecter
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '1.5rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div style={{ color: 'var(--muted, #6b7280)', fontSize: '14px' }}>
              Page {view.data.page} sur{' '}
              {Math.max(1, Math.ceil(view.data.total / view.data.pageSize))} · Total : {view.data.total}{' '}
              offre{view.data.total > 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={view.data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '6px 16px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: view.data.page <= 1 ? 'not-allowed' : 'pointer',
                  opacity: view.data.page <= 1 ? 0.5 : 1,
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              >
                Précédent
              </button>
              <button
                type="button"
                disabled={view.data.page * view.data.pageSize >= view.data.total}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  padding: '6px 16px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor:
                    view.data.page * view.data.pageSize >= view.data.total ? 'not-allowed' : 'pointer',
                  opacity: view.data.page * view.data.pageSize >= view.data.total ? 0.5 : 1,
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  backgroundColor: 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              >
                Suivant
              </button>
            </div>
          </div>
        </>
      )}

      {/* Inspection Drawer */}
      <OfferInspectionDrawer
        offerId={selectedOfferId}
        onClose={() => setSelectedOfferId(null)}
        onOfferModerated={() => {
          setSelectedOfferId(null);
          void load();
        }}
      />
    </div>
  );
}
