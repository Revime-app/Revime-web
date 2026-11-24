'use client';

import React from 'react';
import { formatCount } from '../lib/money';
import { ChartColumn, Download, Hourglass, TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

export interface AuditExportCardProps {
  totalMatching: number;
  onExport: () => void;
  exporting?: boolean;
}

export function AuditExportCard({
  totalMatching,
  onExport,
  exporting = false,
}: AuditExportCardProps) {
  const isCapped = totalMatching > 5000;
  const isActionDisabled = exporting || totalMatching === 0;

  return (
    <div
      data-testid="audit-export-card"
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
          Exporter le journal
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
        Téléchargez les événements filtrés au format CSV (jusqu'à 5 000 lignes, compatible Excel UTF-8 BOM).
      </p>

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
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--muted, #6b7280)' }}>Événements filtrés :</span>
          <span
            data-testid="audit-export-count"
            style={{ fontWeight: 700, color: 'var(--navy-text, #25324f)' }}
          >
            {formatCount(totalMatching)}
          </span>
        </div>
        {isCapped && (
          <div style={{ fontSize: '11px', color: 'var(--badge-warning-text)', marginTop: '2px' }}>
            <Icon as={TriangleAlert} /> Le fichier contiendra les 5 000 événements les plus récents correspondant aux filtres.
          </div>
        )}
      </div>

      <button
        type="button"
        data-testid="audit-export-csv-btn"
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
        <Icon as={exporting ? Hourglass : Download} />
        <span>{exporting ? 'Génération du CSV…' : 'Télécharger CSV'}</span>
      </button>
    </div>
  );
}
