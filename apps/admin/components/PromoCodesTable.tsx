'use client';

import React, { useState, useMemo } from 'react';
import type { AdminPromoListItem, PromoStatus } from '@revime/shared';
import { formatEuros } from '../lib/money';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { Icon } from './Icon';

export interface PromoCodesTableProps {
  items: AdminPromoListItem[];
  loading?: boolean;
  onToggleStatus?: (promo: AdminPromoListItem) => void;
  onRefresh?: () => void;
}

type FilterTab = 'ALL' | 'ACTIVE' | 'PAUSED' | 'REFERRAL';

export function formatDateShort(dateString: string | null | undefined): string {
  if (!dateString) return 'Illimitée';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateString);
  }
}

export function PromoCodesTable({
  items,
  loading = false,
  onToggleStatus,
  onRefresh,
}: PromoCodesTableProps) {
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode((prev) => (prev === code ? null : prev));
    }, 2000);
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Tab filtering
      if (filterTab === 'ACTIVE' && item.status !== 'ACTIVE') return false;
      if (filterTab === 'PAUSED' && item.status !== 'PAUSED') return false;
      if (filterTab === 'REFERRAL' && !item.isReferral) return false;

      // Search query filtering
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const codeMatches = item.code.toLowerCase().includes(query);
        const descMatches = item.description?.toLowerCase().includes(query) ?? false;
        const referrerMatches = item.referrerName?.toLowerCase().includes(query) ?? false;
        if (!codeMatches && !descMatches && !referrerMatches) {
          return false;
        }
      }

      return true;
    });
  }, [items, filterTab, searchQuery]);

  return (
    <section
      className="card"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
      }}
      aria-labelledby="promo-codes-table-title"
    >
      {/* Table Header & Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        <div>
          <h2
            id="promo-codes-table-title"
            style={{
              fontSize: '16px',
              fontWeight: 600,
              margin: '0 0 4px 0',
              color: 'var(--ink, #141414)',
            }}
          >
            Codes promotionnels ({items.length})
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            Gérez l'ensemble des codes promo généraux, saisonniers et de parrainage.
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

      {/* Tabs & Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--line, #dfe2e2)',
        }}
      >
        {/* Filter Tabs */}
        <div style={{ display: 'inline-flex', gap: '6px' }}>
          {(
            [
              { key: 'ALL', label: 'Tous' },
              { key: 'ACTIVE', label: 'Actifs' },
              { key: 'PAUSED', label: 'En pause' },
              { key: 'REFERRAL', label: 'Parrainage' },
            ] as const
          ).map((tab) => {
            const isSelected = filterTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterTab(tab.key)}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: isSelected ? 600 : 500,
                  borderRadius: 'var(--r-field, 4px)',
                  border: isSelected
                    ? '1px solid var(--navy, #25324f)'
                    : '1px solid var(--line, #dfe2e2)',
                  backgroundColor: isSelected ? 'var(--badge-neutral-bg)' : 'var(--paper)',
                  color: isSelected ? 'var(--navy-text, #25324f)' : 'var(--ink-muted, #666666)',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ minWidth: '220px' }}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher code, mot-clé…"
            aria-label="Rechercher un code"
            style={{
              width: '100%',
              padding: '6px 12px',
              fontSize: '13px',
              borderRadius: 'var(--r-field, 4px)',
              border: '1px solid var(--line, #dfe2e2)',
              backgroundColor: 'var(--paper)',
              color: 'var(--ink, #141414)',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Codes Table */}
      {filteredItems.length === 0 ? (
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
          {loading ? 'Chargement des codes…' : 'Aucun code promotionnel correspondant aux critères.'}
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
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '10px 12px' }}>Code</th>
                <th style={{ padding: '10px 12px' }}>Type</th>
                <th style={{ padding: '10px 12px' }}>Valeur</th>
                <th style={{ padding: '10px 12px' }}>Min commande</th>
                <th style={{ padding: '10px 12px' }}>Utilisations</th>
                <th style={{ padding: '10px 12px' }}>Expiration</th>
                <th style={{ padding: '10px 12px' }}>Statut</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((promo) => {
                const isFixed = promo.type === 'FIXED_AMOUNT';
                const formattedValue = isFixed
                  ? formatEuros(promo.valueCents)
                  : `${promo.valueCents} %`;

                let statusBadgeBg = 'var(--badge-success-bg)';
                let statusBadgeColor = 'var(--badge-success-text)';
                let statusBadgeBorder = 'var(--badge-success-border)';
                let statusLabel = 'Actif';

                if (promo.status === 'PAUSED') {
                  statusBadgeBg = 'var(--badge-warning-bg)';
                  statusBadgeColor = 'var(--badge-warning-text)';
                  statusBadgeBorder = 'var(--badge-warning-border)';
                  statusLabel = 'En pause';
                } else if (promo.status === 'EXPIRED') {
                  statusBadgeBg = 'var(--badge-neutral-bg)';
                  statusBadgeColor = 'var(--ink2)';
                  statusBadgeBorder = 'var(--line)';
                  statusLabel = 'Expiré';
                } else if (promo.status === 'EXHAUSTED') {
                  statusBadgeBg = 'var(--badge-warning-bg)';
                  statusBadgeColor = 'var(--badge-warning-text)';
                  statusBadgeBorder = 'var(--badge-warning-bg)';
                  statusLabel = 'Épuisé';
                }

                return (
                  <tr
                    key={promo.id}
                    style={{
                      borderBottom: '1px solid var(--line, #dfe2e2)',
                    }}
                  >
                    {/* Code & Copy */}
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: 'var(--navy-text, #25324f)',
                          }}
                        >
                          {promo.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(promo.code)}
                          title="Copier le code"
                          style={{
                            background: 'none',
                            border: '1px solid var(--line, #dfe2e2)',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            color: copiedCode === promo.code ? 'var(--badge-success-text)' : 'var(--ink-muted, #666666)',
                            backgroundColor: copiedCode === promo.code ? 'var(--badge-success-bg)' : 'var(--paper)',
                          }}
                        >
                          <Icon as={copiedCode === promo.code ? Check : Copy} />
                        </button>
                      </div>
                      {promo.description && (
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                          {promo.description}
                        </div>
                      )}
                      {promo.isReferral && (
                        <div
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: 'var(--badge-warning-text)',
                            marginTop: '2px',
                          }}
                        >
                          Parrainage : {promo.referrerName || 'Attribué'}
                        </div>
                      )}
                    </td>

                    {/* Type Badge */}
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: isFixed ? 'var(--badge-info-bg)' : 'var(--badge-neutral-bg)',
                          color: isFixed ? 'var(--badge-info-text)' : 'var(--ink2)',
                          border: `1px solid ${isFixed ? 'var(--badge-info-border)' : 'var(--line)'}`,
                        }}
                      >
                        {isFixed ? 'Remise fixe' : 'Remise %'}
                      </span>
                    </td>

                    {/* Valeur */}
                    <td style={{ padding: '12px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                      {formattedValue}
                      {promo.maxDiscountCents && (
                        <div style={{ fontSize: '11px', fontWeight: 400, color: 'var(--muted, #6b7280)' }}>
                          Plafond : {formatEuros(promo.maxDiscountCents)}
                        </div>
                      )}
                    </td>

                    {/* Min panier */}
                    <td style={{ padding: '12px', color: 'var(--ink-muted, #666666)' }}>
                      {promo.minOrderCents > 0 ? formatEuros(promo.minOrderCents) : 'Aucun'}
                    </td>

                    {/* Utilisations */}
                    <td style={{ padding: '12px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                        {promo.currentUsesCount}
                      </span>
                      <span style={{ color: 'var(--muted, #6b7280)' }}>
                        {' / '}
                        {promo.maxUsesTotal !== null && promo.maxUsesTotal !== undefined
                          ? promo.maxUsesTotal
                          : '∞'}
                      </span>
                      {promo.firstOrderOnly && (
                        <div style={{ fontSize: '10px', color: 'var(--badge-info-text)' }}>1ère cmd uniq.</div>
                      )}
                    </td>

                    {/* Expiration */}
                    <td style={{ padding: '12px', color: 'var(--ink-muted, #666666)' }}>
                      {formatDateShort(promo.expiresAt)}
                    </td>

                    {/* Statut Badge */}
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '12px',
                          backgroundColor: statusBadgeBg,
                          color: statusBadgeColor,
                          border: `1px solid ${statusBadgeBorder}`,
                        }}
                      >
                        {statusLabel}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {onToggleStatus && (promo.status === 'ACTIVE' || promo.status === 'PAUSED') && (
                        <button
                          type="button"
                          onClick={() => onToggleStatus(promo)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            borderRadius: 'var(--r-field, 4px)',
                            border: '1px solid var(--line, #dfe2e2)',
                            backgroundColor: 'var(--paper)',
                            color: promo.status === 'ACTIVE' ? 'var(--badge-warning-text)' : 'var(--badge-success-text)',
                            cursor: 'pointer',
                          }}
                        >
                          {promo.status === 'ACTIVE' ? 'Mettre en pause' : 'Activer'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
