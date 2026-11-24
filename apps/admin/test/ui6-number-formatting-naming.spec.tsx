import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { formatEuros, formatPercentage, formatCount } from '../lib/money';
import { PaymentsTable } from '../app/paiements/PaymentsTable';
import { PaymentsKpiCards } from '../app/paiements/PaymentsKpiCards';
import { DisputeQueueTable } from '../app/litiges/DisputeQueueTable';
import { OfferComparisonTable } from '../app/offres/OfferComparisonTable';
import type {
  AdminPaymentListItem,
  AdminPaymentMetricsDto,
  AdminDisputeListItem,
  AdminOfferContextDto,
} from '@revime/shared';

// Helper to normalize French non-breaking spaces (\u202F, \u00A0) and React SSR comments
function normalizeSpaces(str: string): string {
  return str.replace(/<!-- -->/g, '').replace(/\u202F|\u00A0/g, ' ');
}

describe('UI6 - Unified Number Formatting & Naming', () => {
  describe('Pillar 1: Amounts Formatting (formatEuros)', () => {
    it('formats amounts with French thousand separators and 2 decimal places with comma', () => {
      // 547283 cents -> "5 472,83 €"
      expect(normalizeSpaces(formatEuros(547283))).toBe('5 472,83 €');

      // Harmonizes former variations 50.00 €, 21 € into standard format
      expect(normalizeSpaces(formatEuros(5000))).toBe('50,00 €');
      expect(normalizeSpaces(formatEuros(2100))).toBe('21,00 €');
      expect(normalizeSpaces(formatEuros(1250))).toBe('12,50 €');
      expect(normalizeSpaces(formatEuros(0))).toBe('0,00 €');
    });

    it('handles nullable and invalid amounts gracefully', () => {
      expect(formatEuros(null)).toBe('—');
      expect(formatEuros(undefined)).toBe('—');
      expect(formatEuros(NaN)).toBe('—');
      expect(formatEuros(null, '0,00 €')).toBe('0,00 €');
    });

    it('formats large counts with thousands separator (formatCount)', () => {
      expect(normalizeSpaces(formatCount(1234567))).toBe('1 234 567');
      expect(formatCount(0)).toBe('0');
      expect(formatCount(null)).toBe('0');
    });
  });

  describe('Pillar 2: Percentage Formatting (formatPercentage)', () => {
    it('formats percentages with French decimal comma and space before %', () => {
      expect(formatPercentage(80)).toBe('80,0 %');
      expect(formatPercentage(80.0)).toBe('80,0 %');
      expect(formatPercentage(12.5)).toBe('12,5 %');
      expect(formatPercentage(0)).toBe('0,0 %');
      expect(formatPercentage(-15.2)).toBe('-15,2 %');
      expect(formatPercentage(null)).toBe('0,0 %');
    });

    it('renders formatted percentages in OfferComparisonTable delta badges', () => {
      const stats: AdminOfferContextDto['stats'] = {
        totalOffers: 2,
        lowestPriceCents: 8000,
        averagePriceCents: 10000,
        highestPriceCents: 12000,
      };

      const competingOffers: AdminOfferContextDto['competingOffers'] = [
        {
          id: 'off-1',
          repairerUserId: 'usr-1',
          repairerName: 'Atelier Express',
          repairerKind: 'PROFESSIONNEL',
          repairerRating: 4.8,
          priceCents: 8000, // -20%
          delayHours: 48,
          warrantyLabel: '12 mois',
          travel: 'WORKSHOP',
          acceptsParcel: false,
          status: 'SENT',
          createdAt: '2026-10-10T10:00:00.000Z',
          isCurrent: true,
        },
        {
          id: 'off-2',
          repairerUserId: 'usr-2',
          repairerName: 'Tech Pro',
          repairerKind: 'PARTICULIER',
          repairerRating: 4.5,
          priceCents: 12000, // +20%
          delayHours: 96,
          warrantyLabel: '6 mois',
          travel: 'HOME',
          acceptsParcel: true,
          status: 'SENT',
          createdAt: '2026-10-10T10:30:00.000Z',
          isCurrent: false,
        },
      ];

      const html = renderToString(
        <OfferComparisonTable
          competingOffers={competingOffers}
          currentOfferId="off-1"
          stats={stats}
        />
      );

      const normalized = normalizeSpaces(html);
      // Delta badges must use standard French format with comma and space
      expect(normalized).toContain('-20,0 %');
      expect(normalized).toContain('+20,0 %');
      // Amounts must use formatEuros
      expect(normalized).toContain('80,00 €');
      expect(normalized).toContain('100,00 €');
      expect(normalized).toContain('120,00 €');
    });
  });

  describe('Pillar 3: Single Word for Commission (Commission / Commissions)', () => {
    it('uses "Commission" in PaymentsTable breakdown tooltips', () => {
      const item: AdminPaymentListItem = {
        id: 'cmd-test-ui6-payment',
        createdAt: '2026-10-10T12:00:00.000Z',
        paidAt: '2026-10-10T12:05:00.000Z',
        status: 'PAID',
        step: 'DELIVERED',
        delivery: 'PARCEL',
        totalCents: 10636,
        repairCents: 8000,
        shippingCents: 2000,
        protectionCents: 636,
        clientName: 'Alice Client',
        clientEmail: 'alice@example.com',
        repairerName: 'Bob Reparateur',
        repairerEmail: 'bob@example.com',
        isDisputed: false,
        disputeId: null,
        disputeStatus: null,
        stripeChargeId: 'ch_test_ui6',
        stripeTransferId: 'tr_test_ui6',
        stripeRefundId: null,
        refundedCents: null,
        cancellationPending: false,
        payoutStatus: 'NOT_APPLICABLE',
        payoutAmountCents: null,
      };

      const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={vi.fn()} />);
      const normalized = normalizeSpaces(html);

      // Must use "• Commission :" and NOT "• Protection :" or "Frais de protection"
      expect(normalized).toContain('• Commission : 6,36 €');
      expect(normalized).not.toContain('• Protection :');
      expect(normalized).not.toContain('Frais de protection');
    });

    it('uses "Commissions perçues" in PaymentsKpiCards note', () => {
      const metrics: AdminPaymentMetricsDto = {
        totalVolumeCents: 547283,
        commissionCents: 63600,
        escrowCents: 450000,
        refundedCents: 33683,
        disputedCount: 2,
      };

      const html = renderToString(<PaymentsKpiCards metrics={metrics} />);
      const normalized = normalizeSpaces(html);

      expect(normalized).toContain('Commissions plateforme');
      expect(normalized).toContain('Commissions perçues');
      expect(normalized).not.toContain('Protection Revime perçue');
      expect(normalized).toContain('5 472,83 €');
      expect(normalized).toContain('636,00 €');
    });

    it('renders amounts cleanly in DisputeQueueTable without redundant € characters', () => {
      const disputeItem: AdminDisputeListItem = {
        id: 'disp-test-ui6',
        number: 101,
        commandeId: 'cmd-test-ui6',
        createdAt: '2026-10-10T12:00:00.000Z',
        status: 'OPEN',
        initiator: 'CLIENT',
        motif: null,
        reason: 'Écran cassé',
        clientName: 'Alice Client',
        clientEmail: 'alice@example.com',
        repairerName: 'Bob Reparateur',
        repairerEmail: 'bob@example.com',
        repairCents: 8000,
        totalCents: 10636,
        assignedToUserId: null,
        assignedToName: null,
        resolvedAt: null,
        verdict: null,
        commandeStatus: null,
      };

      const html = renderToString(
        <DisputeQueueTable
          items={[disputeItem]}
          onOpenDossier={vi.fn()}
        />
      );
      const normalized = normalizeSpaces(html);

      expect(normalized).toContain('106,36 €');
      expect(normalized).toContain('dont 80,00 € prestation');
      // No duplicate "€ €"
      expect(normalized).not.toContain('€ €');
    });
  });
});
