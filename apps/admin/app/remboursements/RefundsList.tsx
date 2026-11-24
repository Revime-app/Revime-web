'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminRefundListItem, AdminRefundListResponse, RefundListStatus } from '@revime/shared';
import { ADMIN_REFUND_SORT_KEYS, REFUND_LIST_STATUS_LABEL, REFUND_MOTIF_LABEL } from '@revime/shared';
import { buildListQuery, createLatestGuard, parseAmountBound } from '../../lib/list-query';
import { formatEuros } from '../../lib/money';
import { CopyableReference } from '../../components/CopyableReference';
import { RefundsKpiBanner } from '../../components/RefundsKpiBanner';
import { isDeletedUser, DELETED_USER_NAME } from '../../lib/user-display';
import { CsvExportButton } from '../../components/CsvExportButton';
import { ListPagination } from '../../components/ListPagination';
import { SortableTh } from '../../components/SortableTh';
import { downloadCsv, generateCsv, type CsvColumn } from '../../lib/export-csv';
import { toggleSort, type SortDirection } from '../../lib/table-sort';
import { syncUrlParams } from '../../lib/url-sync';

/**
 * CF4-19 (task 7 brief; spec §4). Refunds list on /remboursements - same
 * filter-bar/table/pagination/loading-empty-error pattern as `ShipmentsList`
 * (Task 6), so the admin app keeps one visual pattern for every list page.
 *
 * Text inputs (client, réparateur, recherche) and the amount bounds search on
 * submit, not debounced - same reasoning as `ShipmentsList`: several
 * independent filters, one "Rechercher" button.
 */

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminRefundListResponse };

const isRefundSortKey = (key: string | null): key is (typeof ADMIN_REFUND_SORT_KEYS)[number] =>
  (ADMIN_REFUND_SORT_KEYS as readonly string[]).includes(key ?? '');

const STATUS_OPTIONS = Object.entries(REFUND_LIST_STATUS_LABEL) as [RefundListStatus, string][];
const MOTIF_OPTIONS = Object.entries(REFUND_MOTIF_LABEL);

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export interface RefundsListProps {
  onOpen: (commandeId: string) => void;
}

