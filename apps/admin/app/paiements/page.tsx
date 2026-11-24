'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ADMIN_PAYMENT_SORT_KEYS, type AdminPaymentListItem, type AdminPaymentListResponse } from '@revime/shared';
import { PaymentsKpiCards } from './PaymentsKpiCards';
import { PaymentsFilterBar } from './PaymentsFilterBar';
import { PaymentsTable } from './PaymentsTable';
import { OpenDisputeModal } from './OpenDisputeModal';
import { ListPagination } from '../../components/ListPagination';
import { CsvExportButton } from '../../components/CsvExportButton';
import { generateCsv, downloadCsv, type CsvColumn } from '../../lib/export-csv';
import { syncUrlParams } from '../../lib/url-sync';
import { toggleSort, type SortDirection } from '../../lib/table-sort';
import { commandeStatusLabel, commandeStepLabel, deliveryModeLabel } from '../../lib/status-labels';
import { formatEuros } from '../../lib/money';
import { Clock, Euro, TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

const isPaymentSortKey = (key: string | null): key is (typeof ADMIN_PAYMENT_SORT_KEYS)[number] =>
  (ADMIN_PAYMENT_SORT_KEYS as readonly string[]).includes(key ?? '');

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminPaymentListResponse };

export async function sendAbandonStalePaymentsRequest(
  fetchImpl: typeof fetch = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const res = await fetchImpl('/api/proxy/admin/payments/abandon-stale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, error: "Impossible d'abandonner les paiements périmés." };
    }
    const data = (await res.json()) as { count: number };
    return { ok: true, count: data.count };
  } catch {
    return { ok: false, error: "Erreur réseau lors de l'abandon des paiements périmés." };
  }
}

