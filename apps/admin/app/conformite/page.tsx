'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type {
  AdminComplianceItem,
  AdminComplianceListResponse,
  ConsentProofKind,
} from '@revime/shared';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import {
  ComplianceProofDrawer,
  getComplianceKindBadge,
  getIntegrityBadge,
  badgeStyle,
  formatDateFr,
} from '../../components/compliance/ComplianceProofDrawer';

export const COMPLIANCE_KIND_OPTIONS: Array<{ value: ConsentProofKind | ''; label: string }> = [
  { value: '', label: 'Tous les types de preuves' },
  { value: 'CGU_ACCEPTANCE', label: 'Acceptation CGU' },
  // V9 B1 (`DEC9-06` (1)).
  { value: 'PRIVACY_ACCEPTANCE', label: 'Politique de confidentialité' },
  { value: 'WITHDRAWAL_WAIVER_IMMEDIATE', label: 'Renonciation rétractation (exécution immédiate)' },
  { value: 'WITHDRAWAL_WAIVER_WAIT_14_DAYS', label: 'Renonciation rétractation (attente 14 jours)' },
];

export async function fetchComplianceProofs(query: {
  q?: string;
  kind?: string;
  page?: number;
  limit?: number;
}): Promise<{ ok: true; data: AdminComplianceListResponse } | { ok: false; error: string }> {
  try {
    const params = new URLSearchParams();
    if (query.q && query.q.trim()) params.set('q', query.q.trim());
    if (query.kind && query.kind.trim()) params.set('kind', query.kind.trim());
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/proxy/admin/compliance/proofs${qs}`);
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ok: false,
        error: data?.error?.message ?? data?.message ?? 'Impossible de charger le registre de conformité.',
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Erreur réseau lors du chargement des preuves de conformité.' };
  }
}

export interface ComplianceTableProps {
  items: AdminComplianceItem[];
  onInspect: (proof: AdminComplianceItem) => void;
}

export function ComplianceTable({ items, onInspect }: ComplianceTableProps) {
  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--muted, #6b7280)', padding: '32px 0', textAlign: 'center' }}>
        Aucune preuve de conformité ne correspond à ces critères.
      </p>
    );
  }

  return (
    <div
      style={{
        overflowX: 'auto',
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      <table className="table" style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '12px 14px' }}>Horodatage</th>
            <th style={{ padding: '12px 14px' }}>Utilisateur</th>
            <th style={{ padding: '12px 14px' }}>Type de preuve</th>
            <th style={{ padding: '12px 14px' }}>Action</th>
            <th style={{ padding: '12px 14px' }}>Commande</th>
            <th style={{ padding: '12px 14px' }}>Intégrité</th>
            <th style={{ padding: '12px 14px', textAlign: 'right' }}>Détails</th>
          </tr>
        </thead>
        <tbody>
          {items.map((proof) => {
            const kindBadge = getComplianceKindBadge(proof.kind);
            const integrityBadge = getIntegrityBadge(proof.valid, proof.historicalImport);

            return (
              <tr key={proof.id} data-testid={`compliance-row-${proof.id}`}>
                <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontSize: '13px' }}>
                  {formatDateFr(proof.timestamp)}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                    {proof.userEmail ?? proof.userId}
                  </div>
                  {proof.userEmail && (
                    <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', fontFamily: 'monospace' }}>
                      {proof.userId}
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={badgeStyle(kindBadge.tone)}>{kindBadge.label}</span>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <code style={{ fontSize: '12px', color: 'var(--ink, #141414)' }}>{proof.actionProof}</code>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  {proof.commandeId ? (
                    <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{proof.commandeId}</span>
                  ) : (
                    <span style={{ color: 'var(--muted, #6b7280)', fontSize: '13px' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={badgeStyle(integrityBadge.tone)}>{integrityBadge.label}</span>
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    onClick={() => onInspect(proof)}
                    data-testid={`inspect-btn-${proof.id}`}
                    style={{
                      padding: '5px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: 'var(--paper, #ffffff)',
                      border: '1px solid var(--line, #dfe2e2)',
                      borderRadius: 'var(--r-field, 4px)',
                      color: 'var(--ink, #141414)',
                      cursor: 'pointer',
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
  );
}

export interface ConformitePageViewProps {
  items: AdminComplianceItem[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  searchInput: string;
  kindFilter: string;
  onSearchInputChange: (val: string) => void;
  onKindFilterChange: (val: string) => void;
  onSubmitFilter: (e: React.FormEvent) => void;
  onPageChange: (newPage: number) => void;
  onInspect: (proof: AdminComplianceItem) => void;
}

export function ConformitePageView({
  items,
  total,
  page,
  totalPages,
  loading,
  error,
  searchInput,
  kindFilter,
  onSearchInputChange,
  onKindFilterChange,
  onSubmitFilter,
  onPageChange,
  onInspect,
}: ConformitePageViewProps) {
  return (
    <div className="page page--wide">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0' }}>Conformité</h1>
        <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '14px', lineHeight: 1.5 }}>
          Journal d’audit et registre des preuves de consentement horodatées (Code de la consommation art. L. 221-18
          et Directive UE 2011/83/UE).
        </p>
      </div>

      {/* Filter bar */}
      <form
        onSubmit={onSubmitFilter}
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'flex-end',
          marginBottom: '20px',
          backgroundColor: 'var(--paper, #ffffff)',
          padding: '16px',
          borderRadius: 'var(--r-card, 8px)',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      >
        <div style={{ flex: '1 1 260px' }}>
          <label htmlFor="compliance-search-input" style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
            Recherche
          </label>
          <input
            id="compliance-search-input"
            type="text"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            placeholder="Rechercher par ID utilisateur, e-mail ou commande..."
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ flex: '0 1 280px' }}>
          <label htmlFor="compliance-kind-select" style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
            Type de preuve
          </label>
          <select
            id="compliance-kind-select"
            value={kindFilter}
            onChange={(e) => onKindFilterChange(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--paper)',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {COMPLIANCE_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          style={{
            padding: '9px 18px',
            fontSize: '14px',
            fontWeight: 600,
            borderRadius: 'var(--r-field, 4px)',
            border: 'none',
            backgroundColor: 'var(--accent, #0b7285)',
            color: '#ffffff',
            cursor: 'pointer',
          }}
        >
          Filtrer
        </button>
      </form>

      {error && (
        <div role="alert" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement des preuves de conformité…</p>
      ) : (
        <>
          <ComplianceTable items={items} onInspect={onInspect} />

          {/* Pagination */}
          {items.length > 0 && (
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
                {`${total} preuve${total > 1 ? 's' : ''} au total · Page ${page} sur ${Math.max(1, totalPages)}`}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    backgroundColor: page <= 1 ? 'var(--badge-neutral-bg)' : 'var(--paper)',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: 'var(--r-field, 4px)',
                    color: page <= 1 ? 'var(--faint)' : 'var(--ink, #141414)',
                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Précédent
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    backgroundColor: page >= totalPages ? 'var(--badge-neutral-bg)' : 'var(--paper)',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: 'var(--r-field, 4px)',
                    color: page >= totalPages ? 'var(--faint)' : 'var(--ink, #141414)',
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ConformitePage() {
  const me = useAdminMe();
  const canRead = hasPermission(me, 'compliance.read');

  const [items, setItems] = useState<AdminComplianceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [committedQuery, setCommittedQuery] = useState({ q: '', kind: '' });

  const [selectedProof, setSelectedProof] = useState<AdminComplianceItem | null>(null);

  const loadData = useCallback(async (p: number, q: string, kind: string) => {
    setLoading(true);
    setError(null);

    const res = await fetchComplianceProofs({
      q: q || undefined,
      kind: kind || undefined,
      page: p,
      limit: 20,
    });

    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }

    setItems(res.data.items);
    setTotal(res.data.total);
    setPage(res.data.page);
    setTotalPages(res.data.totalPages);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canRead) {
      void loadData(page, committedQuery.q, committedQuery.kind);
    }
  }, [canRead, page, committedQuery, loadData]);

  if (me && !canRead) {
    return (
      <div className="page page--wide">
        <h1>Conformité</h1>
        <p role="alert">
          Accès restreint : cette rubrique requiert le rôle Administrateur ou Super Admin.
        </p>
      </div>
    );
  }

  const handleKindFilterChange = (newKind: string) => {
    setKindFilter(newKind);
    setCommittedQuery((prev) => ({ ...prev, kind: newKind }));
    setPage(1);
  };

  const handleSubmitFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setCommittedQuery({ q: searchInput, kind: kindFilter });
    setPage(1);
  };

  const handleInspect = (proof: AdminComplianceItem) => {
    setSelectedProof(proof);
  };

  const handleDrawerClose = () => {
    setSelectedProof(null);
  };

  return (
    <>
      <ConformitePageView
        items={items}
        total={total}
        page={page}
        totalPages={totalPages}
        loading={loading}
        error={error}
        searchInput={searchInput}
        kindFilter={kindFilter}
        onSearchInputChange={setSearchInput}
        onKindFilterChange={handleKindFilterChange}
        onSubmitFilter={handleSubmitFilter}
        onPageChange={setPage}
        onInspect={handleInspect}
      />

      <ComplianceProofDrawer
        proof={selectedProof}
        isOpen={selectedProof !== null}
        onClose={handleDrawerClose}
        onVerified={(verified) => {
          setItems((prev) =>
            prev.map((item) => (item.id === verified.id ? { ...item, valid: verified.valid, historicalImport: verified.historicalImport } : item))
          );
          if (selectedProof && selectedProof.id === verified.id) {
            setSelectedProof((prev) => (prev ? { ...prev, valid: verified.valid, historicalImport: verified.historicalImport } : null));
          }
        }}
      />
    </>
  );
}
