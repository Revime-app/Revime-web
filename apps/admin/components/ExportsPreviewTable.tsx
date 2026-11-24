'use client';

import React from 'react';
import type { AdminExportColumnDef, ExportReportType } from '@revime/shared';
import { formatEuros } from '../lib/money';
import { Eye, FolderOpen } from 'lucide-react';
import { Icon } from './Icon';

export interface ExportsPreviewTableProps {
  reportType: ExportReportType;
  columns: AdminExportColumnDef[];
  rows: Record<string, unknown>[];
  totalRows: number;
  periodLabel: string;
  loading?: boolean;
}

function formatCellDate(val: unknown): string {
  if (val === null || val === undefined || val === '') {
    return '—';
  }
  if (typeof val === 'string') {
    // If it looks like an ISO date
    if (val.includes('-') && !isNaN(Date.parse(val))) {
      const d = new Date(val);
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      // If it has hours/minutes
      if (val.includes('T')) {
        const hours = String(d.getUTCHours()).padStart(2, '0');
        const minutes = String(d.getUTCMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
      }
      return `${day}/${month}/${year}`;
    }
    return val;
  }
  if (val instanceof Date) {
    const day = String(val.getUTCDate()).padStart(2, '0');
    const month = String(val.getUTCMonth() + 1).padStart(2, '0');
    const year = val.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }
  return String(val);
}

function formatCellCurrency(val: unknown): string {
  if (val === null || val === undefined || val === '') {
    return '—';
  }
  if (typeof val === 'number') {
    return formatEuros(val);
  }
  return String(val);
}

function renderBadge(val: unknown) {
  const str = String(val ?? '');
  let bg = 'var(--navy-soft)';
  let color = 'var(--navy, #25324f)';

  const upper = str.toUpperCase().trim();
  if (upper === 'ENVOYÉ' || upper === 'ENVOYE') {
    bg = 'var(--badge-success-bg)';
    color = 'var(--badge-success-text)';
  } else if (upper === 'BLOQUÉ' || upper === 'BLOQUE' || upper === 'ÉCHEC') {
    bg = 'var(--badge-danger-bg)';
    color = 'var(--badge-danger-text)';
  } else if (upper === 'EN ATTENTE') {
    bg = 'var(--badge-neutral-bg)';
    color = 'var(--ink2)';
  } else if (upper === 'PAID' || upper === 'TRANSFERRED' || upper === '20 %' || upper === 'COMPLETED') {
    bg = 'var(--badge-success-bg)';
    color = 'var(--badge-success-text)';
  } else if (upper === 'REFUNDED' || upper === 'FAILED' || upper === 'REVERSED') {
    bg = 'var(--badge-danger-bg)';
    color = 'var(--badge-danger-text)';
  } else if (upper === 'RELEASED' || upper === 'PENDING') {
    bg = 'var(--badge-info-bg)';
    color = 'var(--navy, #25324f)';
  }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '11.5px',
        fontWeight: 600,
        backgroundColor: bg,
        color,
      }}
    >
      {str}
    </span>
  );
}

function isMonospaceKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes('id') ||
    lower.includes('siren') ||
    lower.includes('siret') ||
    lower.includes('iban') ||
    lower.includes('identifier') ||
    lower === 'ordernumber'
  );
}

