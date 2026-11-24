'use client';

import Link from 'next/link';
import type { AdminOfferContextDto } from '@revime/shared';
import { OFFER_STATUS_LABEL } from '@revime/shared';
import { formatEuros, formatPercentage } from '../../lib/money';
import { Package } from 'lucide-react';
import { Icon } from '../../components/Icon';

export interface OfferComparisonTableProps {
  competingOffers: AdminOfferContextDto['competingOffers'];
  currentOfferId: string;
  stats: AdminOfferContextDto['stats'];
}

export function OfferComparisonTable({
  competingOffers,
  currentOfferId,
  stats,
}: OfferComparisonTableProps) {
  const renderDeltaBadge = (priceCents: number) => {
    if (!stats.averagePriceCents || stats.averagePriceCents <= 0) {
      return <span style={{ color: 'var(--muted, #6b7280)', fontSize: '12px' }}>—</span>;
    }
    const delta = Math.round(((priceCents - stats.averagePriceCents) / stats.averagePriceCents) * 100);
    if (delta === 0) {
      return (
        <span
          style={{
            display: 'inline-flex',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: 'var(--badge-neutral-bg)',
            color: 'var(--ink2)',
          }}
        >
          Moyenne
        </span>
      );
    }
    if (delta < 0) {
      return (
        <span
          style={{
            display: 'inline-flex',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: 'var(--green-soft, #e7f8f0)',
            color: 'var(--green-deep, #0a8a50)',
            border: '1px solid var(--badge-success-border)',
          }}
        >
          {formatPercentage(delta)}
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 700,
          backgroundColor: 'var(--badge-warning-bg)',
          color: 'var(--badge-warning-text)',
          border: '1px solid var(--badge-warning-border)',
        }}
      >
        {`+${formatPercentage(delta)}`}
      </span>
    );
  };

  return (
    <div style={{ marginTop: '16px' }}>
      {/* KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            padding: '12px',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: 'var(--r-card, 6px)',
            border: '1px solid var(--line, #dfe2e2)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--muted, #6b7280)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Total des offres
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink, #141414)', marginTop: '4px' }}>
            {stats.totalOffers}
          </div>
        </div>

        <div
          style={{
            padding: '12px',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: 'var(--r-card, 6px)',
            border: '1px solid var(--line, #dfe2e2)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--muted, #6b7280)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Prix le plus bas
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--badge-success-text)', marginTop: '4px' }}>
            {formatEuros(stats.lowestPriceCents)}
          </div>
        </div>

        <div
          style={{
            padding: '12px',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: 'var(--r-card, 6px)',
            border: '1px solid var(--line, #dfe2e2)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--muted, #6b7280)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Prix moyen
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink, #141414)', marginTop: '4px' }}>
            {formatEuros(stats.averagePriceCents)}
          </div>
        </div>

        <div
          style={{
            padding: '12px',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: 'var(--r-card, 6px)',
            border: '1px solid var(--line, #dfe2e2)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--muted, #6b7280)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Prix le plus élevé
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--badge-warning-text)', marginTop: '4px' }}>
            {formatEuros(stats.highestPriceCents)}
          </div>
        </div>
      </div>

      {/* Competing Offers Table */}
      {competingOffers.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', fontStyle: 'italic', margin: 0 }}>
          Aucune offre concurrente enregistrée pour cette demande.
        </p>
      ) : (
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 6px)',
            backgroundColor: 'var(--paper)',
          }}
        >
          <table
            style={{
              width: '100%',
              minWidth: '640px',
              borderCollapse: 'collapse',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: 'var(--badge-neutral-bg)', borderBottom: '1px solid var(--line, #dfe2e2)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Réparateur
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Type
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Prix
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Écart moy.
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Délai
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Garantie
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Mode & Colis
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--muted, #6b7280)' }}>
                  Statut
                </th>
              </tr>
            </thead>
            <tbody>
              {competingOffers.map((item) => {
                const isCurrent = item.id === currentOfferId || item.isCurrent;
                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid var(--line, #dfe2e2)',
                      backgroundColor: isCurrent ? 'var(--badge-info-bg)' : 'var(--paper)',
                      borderLeft: isCurrent ? '3px solid var(--badge-info-text)' : 'none',
                    }}
                  >
                    {/* Réparateur */}
                    <td style={{ padding: '10px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <Link
                            href={`/utilisateurs/${item.repairerUserId}`}
                            style={{
                              fontWeight: 600,
                              color: 'var(--ink, #141414)',
                              textDecoration: 'none',
                            }}
                          >
                            {item.repairerName}
                          </Link>
                          {isCurrent && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                backgroundColor: 'var(--navy)',
                                color: '#ffffff',
                              }}
                            >
                              Offre actuelle
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            color: item.repairerRating != null ? 'var(--badge-warning-text)' : 'var(--muted, #6b7280)',
                            fontWeight: 500,
                          }}
                        >
                          {item.repairerRating != null ? `★ ${item.repairerRating.toFixed(1)}` : '★ Nouveau'}
                        </span>
                      </div>
                    </td>

                    {/* Type */}
                    <td style={{ padding: '10px', verticalAlign: 'middle' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: item.repairerKind === 'PROFESSIONNEL' ? 'var(--badge-info-bg)' : 'var(--badge-neutral-bg)',
                          color: item.repairerKind === 'PROFESSIONNEL' ? 'var(--badge-info-text)' : 'var(--ink2)',
                          border: `1px solid ${
                            item.repairerKind === 'PROFESSIONNEL' ? 'var(--badge-info-border)' : 'var(--line)'
                          }`,
                        }}
                      >
                        {item.repairerKind === 'PROFESSIONNEL' ? 'PRO' : 'PARTICULIER'}
                      </span>
                    </td>

                    {/* Prix */}
                    <td style={{ padding: '10px', verticalAlign: 'middle', fontWeight: 700, color: 'var(--ink, #141414)' }}>
                      {formatEuros(item.priceCents)}
                    </td>

                    {/* Écart moyen */}
                    <td style={{ padding: '10px', verticalAlign: 'middle' }}>
                      {renderDeltaBadge(item.priceCents)}
                    </td>

                    {/* Délai */}
                    <td style={{ padding: '10px', verticalAlign: 'middle', color: 'var(--ink2)' }}>
                      {item.delayHours}h
                    </td>

                    {/* Garantie */}
                    <td style={{ padding: '10px', verticalAlign: 'middle', color: 'var(--ink2)', maxWidth: '140px' }}>
                      <span
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.warrantyLabel}
                      >
                        {item.warrantyLabel}
                      </span>
                    </td>

                    {/* Mode & Colis */}
                    <td style={{ padding: '10px', verticalAlign: 'middle', color: 'var(--ink2)' }}>
                      <div>
                        {item.travel === 'WORKSHOP' ? 'Atelier' : 'Domicile'}
                        {item.acceptsParcel && (
                          <span
                            style={{
                              marginLeft: '4px',
                              display: 'inline-block',
                              fontSize: '11px',
                              color: 'var(--badge-warning-text)',
                            }}
                          >
                            <Icon as={Package} />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Statut */}
                    <td style={{ padding: '10px', verticalAlign: 'middle' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 7px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor:
                            item.status === 'ACCEPTED'
                              ? 'var(--green-soft, #e7f8f0)'
                              : item.status === 'SENT'
                              ? 'var(--badge-info-bg)'
                              : item.status === 'WITHDRAWN'
                              ? 'var(--red-soft, #feedf0)'
                              : 'var(--badge-neutral-bg)',
                          color:
                            item.status === 'ACCEPTED'
                              ? 'var(--green-deep, #0a8a50)'
                              : item.status === 'SENT'
                              ? 'var(--badge-info-text)'
                              : item.status === 'WITHDRAWN'
                              ? 'var(--red-text, #bd0e26)'
                              : 'var(--ink2)',
                          border: `1px solid ${
                            item.status === 'ACCEPTED'
                              ? 'var(--badge-success-border)'
                              : item.status === 'SENT'
                              ? 'var(--badge-info-border)'
                              : item.status === 'WITHDRAWN'
                              ? 'var(--badge-danger-border)'
                              : 'var(--line)'
                          }`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {OFFER_STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
