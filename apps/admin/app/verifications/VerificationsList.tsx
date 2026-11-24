'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AccountKind,
  AdminVerificationListItem,
  AdminVerificationListResponse,
  VerificationRowStatus,
  VerificationRowType,
} from '@revime/shared';
import { VERIFICATION_ROW_STATUS_LABEL } from '@revime/shared';
import { buildListQuery, createLatestGuard } from '../../lib/list-query';
import { IdentityDecisionPanel } from './IdentityDecisionPanel';
import { BusinessDecisionPanel } from './BusinessDecisionPanel';

/**
 * CF4-21 (task 8 brief; spec §5). Verifications list on /verifications - same
 * filter-bar/table/pagination/loading-empty-error pattern as `ShipmentsList`
 * (Task 6) and `RefundsList` (Task 7), so the admin app keeps one visual
 * pattern for every list page.
 *
 * Text inputs (utilisateur, SIREN/SIRET) search on submit, not debounced -
 * same reasoning as the other two lists: several independent filters, one
 * "Rechercher" button.
 */

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminVerificationListResponse };

const STATUS_OPTIONS = Object.entries(VERIFICATION_ROW_STATUS_LABEL) as [VerificationRowStatus, string][];

const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  INDIVIDUAL: 'Particulier',
  PRO: 'Professionnel',
};

