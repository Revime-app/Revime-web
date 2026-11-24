'use client';

import React from 'react';
import type { ExportReportType } from '@revime/shared';
import { ClipboardList, CreditCard, Euro, FileText, Landmark, Undo2 } from 'lucide-react';
import { Icon } from './Icon';
import type { LucideIcon } from 'lucide-react';

export interface ExportsReportSelectorProps {
  activeReportType: ExportReportType;
  onSelectReportType: (reportType: ExportReportType) => void;
}

interface ReportTypeOption {
  key: ExportReportType;
  label: string;
  icon: LucideIcon;
  description: string;
}

const REPORT_TYPE_OPTIONS: ReportTypeOption[] = [
  {
    key: 'COLLECTIONS',
    label: 'Encaissements globaux',
    icon: CreditCard,
    description: 'Toutes les transactions et paiements clients TTC',
  },
  {
    key: 'COMMISSIONS_VAT',
    label: 'Commissions & TVA Revime',
    icon: Landmark,
    description: 'Frais de protection, base HT et TVA 20 % collectée',
  },
  {
    key: 'PAYOUTS',
    label: 'Versements réparateurs',
    icon: Euro,
    description: 'Virements Stripe décaissés aux professionnels',
  },
  {
    key: 'REFUNDS',
    label: 'Remboursements clients',
    icon: Undo2,
    description: 'Remboursements émis suite à annulation ou litige',
  },
  {
    key: 'DAC7_ANNUAL',
    label: 'Déclaration fiscale DAC7',
    icon: ClipboardList,
    description: 'Déclaration annuelle Art. 242 bis CGI (1 ligne par réparateur)',
  },
];

export function ExportsReportSelector({
  activeReportType,
  onSelectReportType,
}: ExportsReportSelectorProps) {
  return (
    <div
      data-testid="exports-report-selector"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '16px 20px',
        marginBottom: '20px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        <span style={{ fontSize: '18px' }} aria-hidden="true">
          <Icon as={FileText} />
        </span>
        <h2
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--ink, #141414)',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Type d'export comptable
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        {REPORT_TYPE_OPTIONS.map((option) => {
          const isActive = activeReportType === option.key;
          return (
            <button
              key={option.key}
              type="button"
              data-testid={`report-tab-${option.key.toLowerCase()}`}
              onClick={() => onSelectReportType(option.key)}
              title={option.description}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                borderRadius: '9999px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                color: isActive ? 'var(--navy-text, #25324f)' : 'var(--ink, #141414)',
                backgroundColor: isActive ? 'var(--badge-info-bg)' : 'var(--paper, #ffffff)',
                border: isActive
                  ? '1.5px solid var(--navy, #25324f)'
                  : '1px solid var(--line, #dfe2e2)',
                fontWeight: isActive ? 600 : 500,
              }}
            >
              <span aria-hidden="true"><Icon as={option.icon} /></span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
