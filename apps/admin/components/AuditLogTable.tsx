'use client';

import React from 'react';
import Link from 'next/link';
import type { AdminAuditDetailedEntry, AdminAuditDomain } from '@revime/shared';

export interface AuditLogTableProps {
  items: AdminAuditDetailedEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading?: boolean;
  onPageChange: (newPage: number) => void;
  onInspect: (entry: AdminAuditDetailedEntry) => void;
}

export function formatAuditDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return String(dateString);
  }
}

export function getDomainBadge(domain: AdminAuditDomain) {
  switch (domain) {
    case 'COMMANDES':
      return { bg: 'var(--badge-info-bg)', color: 'var(--badge-info-text)', border: 'var(--badge-info-border)', label: 'Commandes' };
    case 'USERS':
      return { bg: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', border: 'var(--badge-success-border)', label: 'Utilisateurs' };
    case 'LITIGES_SIGNALEMENTS':
      return { bg: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: 'var(--badge-warning-border)', label: 'Litiges' };
    case 'CATALOGUE_CONTENU':
      return { bg: 'var(--badge-neutral-bg)', color: 'var(--ink2)', border: 'var(--line)', label: 'Catalogue' };
    case 'MARKETING_PROMOS':
      return { bg: 'var(--badge-neutral-bg)', color: 'var(--ink2)', border: 'var(--line)', label: 'Marketing' };
    case 'SECURITE_AUTH':
    default:
      return { bg: 'var(--badge-danger-bg)', color: 'var(--badge-danger-text)', border: 'var(--badge-danger-border)', label: 'Sécurité' };
  }
}

export function getStatusBadge(code: number) {
  if (code >= 200 && code < 300) {
    return { bg: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', border: 'var(--badge-success-border)' };
  }
  if (code >= 400 && code < 500) {
    return { bg: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: 'var(--badge-warning-border)' };
  }
  if (code >= 500) {
    return { bg: 'var(--badge-danger-bg)', color: 'var(--badge-danger-text)', border: 'var(--badge-danger-border)' };
  }
  return { bg: 'var(--badge-neutral-bg)', color: 'var(--ink2)', border: 'var(--line)' };
}

export function getTargetLink(targetType?: string | null, targetId?: string | null): string | null {
  if (!targetType || !targetId) return null;
  const lower = targetType.toLowerCase();
  if (lower.includes('commande') || lower.includes('order')) {
    return `/commandes/${targetId}`;
  }
  if (
    lower.includes('user') ||
    lower.includes('utilisateur') ||
    lower.includes('repairer') ||
    lower.includes('reparateur')
  ) {
    return `/utilisateurs/${targetId}`;
  }
  if (lower.includes('litige') || lower.includes('dispute')) {
    return `/litiges/${targetId}`;
  }
  if (lower.includes('signalement') || lower.includes('report')) {
    return `/signalements/${targetId}`;
  }
  if (lower.includes('demande')) {
    return `/demandes/${targetId}`;
  }
  if (lower.includes('promo')) {
    return `/codes-promo`;
  }
  return null;
}

export function AuditLogTable({
  items,
  total,
  page,
  pageSize,
  totalPages,
  loading = false,
  onPageChange,
  onInspect,
}: AuditLogTableProps) {
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  return (
    <section
      data-testid="audit-log-table-container"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
      }}
      aria-labelledby="audit-table-heading"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div>
          <h2
            id="audit-table-heading"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
              margin: '0 0 4px 0',
            }}
          >
            Événements d'administration
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            Historique détaillé des mutations exécutées par les équipes d'administration.
          </p>
        </div>
      </div>

      {/* Table view */}
      {items.length === 0 ? (
        <div
          data-testid="audit-table-empty"
          style={{
            padding: '36px 16px',
            textAlign: 'center',
            color: 'var(--muted, #6b7280)',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: 'var(--r-field, 6px)',
            border: '1px dashed var(--line, #dfe2e2)',
            fontSize: '13.5px',
          }}
        >
          {loading
            ? "Chargement du journal d'audit…"
            : "Aucun événement d'audit ne correspond aux critères sélectionnés."}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            data-testid="audit-log-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--line, #dfe2e2)',
                  color: 'var(--muted, #6b7280)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '10px 12px' }}>Date & Heure</th>
                <th style={{ padding: '10px 12px' }}>Opérateur</th>
                <th style={{ padding: '10px 12px' }}>Domaine & Action</th>
                <th style={{ padding: '10px 12px' }}>Cible</th>
                <th style={{ padding: '10px 12px' }}>Statut HTTP</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => {
                const domainBadge = getDomainBadge(entry.domain);
                const statusBadge = getStatusBadge(entry.statusCode);
                const targetLink = getTargetLink(entry.targetType, entry.targetId);

                return (
                  <tr
                    key={entry.id}
                    data-testid={`audit-row-${entry.id}`}
                    style={{
                      borderBottom: '1px solid var(--line, #dfe2e2)',
                      transition: 'background-color 0.1s ease',
                    }}
                  >
                    {/* 1. Date & Heure */}
                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          fontWeight: 500,
                          color: 'var(--ink, #141414)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatAuditDate(entry.createdAt)}
                      </span>
                    </td>

                    {/* 2. Opérateur */}
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color: 'var(--ink, #141414)',
                            wordBreak: 'break-all',
                          }}
                        >
                          {entry.actorEmail}
                        </span>
                        {entry.actorRole && (
                          <span
                            style={{
                              display: 'inline-block',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--badge-neutral-bg)',
                              color: 'var(--ink2)',
                              width: 'fit-content',
                            }}
                          >
                            {entry.actorRole}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. Domaine & Action */}
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 7px',
                              borderRadius: '9999px',
                              backgroundColor: domainBadge.bg,
                              color: domainBadge.color,
                              border: `1px solid ${domainBadge.border}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {domainBadge.label}
                          </span>
                          <span
                            style={{
                              fontWeight: 600,
                              color: 'var(--ink, #141414)',
                              fontSize: '13px',
                            }}
                          >
                            {entry.actionLabel}
                          </span>
                        </div>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            color: 'var(--muted, #6b7280)',
                          }}
                        >
                          {entry.action}
                        </span>
                      </div>
                    </td>

                    {/* 4. Cible */}
                    <td style={{ padding: '12px' }}>
                      {entry.targetType && entry.targetId ? (
                        targetLink ? (
                          <Link
                            href={targetLink}
                            data-testid={`target-link-${entry.id}`}
                            style={{
                              color: 'var(--navy-text, #25324f)',
                              textDecoration: 'underline',
                              fontWeight: 600,
                              fontSize: '12.5px',
                            }}
                          >
                            {entry.targetType} #{entry.targetId.slice(0, 10)}
                            {entry.targetId.length > 10 ? '…' : ''}
                          </Link>
                        ) : (
                          <span style={{ fontSize: '12.5px', color: 'var(--ink, #141414)' }}>
                            {entry.targetType} #{entry.targetId}
                          </span>
                        )
                      ) : (
                        <span style={{ color: 'var(--muted, #6b7280)' }}>—</span>
                      )}
                    </td>

                    {/* 5. Statut HTTP */}
                    <td style={{ padding: '12px' }}>
                      <span
                        data-testid={`status-badge-${entry.id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '9999px',
                          backgroundColor: statusBadge.bg,
                          color: statusBadge.color,
                          border: `1px solid ${statusBadge.border}`,
                        }}
                      >
                        {entry.statusCode}
                      </span>
                    </td>

                    {/* 6. Action column: Inspecter */}
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        data-testid={`inspect-btn-${entry.id}`}
                        onClick={() => onInspect(entry)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 12px',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          backgroundColor: 'var(--paper, #ffffff)',
                          border: '1px solid var(--line, #dfe2e2)',
                          borderRadius: 'var(--r-field, 4px)',
                          color: 'var(--navy-text, #25324f)',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease',
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
      )}

      {/* Pagination controls */}
      <nav
        aria-label="Pagination du journal d'audit"
        data-testid="audit-pagination"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '16px',
          flexWrap: 'wrap',
          gap: '12px',
          paddingTop: '12px',
          borderTop: '1px solid var(--line, #dfe2e2)',
        }}
      >
        <div
          data-testid="audit-pagination-info"
          style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}
        >
          Affichage de {startIndex} à {endIndex} sur {total} {total > 1 ? 'entrées' : 'entrée'}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            data-testid="audit-pagination-prev"
            disabled={!hasPrev || loading}
            onClick={() => onPageChange(page - 1)}
            style={{
              padding: '6px 14px',
              fontSize: '12.5px',
              fontWeight: 600,
              backgroundColor: !hasPrev || loading ? 'var(--badge-neutral-bg)' : 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              color: !hasPrev || loading ? 'var(--faint)' : 'var(--navy-text, #25324f)',
              cursor: !hasPrev || loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Précédent
          </button>
          <button
            type="button"
            data-testid="audit-pagination-next"
            disabled={!hasNext || loading}
            onClick={() => onPageChange(page + 1)}
            style={{
              padding: '6px 14px',
              fontSize: '12.5px',
              fontWeight: 600,
              backgroundColor: !hasNext || loading ? 'var(--badge-neutral-bg)' : 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              color: !hasNext || loading ? 'var(--faint)' : 'var(--navy-text, #25324f)',
              cursor: !hasNext || loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Suivant
          </button>
        </div>
      </nav>
    </section>
  );
}