export default function PaiementsPage() {
  const [view, setView] = useState<View>({ state: 'loading' });

  // Filter state
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [step, setStep] = useState('ALL');
  const [delivery, setDelivery] = useState('ALL');
  const [disputed, setDisputed] = useState('ALL');
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<string | null>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Modal & flash state
  const [selectedDisputeCommandeId, setSelectedDisputeCommandeId] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isAbandoning, setIsAbandoning] = useState(false);

  // Debounce search input (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Read initial query (?commande= or ?q=) and ?status=, ?period= on mount, client-side only.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const initial = search.get('commande') || search.get('q');
    if (initial) setSearchInput(initial);
    const statusParam = search.get('status');
    if (statusParam === 'pending' || statusParam === 'PENDING_PAYMENT') {
      setStatus('PENDING_PAYMENT');
    } else if (statusParam === 'paid' || statusParam === 'PAID') {
      setStatus('PAID');
    } else if (statusParam === 'refunded' || statusParam === 'REFUNDED') {
      setStatus('REFUNDED');
    }
    const periodParam = search.get('period');
    if (periodParam && ['7d', '30d', 'month', 'all'].includes(periodParam)) {
      setPeriod(periodParam);
    }
    const urlPage = Number(search.get('page'));
    const urlPageSize = Number(search.get('pageSize'));
    const urlSort = search.get('sort');
    const urlDir = search.get('dir') as SortDirection | null;
    if (urlPage > 0) setPage(urlPage);
    if (urlPageSize > 0) setPageSize(urlPageSize);
    if (isPaymentSortKey(urlSort)) setSortKey(urlSort);
    if (urlDir === 'asc' || urlDir === 'desc') setSortDirection(urlDir);
  }, []);

  // Sync state to URL params
  useEffect(() => {
    syncUrlParams(
      {
        q,
        status,
        step,
        delivery,
        disputed,
        period,
        page,
        pageSize,
        sort: sortKey,
        dir: sortDirection,
      },
      {
        q: '',
        status: 'ALL',
        step: 'ALL',
        delivery: 'ALL',
        disputed: 'ALL',
        period: 'all',
        page: 1,
        pageSize: 25,
        sort: 'createdAt',
        dir: 'desc',
      }
    );
  }, [q, status, step, delivery, disputed, period, page, pageSize, sortKey, sortDirection]);

  // The same filters, sort and page that the table shows. The CSV export asks for the whole set
  // with the same function, so what is downloaded is what the filters select, not one page of it.
  const buildParams = useCallback(
    (forPage: number, forPageSize: number) => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (status && status !== 'ALL') params.set('status', status);
      if (step && step !== 'ALL') params.set('step', step);
      if (delivery && delivery !== 'ALL') params.set('delivery', delivery);
      if (disputed && disputed !== 'ALL') params.set('disputed', disputed);
      if (period && period !== 'all') params.set('period', period);
      if (isPaymentSortKey(sortKey)) {
        params.set('sort', sortKey);
        params.set('dir', sortDirection);
      }
      params.set('page', String(forPage));
      params.set('pageSize', String(forPageSize));
      return params;
    },
    [q, status, step, delivery, disputed, period, sortKey, sortDirection],
  );

  const load = useCallback(async () => {
    setView({ state: 'loading' });
    const params = buildParams(page, pageSize);

    try {
      const res = await fetch(`/api/proxy/admin/payments?${params.toString()}`);
      if (!res.ok) {
        setView({ state: 'error', message: 'Impossible de charger les transactions.' });
        return;
      }
      const data = (await res.json()) as AdminPaymentListResponse;
      setView({ state: 'loaded', data });
    } catch {
      setView({ state: 'error', message: 'Impossible de charger les transactions.' });
    }
  }, [buildParams, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasActiveFilters = Boolean(
    searchInput.trim() ||
      status !== 'ALL' ||
      step !== 'ALL' ||
      delivery !== 'ALL' ||
      disputed !== 'ALL' ||
      period !== 'all'
  );

  const handleResetFilters = () => {
    setSearchInput('');
    setQ('');
    setStatus('ALL');
    setStep('ALL');
    setDelivery('ALL');
    setDisputed('ALL');
    setPeriod('all');
    setPage(1);
  };

  const handleAbandonStale = async () => {
    const ok = window.confirm(
      'Voulez-vous marquer comme abandonnés les paiements en attente depuis plus de 24 h dont le paiement n’a jamais été ouvert ? Les autres sont réglés automatiquement auprès de Stripe, chaque heure.'
    );
    if (!ok) return;

    setIsAbandoning(true);
    const res = await sendAbandonStalePaymentsRequest();
    setIsAbandoning(false);
    if (res.ok) {
      setFlashMessage({
        type: 'success',
        text: `${res.count} paiement(s) périmé(s) marqué(s) comme abandonné(s).`,
      });
      void load();
    } else {
      setFlashMessage({
        type: 'error',
        text: res.error,
      });
    }
  };

  const handleSort = (key: string) => {
    const next = toggleSort(sortKey, key, sortDirection);
    setSortKey(next.key);
    setSortDirection(next.direction);
    setPage(1);
  };

  const handleExportCsv = async () => {
    if (view.state !== 'loaded') return;
    // One request for the whole filtered set (the table only holds the current page).
    const res = await fetch(`/api/proxy/admin/payments?${buildParams(1, Math.max(1, view.data.total)).toString()}`);
    if (!res.ok) {
      setFlashMessage({ type: 'error', text: "L'export a échoué : impossible de charger toutes les transactions." });
      return;
    }
    const all = (await res.json()) as AdminPaymentListResponse;
    const columns: CsvColumn<AdminPaymentListItem>[] = [
      { key: 'id', label: 'ID Commande' },
      {
        key: 'createdAt',
        label: 'Date',
        format: (val) => new Date(val as string).toLocaleDateString('fr-FR'),
      },
      { key: 'clientName', label: 'Client' },
      { key: 'clientEmail', label: 'Email Client' },
      { key: 'repairerName', label: 'Réparateur' },
      { key: 'repairerEmail', label: 'Email Réparateur' },
      { key: 'totalCents', label: 'Total (€)', format: (val) => formatEuros(val as number) },
      {
        key: 'payoutStatus',
        label: 'Versement réparateur',
        format: (val, row) => {
          if (val === 'TRANSFERRED') return `Transféré (${formatEuros(row.payoutAmountCents ?? 0)})`;
          if (val === 'PENDING') return `En attente (${formatEuros(row.payoutAmountCents ?? 0)})`;
          if (val === 'FAILED') return 'Échoué';
          if (val === 'REVERSED') return 'Annulé';
          return '—';
        },
      },
      { key: 'repairCents', label: 'Réparation (€)', format: (val) => formatEuros(val as number) },
      { key: 'shippingCents', label: 'Port (€)', format: (val) => formatEuros(val as number) },
      { key: 'protectionCents', label: 'Commission (€)', format: (val) => formatEuros(val as number) },
      { key: 'delivery', label: 'Livraison', format: (val) => deliveryModeLabel(String(val)) },
      { key: 'step', label: 'Étape escrow', format: (val) => (val ? commandeStepLabel(String(val)) : '—') },
      { key: 'status', label: 'Statut', format: (val) => commandeStatusLabel(String(val)) },
      { key: 'isDisputed', label: 'En litige', format: (val) => (val ? 'Oui' : 'Non') },
    ];
    const csv = generateCsv(columns, all.items);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(`paiements-${dateStr}.csv`, csv);
  };

  return (
    <div className="page page--wide">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 6px 0' }}>Gestion des paiements</h1>
          <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
            Suivi des transactions, séquestres et commissions plateforme
          </p>
        </div>

        {/* Quick action links */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {view.state === 'loaded' && view.data.items.length > 0 && (
            <CsvExportButton
              onClick={handleExportCsv}
              count={view.data.total}
              label="Exporter en CSV"
            />
          )}
          <button
            type="button"
            onClick={handleAbandonStale}
            disabled={isAbandoning}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--badge-warning-text)',
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--badge-warning-border)',
              borderRadius: 'var(--r-field, 6px)',
              cursor: isAbandoning ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            <Icon as={Clock} /> Abandonner les paiements périmés (&gt; 24 h)
          </button>
          <Link
            href="/attention"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--ink, #141414)',
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 6px)',
              textDecoration: 'none',
              transition: 'background-color 0.15s ease',
            }}
          >
            <Icon as={TriangleAlert} /> Commandes à surveiller
          </Link>
          <Link
            href="/remboursement"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--ink, #141414)',
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 6px)',
              textDecoration: 'none',
              transition: 'background-color 0.15s ease',
            }}
          >
            <Icon as={Euro} /> Remboursements manuels
          </Link>
        </div>
      </div>

      {/* Flash message */}
      {flashMessage && (
        <div
          role={flashMessage.type === 'error' ? 'alert' : 'status'}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: 'var(--r-field, 6px)',
            backgroundColor: flashMessage.type === 'success' ? 'var(--badge-success-bg)' : 'var(--red-soft, #feedf0)',
            color: flashMessage.type === 'success' ? 'var(--badge-success-text)' : 'var(--red-text, #bd0e26)',
            border: `1px solid ${flashMessage.type === 'success' ? 'var(--badge-success-border)' : 'var(--badge-danger-border)'}`,
            fontSize: '14px',
          }}
        >
          <span>{flashMessage.text}</span>
          <button
            type="button"
            onClick={() => setFlashMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
              marginLeft: '12px',
            }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Cards when loaded */}
      {view.state === 'loaded' && <PaymentsKpiCards metrics={view.data.metrics} period={period} />}

      {/* Filters Bar */}
      <PaymentsFilterBar
        searchInput={searchInput}
        onSearchInputChange={(val) => {
          setSearchInput(val);
          setPage(1);
        }}
        status={status}
        onStatusChange={(val) => {
          setStatus(val);
          setPage(1);
        }}
        step={step}
        onStepChange={(val) => {
          setStep(val);
          setPage(1);
        }}
        delivery={delivery}
        onDeliveryChange={(val) => {
          setDelivery(val);
          setPage(1);
        }}
        disputed={disputed}
        onDisputedChange={(val) => {
          setDisputed(val);
          setPage(1);
        }}
        period={period}
        onPeriodChange={(val) => {
          setPeriod(val);
          setPage(1);
        }}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
      />

      {/* Loading state */}
      {view.state === 'loading' && (
        <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement des transactions…</p>
      )}

      {/* Error state */}
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

      {/* Loaded Content */}
      {view.state === 'loaded' && (
        <>
          {view.data.items.length === 0 ? (
            <p style={{ color: 'var(--muted, #6b7280)', padding: '32px 0', textAlign: 'center' }}>
              Aucune transaction ne correspond à ces critères.
            </p>
          ) : (
            <>
              <PaymentsTable
                items={view.data.items}
                onOpenDispute={(id) => setSelectedDisputeCommandeId(id)}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />

              <ListPagination
                page={view.data.page}
                pageSize={view.data.pageSize}
                total={view.data.total}
                noun="transaction"
                pluralNoun="transactions"
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </>
          )}
        </>
      )}

      {/* Open Dispute Modal */}
      <OpenDisputeModal
        isOpen={selectedDisputeCommandeId !== null}
        commandeId={selectedDisputeCommandeId}
        onClose={() => setSelectedDisputeCommandeId(null)}
        onSuccess={() => {
          setSelectedDisputeCommandeId(null);
          void load();
        }}
      />
    </div>
  );
}