export function RefundsList({ onOpen }: RefundsListProps) {
  const [view, setView] = useState<View>({ state: 'loading' });

  // Filter state, in the order the filter bar renders them: period, statut,
  // montant min/max, raison, client, réparateur, recherche.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [motif, setMotif] = useState('');
  const [client, setClient] = useState('');
  const [repairer, setRepairer] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<string | null>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [exportError, setExportError] = useState<string | null>(null);
  // The URL is read once on mount; the first load waits for it so the list is not fetched twice.
  const [urlRead, setUrlRead] = useState(false);

  // Amount filters use `parseAmountBound` (which wraps `eurosBoundToCents`); an
  // invalid bound shows an inline error and blocks the search - no request is
  // sent (controller notes).
  const [minError, setMinError] = useState<string | null>(null);
  const [maxError, setMaxError] = useState<string | null>(null);

  // CF4-F final review, Important #1: the LAST SUBMITTED bounds, not the
  // half-typed `minInput`/`maxInput`. `load` depends on these, not on the raw
  // text state, so a select/date/checkbox change (which does not touch these)
  // reloads immediately with whatever bounds were last validated and
  // submitted, while the text inputs themselves stay submit-only.
  const [minCents, setMinCents] = useState<number | null>(null);
  const [maxCents, setMaxCents] = useState<number | null>(null);

  // Same `createLatestGuard` helper as ShipmentsList's `load()` (CF4-F Task 6,
  // Fix round 1): guards against a stale response overwriting a newer one.
  const loadGuardRef = useRef(createLatestGuard());

  // The same filters, sort and page as the table; the CSV export asks for the whole set with it.
  const buildQs = useCallback(
    (forPage: number, forPageSize: number) =>
      buildListQuery({
        from,
        to,
        status,
        minCents,
        maxCents,
        motif,
        client,
        repairer,
        q,
        page: forPage,
        pageSize: forPageSize,
        sort: isRefundSortKey(sortKey) ? sortKey : null,
        dir: isRefundSortKey(sortKey) ? sortDirection : null,
      }),
    [from, to, status, minCents, maxCents, motif, client, repairer, q, sortKey, sortDirection],
  );

  const load = useCallback(async () => {
    const requestNumber = loadGuardRef.current.next();
    setView({ state: 'loading' });
    const qs = buildQs(page, pageSize);

    try {
      const res = await fetch(`/api/proxy/admin/refunds${qs}`);
      const data = await res.json();
      if (!loadGuardRef.current.isLatest(requestNumber)) return;
      if (!res.ok) {
        setView({ state: 'error', message: data.error?.message || 'Impossible de charger les remboursements.' });
        return;
      }
      setView({ state: 'loaded', data: data as AdminRefundListResponse });
    } catch {
      if (!loadGuardRef.current.isLatest(requestNumber)) return;
      setView({ state: 'error', message: 'Impossible de charger les remboursements.' });
    }
  }, [buildQs, page, pageSize]);

  // CF4-F final review, Important #1: depend on `load` itself (as
  // `ShipmentsList` does), not on `[page]` alone - see VerificationsList for
  // the identical reasoning. `load` now depends on the committed `minCents`/
  // `maxCents` rather than the raw text inputs, so a select/date/checkbox
  // change reloads immediately using the last-submitted bounds, never the
  // half-typed input, while the text inputs (client/réparateur/recherche) and
  // the amount bounds themselves stay submit-only via `onSubmit` below.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setFrom(sp.get('from') ?? '');
    setTo(sp.get('to') ?? '');
    setStatus(sp.get('status') ?? '');
    setMotif(sp.get('motif') ?? '');
    setClient(sp.get('client') ?? '');
    setRepairer(sp.get('repairer') ?? '');
    setQ(sp.get('q') ?? '');
    for (const [param, setCents, setInput] of [
      ['minCents', setMinCents, setMinInput],
      ['maxCents', setMaxCents, setMaxInput],
    ] as const) {
      const cents = Number(sp.get(param));
      if (sp.get(param) && Number.isInteger(cents) && cents >= 0) {
        setCents(cents);
        setInput(String(cents / 100).replace('.', ','));
      }
    }
    const urlPage = Number(sp.get('page'));
    const urlPageSize = Number(sp.get('pageSize'));
    const urlSort = sp.get('sort');
    const urlDir = sp.get('dir');
    if (urlPage > 0) setPage(urlPage);
    if (urlPageSize > 0) setPageSize(urlPageSize);
    if (isRefundSortKey(urlSort)) setSortKey(urlSort);
    if (urlDir === 'asc' || urlDir === 'desc') setSortDirection(urlDir);
    setUrlRead(true);
  }, []);

  useEffect(() => {
    if (!urlRead) return;
    syncUrlParams(
      { from, to, status, motif, client, repairer, q, minCents, maxCents, page, pageSize, sort: sortKey, dir: sortDirection },
      { page: 1, pageSize: 25, sort: 'date', dir: 'desc' },
    );
  }, [urlRead, from, to, status, motif, client, repairer, q, minCents, maxCents, page, pageSize, sortKey, sortDirection]);

  useEffect(() => {
    if (urlRead) void load();
  }, [urlRead, load]);

  function handleSort(key: string) {
    const next = toggleSort(sortKey, key, sortDirection);
    setSortKey(next.key);
    setSortDirection(next.direction);
    setPage(1);
  }

  async function handleExportCsv() {
    if (view.state !== 'loaded') return;
    // The whole filtered set, in the order on screen, not the page that is shown.
    const res = await fetch(`/api/proxy/admin/refunds${buildQs(1, Math.max(1, view.data.total))}`);
    if (!res.ok) {
      setExportError("L'export a échoué : impossible de charger tous les remboursements.");
      return;
    }
    setExportError(null);
    const all = (await res.json()) as AdminRefundListResponse;
    const hide = (name: string) => (isDeletedUser(name) ? DELETED_USER_NAME : name);
    const columns: CsvColumn<AdminRefundListItem>[] = [
      { key: 'date', label: 'Date', format: (val) => formatDateFr(String(val)) },
      { key: 'commandeId', label: 'ID Commande' },
      { key: 'stripeRefundId', label: 'ID Stripe' },
      { key: 'clientName', label: 'Client', format: (val) => hide(String(val)) },
      { key: 'repairerName', label: 'Réparateur', format: (val) => hide(String(val)) },
      { key: 'refundedCents', label: 'Montant (€)', format: (val) => formatEuros(val as number | null) },
      { key: 'motif', label: 'Raison', format: (val) => (val === null ? 'Non renseigné' : REFUND_MOTIF_LABEL[val as keyof typeof REFUND_MOTIF_LABEL]) },
      { key: 'status', label: 'Statut', format: (val) => REFUND_LIST_STATUS_LABEL[val as RefundListStatus] },
    ];
    downloadCsv(`remboursements-${new Date().toISOString().slice(0, 10)}.csv`, generateCsv(columns, all.items));
  }

  function onFromChange(v: string) {
    setFrom(v);
    setPage(1);
  }
  function onToChange(v: string) {
    setTo(v);
    setPage(1);
  }
  function onStatusChange(v: string) {
    setStatus(v);
    setPage(1);
  }
  function onMotifChange(v: string) {
    setMotif(v);
    setPage(1);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const minResult = parseAmountBound(minInput);
    const maxResult = parseAmountBound(maxInput);

    setMinError(minResult.ok ? null : minResult.error);
    setMaxError(maxResult.ok ? null : maxResult.error);

    // Invalid bound blocks the search entirely - no request sent.
    if (!minResult.ok || !maxResult.ok) return;

    // Commit the validated bounds. If either changed, `load`'s deps change and
    // the effect above re-fires; if page also needs to reset to 1, that alone
    // covers the reload even when the bounds happen to be unchanged.
    setMinCents(minResult.cents);
    setMaxCents(maxResult.cents);
    setPage(1);
  }

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Liste des remboursements</h2>
        <CsvExportButton
          onClick={handleExportCsv}
          disabled={view.state !== 'loaded' || view.data.items.length === 0}
          count={view.state === 'loaded' ? view.data.total : undefined}
        />
      </div>
      {exportError && (
        <p role="alert" style={{ color: 'var(--red-text, #bd0e26)', fontSize: 13, margin: '0 0 12px' }}>
          {exportError}
        </p>
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
          <label htmlFor="refunds-from" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Du
          </label>
          <input
            id="refunds-from"
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="refunds-to" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Au
          </label>
          <input
            id="refunds-to"
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="refunds-status" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Statut
          </label>
          <select
            id="refunds-status"
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
          <label htmlFor="refunds-min" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Montant min
          </label>
          <input
            id="refunds-min"
            type="text"
            inputMode="decimal"
            value={minInput}
            onChange={(e) => {
              setMinInput(e.target.value);
              setMinError(null);
            }}
            aria-invalid={minError !== null}
            aria-describedby={minError !== null ? 'refunds-min-error' : undefined}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: `1px solid ${minError ? 'var(--red-deep, #bd0e26)' : 'var(--line, #dfe2e2)'}`, width: 90 }}
          />
          {minError && (
            <p id="refunds-min-error" role="alert" style={{ color: 'var(--red-text, #bd0e26)', fontSize: 12, margin: '4px 0 0' }}>
              {minError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="refunds-max" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Montant max
          </label>
          <input
            id="refunds-max"
            type="text"
            inputMode="decimal"
            value={maxInput}
            onChange={(e) => {
              setMaxInput(e.target.value);
              setMaxError(null);
            }}
            aria-invalid={maxError !== null}
            aria-describedby={maxError !== null ? 'refunds-max-error' : undefined}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: `1px solid ${maxError ? 'var(--red-deep, #bd0e26)' : 'var(--line, #dfe2e2)'}`, width: 90 }}
          />
          {maxError && (
            <p id="refunds-max-error" role="alert" style={{ color: 'var(--red-text, #bd0e26)', fontSize: 12, margin: '4px 0 0' }}>
              {maxError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="refunds-motif" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Raison
          </label>
          <select
            id="refunds-motif"
            value={motif}
            onChange={(e) => onMotifChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', backgroundColor: 'var(--paper)' }}
          >
            <option value="">Toutes</option>
            {MOTIF_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="refunds-client" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Client
          </label>
          <input
            id="refunds-client"
            type="text"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="refunds-repairer" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Réparateur
          </label>
          <input
            id="refunds-repairer"
            type="text"
            value={repairer}
            onChange={(e) => setRepairer(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="refunds-q" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Recherche
          </label>
          <input
            id="refunds-q"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="N° de commande, transaction ou nom d'utilisateur"
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', minWidth: 260 }}
          />
        </div>

        <button
          type="submit"
          style={{
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 'var(--r-field, 4px)',
            border: '1px solid var(--line, #dfe2e2)',
            backgroundColor: 'var(--navy, #25324f)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Rechercher
        </button>
      </form>

      {view.state === 'loading' && (
        <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement des remboursements…</p>
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
          <RefundsKpiBanner summary={view.data.summary} />

          {view.data.items.length === 0 ? (
            <p style={{ color: 'var(--muted, #6b7280)', padding: '32px 0', textAlign: 'center' }}>
              Aucun remboursement ne correspond à ces critères.
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
                <table className="table" style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <SortableTh columnKey="date" activeKey={sortKey} direction={sortDirection} label="Date" onSort={handleSort} />
                      <SortableTh columnKey="orderNumber" activeKey={sortKey} direction={sortDirection} label="Commande" onSort={handleSort} />
                      <th style={{ padding: '12px 14px' }}>ID Stripe</th>
                      <SortableTh columnKey="clientName" activeKey={sortKey} direction={sortDirection} label="Client" onSort={handleSort} />
                      <SortableTh columnKey="repairerName" activeKey={sortKey} direction={sortDirection} label="Réparateur" onSort={handleSort} />
                      <SortableTh columnKey="refundedCents" activeKey={sortKey} direction={sortDirection} label="Montant" onSort={handleSort} />
                      <SortableTh columnKey="motif" activeKey={sortKey} direction={sortDirection} label="Raison" onSort={handleSort} />
                      <SortableTh columnKey="status" activeKey={sortKey} direction={sortDirection} label="Statut" onSort={handleSort} />
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.data.items.map((row) => {
                      const isClientDeleted = isDeletedUser(row.clientName);
                      const isRepairerDeleted = isDeletedUser(row.repairerName);
                      return (
                        <tr
                          key={row.commandeId}
                          onClick={() => onOpen(row.commandeId)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ padding: '12px 14px' }}>{formatDateFr(row.date)}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <CopyableReference
                              value={row.commandeId}
                              prefix="CMD"
                              href={`/paiements?commande=${row.commandeId}`}
                            />
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {row.stripeRefundId ? (
                              <CopyableReference
                                value={row.stripeRefundId}
                                href={`https://dashboard.stripe.com/refunds/${encodeURIComponent(row.stripeRefundId)}`}
                                external
                              />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {isClientDeleted ? DELETED_USER_NAME : row.clientName}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {isRepairerDeleted ? DELETED_USER_NAME : row.repairerName}
                          </td>
                          <td style={{ padding: '12px 14px' }}>{formatEuros(row.refundedCents)}</td>
                          <td style={{ padding: '12px 14px' }}>{row.motif === null ? 'Non renseigné' : REFUND_MOTIF_LABEL[row.motif]}</td>
                          <td style={{ padding: '12px 14px' }}>{REFUND_LIST_STATUS_LABEL[row.status]}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpen(row.commandeId);
                              }}
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
                              Voir
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ListPagination
                page={view.data.page}
                pageSize={view.data.pageSize}
                total={view.data.total}
                noun="remboursement"
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