export function ExportsPreviewTable({
  reportType,
  columns,
  rows,
  totalRows,
  periodLabel,
  loading = false,
}: ExportsPreviewTableProps) {
  return (
    <div
      data-testid="exports-preview-table-container"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        marginBottom: '24px',
      }}
    >
      {/* Preview Info Banner */}
      <div
        data-testid="exports-preview-banner"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          backgroundColor: 'var(--badge-neutral-bg)',
          borderBottom: '1px solid var(--line, #dfe2e2)',
          fontSize: '12.5px',
          color: 'var(--ink, #141414)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span aria-hidden="true"><Icon as={Eye} /></span>
          <span>
            {`Aperçu des premiers enregistrements (${rows.length} / ${totalRows}) pour ${periodLabel}`}
          </span>
        </div>
        {loading && (
          <span style={{ fontSize: '11.5px', color: 'var(--muted, #6b7280)', fontStyle: 'italic' }}>
            Actualisation…
          </span>
        )}
      </div>

      {/* Table Content */}
      {loading && rows.length === 0 ? (
        <div
          data-testid="exports-preview-loading"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--muted, #6b7280)',
            fontSize: '13.5px',
          }}
        >
          Chargement de l'aperçu de l'export…
        </div>
      ) : rows.length === 0 ? (
        <div
          data-testid="exports-preview-empty"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--muted, #6b7280)',
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: '8px' }} aria-hidden="true">
            <Icon as={FolderOpen} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
            Aucun enregistrement trouvé
          </div>
          <div style={{ fontSize: '12.5px', marginTop: '4px' }}>
            Aucune donnée ne correspond aux critères et à la période sélectionnée.
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table
            data-testid="exports-preview-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '12.5px',
            }}
          >
            <thead
              style={
                reportType === 'DAC7_ANNUAL'
                  ? { backgroundColor: 'var(--navy)', color: '#ffffff' }
                  : undefined
              }
            >
              <tr
                style={{
                  backgroundColor: reportType === 'DAC7_ANNUAL' ? 'var(--navy)' : 'var(--badge-neutral-bg)',
                  borderBottom:
                    reportType === 'DAC7_ANNUAL'
                      ? '1px solid var(--ink2)'
                      : '1px solid var(--line, #dfe2e2)',
                }}
              >
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      padding: '10px 14px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: reportType === 'DAC7_ANNUAL' ? '#ffffff' : 'var(--muted, #6b7280)',
                      backgroundColor: reportType === 'DAC7_ANNUAL' ? 'var(--navy)' : undefined,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={
                    (row.id as string) ||
                    (row.orderId as string) ||
                    (row.repairerUserId as string) ||
                    `row-${rowIndex}`
                  }
                  style={{
                    borderBottom: '1px solid var(--line, #dfe2e2)',
                    backgroundColor: rowIndex % 2 === 1 ? 'var(--badge-neutral-bg)' : 'var(--paper, #ffffff)',
                  }}
                >
                  {columns.map((col) => {
                    const cellVal = row[col.key];
                    const isMono = isMonospaceKey(col.key);

                    let content: React.ReactNode;
                    if (
                      (col.key === 'identifier' || col.key === 'siren' || col.key === 'nif') &&
                      String(cellVal).trim() === 'Manquant'
                    ) {
                      content = (
                        <span style={{ color: 'var(--badge-danger-text)', fontWeight: 600 }}>
                          Manquant
                        </span>
                      );
                    } else if (col.type === 'currency') {
                      content = formatCellCurrency(cellVal);
                    } else if (col.type === 'badge') {
                      content = renderBadge(cellVal);
                    } else if (col.type === 'date') {
                      content = formatCellDate(cellVal);
                    } else if (col.type === 'link') {
                      const linkHref = row.orderId
                        ? `/commandes/${row.orderId}`
                        : `/commandes?q=${encodeURIComponent(String(cellVal ?? ''))}`;
                      content = (
                        <a
                          href={linkHref}
                          style={{
                            color: 'var(--navy-text, #25324f)',
                            textDecoration: 'underline',
                            fontWeight: 600,
                            fontFamily: isMono
                              ? "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
                              : 'inherit',
                          }}
                        >
                          {String(cellVal ?? '—')}
                        </a>
                      );
                    } else {
                      // Text type
                      content = (
                        <span
                          style={{
                            fontFamily: isMono
                              ? "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
                              : 'inherit',
                            fontSize: isMono ? '12px' : 'inherit',
                          }}
                        >
                          {String(cellVal ?? '—')}
                        </span>
                      );
                    }

                    return (
                      <td
                        key={col.key}
                        style={{
                          padding: '10px 14px',
                          color: 'var(--ink, #141414)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
