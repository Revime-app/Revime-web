'use client';

import React from 'react';
import type { AdminBroadcastItem } from '@revime/shared';
import { Bell, Mail, RefreshCw } from 'lucide-react';
import { Icon } from './Icon';

export interface BroadcastHistoryTableProps {
  items: AdminBroadcastItem[];
  total: number;
  loading?: boolean;
  onRefresh?: () => void;
  page?: number;
  onPageChange?: (newPage: number) => void;
  limit?: number;
}

export function formatDateFr(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function BroadcastHistoryTable({
  items,
  total,
  loading = false,
  onRefresh,
  page = 1,
  onPageChange,
  limit = 20,
}: BroadcastHistoryTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section
      className="card"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
        marginTop: '24px',
      }}
      aria-labelledby="history-title"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2
            id="history-title"
            style={{
              fontSize: '16px',
              fontWeight: 600,
              margin: '0 0 4px 0',
              color: 'var(--ink, #141414)',
            }}
          >
            Historique des communications ({total})
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            Journal des diffusions d’e-mails et de notifications push envoyées aux utilisateurs.
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--ink, #141414)',
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <Icon as={RefreshCw} /> {loading ? 'Chargement…' : 'Actualiser'}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--muted, #6b7280)',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: 'var(--r-field, 6px)',
            border: '1px dashed var(--line, #dfe2e2)',
          }}
        >
          {loading ? 'Chargement de l’historique…' : 'Aucune communication envoyée pour le moment.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
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
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Objet</th>
                <th style={{ padding: '10px 12px' }}>Canaux</th>
                <th style={{ padding: '10px 12px' }}>Cible</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Destinataires</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Stats d’envoi</th>
                <th style={{ padding: '10px 12px' }}>Opérateur</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr
                  key={b.id}
                  style={{
                    borderBottom: '1px solid var(--line, #dfe2e2)',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--muted, #6b7280)' }}>
                    {formatDateFr(b.createdAt)}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                    {b.subject}
                  </td>
                  <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', gap: '6px' }}>
                      {b.channelEmail && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--badge-info-bg)',
                            color: 'var(--navy-text, #25324f)',
                            border: '1px solid var(--badge-info-border)',
                          }}
                        >
                          <Icon as={Mail} /> E-mail
                        </span>
                      )}
                      {b.channelPush && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--badge-warning-bg)',
                            color: 'var(--badge-warning-text)',
                            border: '1px solid var(--badge-warning-border)',
                          }}
                        >
                          <Icon as={Bell} /> Push
                        </span>
                      )}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--ink, #141414)' }}>
                    {b.targetSummary}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                    {b.totalRecipients}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '12px' }}>
                    <div>
                      {b.sentEmailCount} e-mail{b.sentEmailCount > 1 ? 's' : ''}
                    </div>
                    <div style={{ color: 'var(--muted, #6b7280)' }}>
                      {b.sentPushCount} push
                    </div>
                  </td>
                  <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--ink, #141414)' }}>
                    {b.operatorName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && onPageChange && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--line, #dfe2e2)',
                fontSize: '13px',
              }}
            >
              <span style={{ color: 'var(--muted, #6b7280)' }}>
                Page {page} sur {totalPages}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => onPageChange(page - 1)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    backgroundColor: 'var(--paper)',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: '4px',
                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Précédent
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => onPageChange(page + 1)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    backgroundColor: 'var(--paper)',
                    border: '1px solid var(--line, #dfe2e2)',
                    borderRadius: '4px',
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
