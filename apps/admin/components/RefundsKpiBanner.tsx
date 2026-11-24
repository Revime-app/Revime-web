'use client';

import React from 'react';
import type { AdminRefundSummary } from '@revime/shared';
import { formatEuros, formatCount } from '../lib/money';

export interface RefundsKpiBannerProps {
  summary: AdminRefundSummary;
}

export function RefundsKpiBanner({ summary }: RefundsKpiBannerProps) {
  const { totalRefundedCents, count, averageRefundCents } = summary;

  return (
    <div
      className="group__tiles"
      data-testid="refunds-kpi-banner"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '20px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      <div
        className="card kpi admin-kpi-card"
        data-testid="kpi-total-refunded"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: 'var(--r-card, 10px)',
          padding: '16px',
        }}
      >
        <p className="kpi__label" style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginBottom: '6px' }}>
          Total remboursé
        </p>
        <p className="kpi__value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink, #141414)', margin: 0 }}>
          {formatEuros(totalRefundedCents)}
        </p>
      </div>

      <div
        className="card kpi admin-kpi-card"
        data-testid="kpi-refund-count"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: 'var(--r-card, 10px)',
          padding: '16px',
        }}
      >
        <p className="kpi__label" style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginBottom: '6px' }}>
          Nombre de remboursements
        </p>
        <p className="kpi__value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink, #141414)', margin: 0 }}>
          {formatCount(count)}
        </p>
      </div>

      <div
        className="card kpi admin-kpi-card"
        data-testid="kpi-average-refund"
        style={{
          backgroundColor: 'var(--paper, #ffffff)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: 'var(--r-card, 10px)',
          padding: '16px',
        }}
      >
        <p className="kpi__label" style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', marginBottom: '6px' }}>
          Montant moyen
        </p>
        <p className="kpi__value" style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink, #141414)', margin: 0 }}>
          {formatEuros(averageRefundCents)}
        </p>
      </div>
    </div>
  );
}
