'use client';

import React from 'react';
import type { PayoutFilterState } from './PayoutsFilterToolbar';
import { formatCount } from '../lib/money';
import { ChartColumn, Download, Hourglass } from 'lucide-react';
import { Icon } from './Icon';

export interface PayoutsExportCardProps {
  filters: PayoutFilterState;
  totalCount: number;
  onExport: () => void;
  loading?: boolean;
}

const PERIOD_LABELS: Record<PayoutFilterState['period'], string> = {
  today: "Aujourd'hui",
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
  all: 'Historique complet',
};

const STATUS_LABELS: Record<PayoutFilterState['status'], string> = {
  ALL: 'Tous les statuts',
  TRANSFERRED: 'Transférés',
  PENDING: 'En attente',
  HELD: 'En attente du réparateur',
  FAILED: 'Échoués',
  REVERSED: 'Remboursés',
};

export function PayoutsExportCard({
  filters,
  totalCount,
  onExport,
  loading = false,
}: PayoutsExportCardProps) {
  const isActionDisabled = loading || totalCount === 0;

  return (
    <div
      data-testid="payouts-export-card"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '20px' }} aria-hidden="true">
          <Icon as={ChartColumn} />
        </span>
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--ink, #141414)',
            margin: 0,
          }}
        >
          Export comptable des versements
        </h3>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: '13px',
          color: 'var(--muted, #6b7280)',
          lineHeight: 1.5,
        }}
      >
        Téléchargez la liste filtrée des versements au format CSV (conforme RFC 4180 avec encodage UTF-8 BOM pour Microsoft Excel et compatibilité comptable).
      </p>

      {/* Filter summary card */}
      <div
        style={{
          backgroundColor: 'var(--badge-neutral-bg)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: '6px',
          padding: '10px 14px',
          fontSize: '12.5px',
          color: 'var(--ink, #141414)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--muted, #6b7280)' }}>Période sélectionnée :</span>
          <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
            {PERIOD_LABELS[filters.period]}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--muted, #6b7280)' }}>Filtre statut :</span>
          <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
            {STATUS_LABELS[filters.status]}
          </span>
        </div>

        {filters.q && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--muted, #6b7280)' }}>Recherche active :</span>
            <span style={{ fontWeight: 600, color: 'var(--ink, #141414)', fontStyle: 'italic' }}>
              « {filters.q} »
            </span>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '6px',
            borderTop: '1px solid var(--line, #dfe2e2)',
          }}
        >
          <span style={{ color: 'var(--muted, #6b7280)' }}>Lignes à exporter :</span>
          <span
            data-testid="payouts-export-count"
            style={{ fontWeight: 700, color: 'var(--navy-text, #25324f)' }}
          >
            {`${formatCount(totalCount)} versement${totalCount > 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Export trigger button - ZERO BLACK BUTTONS */}
      <button
        type="button"
        data-testid="payouts-export-csv-btn"
        onClick={onExport}
        disabled={isActionDisabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '10px 18px',
          fontSize: '13.5px',
          fontWeight: 600,
          backgroundColor: isActionDisabled ? 'var(--faint)' : 'var(--navy, #25324f)',
          color: '#ffffff',
          border: isActionDisabled ? '1px solid var(--faint)' : '1px solid var(--navy, #25324f)',
          borderRadius: 'var(--r-field, 4px)',
          cursor: isActionDisabled ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.15s ease',
        }}
      >
        <Icon as={loading ? Hourglass : Download} />
        <span>{loading ? 'Génération du CSV…' : 'Exporter en CSV'}</span>
      </button>
    </div>
  );
}
