import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { OFFER_UNANSWERED_AFTER_DAYS, type AdminOffreListItem, type AdminOffreListResponse } from '@revime/shared';
import { formatEuros } from '../lib/money';

let stateCallIndex = 0;
let mockStateMap: Record<number, any> = {};

function setPageTestState(view: any) {
  mockStateMap = {
    0: view, // index 0 is `view` state
  };
}

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initial: any) => {
      const idx = stateCallIndex++;
      if (idx in mockStateMap) {
        return [mockStateMap[idx], vi.fn()];
      }
      return actual.useState(initial);
    },
  };
});

import OffresPage from '../app/offres/page';

function makeMockOffer(overrides: Partial<AdminOffreListItem> = {}): AdminOffreListItem {
  return {
    offerId: 'off-1',
    demandeId: 'dem-1',
    demandeTitle: 'Réparation MacBook Pro',
    repairerUserId: 'rep-1',
    repairerName: 'Atelier Express',
    repairerKind: 'PROFESSIONNEL',
    repairerRating: 4.8,
    repairerReviewCount: 12,
    priceCents: 6500,
    delayHours: 48,
    warrantyLabel: '6 mois',
    partsLabel: 'Pièces d\'origine',
    travel: 'WORKSHOP',
    acceptsParcel: false,
    comment: 'Devis sous réserve de diagnostic complet.',
    status: 'SENT',
    withdrawn: false,
    deletedReason: null,
    deletedByUserId: null,
    revision: { position: 1, total: 1 },
    conversationReportCount: 0,
    createdAt: new Date().toISOString(),
    demandeBudgetCents: null,
    isOverBudget: false,
    overBudgetCents: null,
    isUnanswered: false,
    hasPendingPaymentOrder: false,
    ...overrides,
  };
}

describe('P10: /offres — Over-Budget Warnings, Expiration Badges & Pending Payment Order', () => {
  beforeEach(() => {
    stateCallIndex = 0;
    mockStateMap = {};
  });

  describe('Over-Budget Warning Pill', () => {
    it('renders amber warning pill beside price when offer exceeds demande budget', () => {
      stateCallIndex = 0;
      const overBudgetCents = 1500;
      const offer = makeMockOffer({
        priceCents: 6500,
        demandeBudgetCents: 5000,
        isOverBudget: true,
        overBudgetCents,
      });

      const response: AdminOffreListResponse = {
        items: [offer],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      setPageTestState({ state: 'loaded', data: response });
      const html = renderToString(<OffresPage />);

      expect(html).toContain('lucide-triangle-alert');
      expect(html).toContain('Dépasse le budget');
      expect(html).toContain(formatEuros(overBudgetCents));
      expect(html).toContain('var(--badge-warning-bg)');
      expect(html).toContain('var(--badge-warning-text)');
      expect(html).toContain('var(--badge-warning-border)');
    });

    it('does NOT render over-budget warning pill when offer is within budget', () => {
      stateCallIndex = 0;
      const offer = makeMockOffer({
        priceCents: 5000,
        demandeBudgetCents: 5000,
        isOverBudget: false,
      });

      const response: AdminOffreListResponse = {
        items: [offer],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      setPageTestState({ state: 'loaded', data: response });
      const html = renderToString(<OffresPage />);

      expect(html).not.toContain('Dépasse le budget');
    });
  });

  describe('Unanswered Badge (« Sans réponse »)', () => {
    it('renders the muted « Sans réponse » badge when a SENT offer is unanswered', () => {
      stateCallIndex = 0;
      const offer = makeMockOffer({
        status: 'SENT',
        isUnanswered: true,
      });

      const response: AdminOffreListResponse = {
        items: [offer],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      setPageTestState({ state: 'loaded', data: response });
      const html = renderToString(<OffresPage />);
      const tbody = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';

      expect(tbody).toContain(`Sans réponse (+${OFFER_UNANSWERED_AFTER_DAYS} j)`);
      expect(tbody).toContain('var(--badge-neutral-bg)');
      expect(tbody).toContain('#6b7280');
      // Should not render the active 'Envoyée' badge in the table row
      expect(tbody).not.toContain('>Envoyée<');
    });

    it('renders standard « Envoyée » badge when a SENT offer is not unanswered', () => {
      stateCallIndex = 0;
      const offer = makeMockOffer({
        status: 'SENT',
        isUnanswered: false,
      });

      const response: AdminOffreListResponse = {
        items: [offer],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      setPageTestState({ state: 'loaded', data: response });
      const html = renderToString(<OffresPage />);
      const tbody = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';

      expect(tbody).toContain('>Envoyée<');
      expect(tbody).not.toContain(`Sans réponse (+${OFFER_UNANSWERED_AFTER_DAYS} j)`);
    });
  });

  describe('Pending Payment Order Badge (« Acceptée — paiement en attente »)', () => {
    it('renders amber « Acceptée — paiement en attente » badge when offer has pending payment order', () => {
      stateCallIndex = 0;
      const offer = makeMockOffer({
        status: 'ACCEPTED',
        hasPendingPaymentOrder: true,
      });

      const response: AdminOffreListResponse = {
        items: [offer],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      setPageTestState({ state: 'loaded', data: response });
      const html = renderToString(<OffresPage />);
      const tbody = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';

      expect(tbody).toContain('Acceptée — paiement en attente');
      expect(tbody).toContain('var(--badge-warning-bg)');
      expect(tbody).toContain('var(--badge-warning-text)');
      expect(tbody).toContain('var(--badge-warning-border)');
      // Should not render the simple 'Acceptée' badge in the table row
      expect(tbody).not.toContain('>Acceptée<');
    });

    it('renders standard green « Acceptée » badge when payment is completed (no pending payment order)', () => {
      stateCallIndex = 0;
      const offer = makeMockOffer({
        status: 'ACCEPTED',
        hasPendingPaymentOrder: false,
      });

      const response: AdminOffreListResponse = {
        items: [offer],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      setPageTestState({ state: 'loaded', data: response });
      const html = renderToString(<OffresPage />);
      const tbody = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';

      expect(tbody).toContain('>Acceptée<');
      expect(tbody).not.toContain('Acceptée — paiement en attente');
    });
  });
});
