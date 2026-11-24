'use client';

import React from 'react';
import Link from 'next/link';
import { formatEuros } from '../lib/money';

export interface PromoUsageItem {
  id: string;
  usedAt: string;
  promoCode: string;
  userName: string;
  userId: string;
  commandeReference: string;
  commandeId: string;
  discountCents: number;
}

export interface PromoUsagesTableProps {
  items?: PromoUsageItem[];
  loading?: boolean;
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

export function PromoUsagesTable({ items = [], loading = false }: PromoUsagesTableProps) {
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
      aria-labelledby="promo-usages-title"
    >
      <div style={{ marginBottom: '16px' }}>
        <h2
          id="promo-usages-title"
          style={{
            fontSize: '16px',
            fontWeight: 600,
            margin: '0 0 4px 0',
            color: 'var(--ink, #141414)',
          }}
        >
          Dernières utilisations ({items.length})
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
          Historique en direct des réductions appliquées aux commandes validées.
        </p>
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
            fontSize: '13px',
          }}
        >
          {loading ? 'Chargement des utilisations…' : 'Aucune utilisation récente de code promo.'}
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
                <th style={{ padding: '10px 12px' }}>Code promo</th>
                <th style={{ padding: '10px 12px' }}>Utilisateur</th>
                <th style={{ padding: '10px 12px' }}>Commande</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Réduction</th>
              </tr>
            </thead>
            <tbody>
              {items.map((usage) => (
                <tr
                  key={usage.id}
                  style={{
                    borderBottom: '1px solid var(--line, #dfe2e2)',
                  }}
                >
                  <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--muted, #6b7280)' }}>
                    {formatDateFr(usage.usedAt)}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 600 }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--badge-info-bg)',
                        color: 'var(--navy-text, #25324f)',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        fontWeight: 700,
                        border: '1px solid var(--badge-info-border)',
                      }}
                    >
                      {usage.promoCode}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <Link
                      href={`/utilisateurs/${usage.userId}`}
                      style={{
                        color: 'var(--navy-text, #25324f)',
                        fontWeight: 500,
                        textDecoration: 'none',
                      }}
                    >
                      {usage.userName}
                    </Link>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <Link
                      href={`/commandes/${usage.commandeId}`}
                      style={{
                        color: 'var(--navy-text, #25324f)',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        textDecoration: 'none',
                      }}
                    >
                      {usage.commandeReference}
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: '12px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: 'var(--navy-text, #f61b39)',
                    }}
                  >
                    -{formatEuros(usage.discountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
