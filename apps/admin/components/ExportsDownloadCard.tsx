'use client';

import React from 'react';
import type { ExportReportType } from '@revime/shared';
import { formatCount } from '../lib/money';
import { Download, Hourglass } from 'lucide-react';
import { Icon } from './Icon';

export interface ExportsDownloadCardProps {
  reportType: ExportReportType;
  periodLabel: string;
  totalRows: number;
  onDownload: () => void;
  loading?: boolean;
}

const REPORT_LABELS: Record<ExportReportType, string> = {
  COLLECTIONS: 'Encaissements globaux',
  COMMISSIONS_VAT: 'Commissions & TVA Revime',
  PAYOUTS: 'Versements réparateurs',
  REFUNDS: 'Remboursements clients',
  DAC7_ANNUAL: 'Déclaration fiscale DAC7',
};

export function ExportsDownloadCard({
  reportType,
  periodLabel,
  totalRows,
  onDownload,
  loading = false,
}: ExportsDownloadCardProps) {
  const isActionDisabled = loading || totalRows === 0;

  return (
    <div
      data-testid="exports-download-card"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '20px' }} aria-hidden="true">
          <Icon as={Download} />
        </span>
        <h3
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--ink, #141414)',
            margin: 0,
          }}
        >
          Export CSV comptable
        </h3>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: '12.5px',
          color: 'var(--muted, #6b7280)',
          lineHeight: 1.45,
        }}
      >
        Générez et téléchargez le fichier tabulaire complet au format CSV conforme RFC 4180.
      </p>

      {/* Recap block */}
      <div
        style={{
          backgroundColor: 'var(--badge-neutral-bg)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: '6px',
          padding: '10px 14px',
          fontSize: '12.5px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--muted, #6b7280)' }}>Rapport :</span>
          <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
            {REPORT_LABELS[reportType]}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--muted, #6b7280)' }}>Période :</span>
          <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
            {periodLabel}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '6px',
            borderTop: '1px solid var(--line, #dfe2e2)',
          }}
        >
          <span style={{ color: 'var(--muted, #6b7280)' }}>Lignes exportables :</span>
          <span
            data-testid="exports-download-count"
            style={{ fontWeight: 700, color: 'var(--navy-text, #25324f)' }}
          >
            {`${formatCount(totalRows)} enregistrement${totalRows > 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Download action button - ZERO BLACK BUTTONS RULE */}
      <button
        type="button"
        data-testid="exports-download-button"
        onClick={onDownload}
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
        <span>{loading ? 'Génération du CSV…' : "Télécharger l'export CSV"}</span>
      </button>

      {/* Excel compatibility notice */}
      <div
        style={{
          fontSize: '11px',
          color: 'var(--muted, #6b7280)',
          textAlign: 'center',
          lineHeight: 1.35,
        }}
      >
        Encodage UTF-8 avec BOM pour compatibilité Excel native
      </div>
    </div>
  );
}
