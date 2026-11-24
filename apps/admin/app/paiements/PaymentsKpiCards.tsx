'use client';

import type { AdminPaymentMetricsDto } from '@revime/shared';
import { formatEuros } from '../../lib/money';

interface PaymentsKpiCardsProps {
  metrics: AdminPaymentMetricsDto;
  period?: string;
}

export function PaymentsKpiCards({ metrics, period }: PaymentsKpiCardsProps) {
  const periodNote =
    period === '7d'
      ? '7 derniers jours'
      : period === '30d'
        ? '30 derniers jours'
        : period === 'month'
          ? 'Ce mois-ci'
          : null;

  return (
    <div
      className="group__tiles"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '24px',
      }}
    >
      <div className="card kpi admin-kpi-card">
        <p className="kpi__label">Volume total encaissé</p>
        <p className="kpi__value">{formatEuros(metrics.totalVolumeCents)}</p>
        <p className="kpi__note">{periodNote ?? 'Toutes commandes payées'}</p>
      </div>

      <div className="card kpi admin-kpi-card">
        <p className="kpi__label">Commissions plateforme</p>
        <p className="kpi__value">{formatEuros(metrics.commissionCents)}</p>
        <p className="kpi__note">{periodNote ? `Commissions perçues (${periodNote.toLowerCase()})` : 'Commissions perçues'}</p>
      </div>

      <div className="card kpi admin-kpi-card">
        <p className="kpi__label">Fonds sous séquestre</p>
        <p className="kpi__value">{formatEuros(metrics.escrowCents)}</p>
        <p className="kpi__note">Réparations en attente de libération</p>
      </div>

      <div className="card kpi admin-kpi-card">
        <p className="kpi__label">Remboursements émis</p>
        <p className="kpi__value">{formatEuros(metrics.refundedCents)}</p>
        <p className="kpi__note">{periodNote ? `Total remboursé (${periodNote.toLowerCase()})` : 'Total remboursé aux clients'}</p>
      </div>
    </div>
  );
}