const VERIFICATION_ROW_TYPE_LABEL: Record<VerificationRowType, string> = {
  IDENTITY: 'Identité',
  BUSINESS: 'Entreprise',
};

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function VerificationsList() {
  const [view, setView] = useState<View>({ state: 'loading' });
  // CF4-39 & CF5-07: rows whose decision panel is open.
  const [identityPanelRow, setIdentityPanelRow] = useState<AdminVerificationListItem | null>(null);
  const [businessPanelRow, setBusinessPanelRow] = useState<AdminVerificationListItem | null>(null);

  // Filter state, in the order the filter bar renders them: nécessite une
  // action, statut, type de compte, type, période, utilisateur, SIREN/SIRET.
  // `needsAction` is checked by default (spec §5 F5, controller notes) and
  // always sent explicitly as 'true' or 'false' - never omitted - so the
  // server's own default can never silently diverge from what the checkbox
  // shows on screen.
  const [needsAction, setNeedsAction] = useState(true);
  const [status, setStatus] = useState('');
  const [accountKind, setAccountKind] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [user, setUser] = useState('');
  const [siren, setSiren] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  // Same `createLatestGuard` helper as ShipmentsList/RefundsList: guards
  // against a stale response overwriting a newer one.
  const loadGuardRef = useRef(createLatestGuard());

  const load = useCallback(async () => {
    const requestNumber = loadGuardRef.current.next();
    setView({ state: 'loading' });
    const qs = buildListQuery({
      needsAction,
      status,
      accountKind,
      type,
      from,
      to,
      user,
      siren,
      sortOrder,
      page,
    });

    try {
      const res = await fetch(`/api/proxy/admin/verifications${qs}`);
      const data = await res.json();
      if (!loadGuardRef.current.isLatest(requestNumber)) return;
      if (!res.ok) {
        setView({ state: 'error', message: data.error?.message || 'Impossible de charger les vérifications.' });
        return;
      }
      setView({ state: 'loaded', data: data as AdminVerificationListResponse });
    } catch {
      if (!loadGuardRef.current.isLatest(requestNumber)) return;
      setView({ state: 'error', message: 'Impossible de charger les vérifications.' });
    }
  }, [needsAction, status, accountKind, type, from, to, user, siren, sortOrder, page]);

  // CF4-F final review, Important #1: depend on `load` itself (as
  // `ShipmentsList` does), not on `[page]` alone. `load` is a `useCallback`
  // over every filter plus `page`, so any `onXChange` setter below creates a
  // new `load` and this effect re-fires immediately - including when the
  // filter setter also calls `setPage(1)` and page was already 1, where React
  // does not re-render for a same-value `setState` and a `[page]`-only effect
  // would silently no-op until "Rechercher" is clicked.
  useEffect(() => {
    void load();
  }, [load]);

  function onNeedsActionChange(v: boolean) {
    setNeedsAction(v);
    setSortOrder(v ? 'asc' : 'desc');
    setPage(1);
  }
  function onSortOrderChange(v: 'asc' | 'desc') {
    setSortOrder(v);
    setPage(1);
  }
  function onStatusChange(v: string) {
    setStatus(v);
    setPage(1);
  }
  function onAccountKindChange(v: string) {
    setAccountKind(v);
    setPage(1);
  }
  function onTypeChange(v: string) {
    setType(v);
    setPage(1);
  }
  function onFromChange(v: string) {
    setFrom(v);
    setPage(1);
  }
  function onToChange(v: string) {
    setTo(v);
    setPage(1);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    void load();
  }

  return (
    <div style={{ marginBottom: '2.5rem', fontFamily: 'var(--font-google-sans), Arial, sans-serif' }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Liste des vérifications</h2>

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
          <label
            htmlFor="verifications-needs-action"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 8 }}
          >
            <input
              id="verifications-needs-action"
              type="checkbox"
              checked={needsAction}
              onChange={(e) => onNeedsActionChange(e.target.checked)}
            />
            Nécessite une action
          </label>
        </div>

        <div>
          <label htmlFor="verifications-status" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Statut
          </label>
          <select
            id="verifications-status"
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
          <label htmlFor="verifications-account-kind" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Type de compte
          </label>
          <select
            id="verifications-account-kind"
            value={accountKind}
            onChange={(e) => onAccountKindChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', backgroundColor: 'var(--paper)' }}
          >
            <option value="">Tous</option>
            <option value="INDIVIDUAL">Particulier</option>
            <option value="PRO">Professionnel</option>
          </select>
        </div>

        <div>
          <label htmlFor="verifications-type" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Type
          </label>
          <select
            id="verifications-type"
            value={type}
            onChange={(e) => onTypeChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', backgroundColor: 'var(--paper)' }}
          >
            <option value="">Tous</option>
            <option value="IDENTITY">Identité</option>
            <option value="BUSINESS">Entreprise</option>
          </select>
        </div>

        <div>
          <label htmlFor="verifications-from" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Du
          </label>
          <input
            id="verifications-from"
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="verifications-to" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Au
          </label>
          <input
            id="verifications-to"
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)' }}
          />
        </div>

        <div>
          <label htmlFor="verifications-user" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Utilisateur
          </label>
          <input
            id="verifications-user"
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="Nom, identifiant ou e-mail"
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', minWidth: 200 }}
          />
        </div>

        <div>
          <label htmlFor="verifications-siren" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            SIREN / SIRET
          </label>
          <input
            id="verifications-siren"
            type="text"
            value={siren}
            onChange={(e) => setSiren(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 14, borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', minWidth: 140 }}
          />
        </div>

        <div>
          <label htmlFor="verifications-sort-order" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            Trier par
          </label>
          <select
            id="verifications-sort-order"
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value as 'asc' | 'desc')}
            style={{
              padding: '8px 10px',
              fontSize: 14,
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--paper)',
            }}
          >
            <option value="asc">Plus ancien d'abord (priorité)</option>
            <option value="desc">Plus récent d'abord</option>
          </select>
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
        <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement des vérifications…</p>
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
              {/* Spec §5 / brief: the empty state names the needs-action filter specifically,
                  since that filter is on by default and an operator seeing this with no
                  filters touched should read it as "nothing needs you" rather than "no data". */}
              {needsAction
                ? "Aucune vérification ne nécessite d'action."
                : 'Aucune vérification ne correspond à ces critères.'}
            </p>
          ) : (
            <>
              <VerificationsTableView
                items={view.data.items}
                onDecideIdentity={setIdentityPanelRow}
                onDecideBusiness={setBusinessPanelRow}
              />

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
                  {view.data.total} vérification(s) · Page {view.data.page} sur{' '}
                  {Math.max(1, Math.ceil(view.data.total / view.data.pageSize))}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={view.data.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                    onClick={() => setPage((p) => p + 1)}
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

      {identityPanelRow && (
        <IdentityDecisionPanel
          row={identityPanelRow}
          onClose={() => setIdentityPanelRow(null)}
          onChanged={() => void load()}
        />
      )}

      {businessPanelRow && (
        <BusinessDecisionPanel
          row={businessPanelRow}
          onClose={() => setBusinessPanelRow(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

export interface VerificationsTableViewProps {
  items: AdminVerificationListItem[];
  onDecideIdentity?: (row: AdminVerificationListItem) => void;
  onDecideBusiness?: (row: AdminVerificationListItem) => void;
}

export function VerificationsTableView({
  items,
  onDecideIdentity,
  onDecideBusiness,
}: VerificationsTableViewProps) {
  return (
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
            <th style={{ padding: '12px 14px' }}>Date</th>
            <th style={{ padding: '12px 14px' }}>Utilisateur</th>
            <th style={{ padding: '12px 14px' }}>Type de compte</th>
            <th style={{ padding: '12px 14px' }}>Type de vérification</th>
            <th style={{ padding: '12px 14px' }}>Statut</th>
            <th style={{ padding: '12px 14px' }}>Détail</th>
            <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td style={{ padding: '12px 14px' }}>{formatDateFr(row.date)}</td>
              <td style={{ padding: '12px 14px' }}>
                <div>
                  {row.displayName}
                  {/* Ruling R5 (fix round 1, CF4-21): the same "Démo" / "Test" badge
                      the utilisateurs list already renders for `marker`, reused
                      verbatim rather than re-invented, so an operator sees the
                      account provenance the same way on every admin list. */}
                  {row.marker === 'demo' && ' · démo'}
                  {row.marker === 'fixture' && ' · fixture de test'}
                  {row.marker === 'review' && ' · compte de revue'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>
                  {row.username} · {row.email}
                </div>
              </td>
              <td style={{ padding: '12px 14px' }}>{ACCOUNT_KIND_LABEL[row.accountKind]}</td>
              <td style={{ padding: '12px 14px' }}>
                <div>{VERIFICATION_ROW_TYPE_LABEL[row.type]}</div>
                {/* Business rows only, and only when present - a registry-only row
                    built from a rejected/failed VerificationAttempt (spec §5) may
                    carry a SIREN with no SIRET, or neither. */}
                {(row.siren || row.siret) && (
                  <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>
                    {row.siren ?? '—'} / {row.siret ?? '—'}
                  </div>
                )}
              </td>
              <td style={{ padding: '12px 14px' }}>{VERIFICATION_ROW_STATUS_LABEL[row.status]}</td>
              <td style={{ padding: '12px 14px' }}>{row.detail || '—'}</td>
              <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                {/* CF4-39 & CF5-07 & Bug B6: only show Décider when the row needs an admin decision */}
                {row.needsAction ? (
                  row.type === 'IDENTITY' ? (
                    <button
                      type="button"
                      onClick={() => onDecideIdentity?.(row)}
                      style={{
                        display: 'inline-block',
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
                      Décider
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDecideBusiness?.(row)}
                      style={{
                        display: 'inline-block',
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
                      Décider
                    </button>
                  )
                ) : (
                  <Link
                    href={`/utilisateurs/${row.userId}`}
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      fontSize: 12,
                      color: 'var(--badge-info-text)',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Voir
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

