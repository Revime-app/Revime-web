import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminRefundListResponse } from '@revime/shared';

const loaded: AdminRefundListResponse = {
  total: 2,
  page: 1,
  pageSize: 25,
  summary: { totalRefundedCents: 13000, count: 2, averageRefundCents: 6500 },
  items: [
    {
      commandeId: 'aaaaaaaa-1111-2222-3333-444444444444',
      orderNumber: 'CMD-AAAAAAAA',
      date: '2026-10-14T10:00:00.000Z',
      clientName: 'Alice Martin',
      repairerName: 'Atelier Bob',
      refundedCents: 8500,
      motif: 'CLIENT_CANCELLED',
      status: 'FULL',
      stripeRefundId: 're_123456789_stripe',
    },
    {
      commandeId: 'bbbbbbbb-1111-2222-3333-444444444444',
      orderNumber: 'CMD-BBBBBBBB',
      date: '2026-10-13T10:00:00.000Z',
      clientName: 'Charles Dubois',
      repairerName: 'Atelier Denise',
      refundedCents: 4500,
      motif: 'REPAIR_NOT_DONE',
      status: 'PARTIAL',
      stripeRefundId: null,
    },
  ],
};

// `view` is the first piece of state the component declares: show the loaded list without a fetch.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let calls = 0;
  return {
    ...actual,
    useState: (initial: unknown) => {
      calls += 1;
      return calls === 1 ? [{ state: 'loaded', data: loaded }, vi.fn()] : actual.useState(initial);
    },
  };
});

import { RefundsList } from '../app/remboursements/RefundsList';

describe('P13: the loaded refunds list', () => {
  const html = renderToString(<RefundsList onOpen={vi.fn()} />).replace(/<!-- -->/g, '');

  it('shows the period banner from the API summary, above the table', () => {
    expect(html).toContain('data-testid="refunds-kpi-banner"');
    expect(html).toContain('130,00');
    expect(html).toContain('65,00');
    expect(html.indexOf('refunds-kpi-banner')).toBeLessThan(html.indexOf('<table'));
  });

  it('has an ID Stripe column whose id opens that refund on the Stripe dashboard in a new tab', () => {
    expect(html).toContain('ID Stripe');
    expect(html).toContain('href="https://dashboard.stripe.com/refunds/re_123456789_stripe"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('never turns a Stripe id into a link to a commande', () => {
    expect(html).not.toContain('/commandes/re_');
  });

  it('keeps the commande reference linked to its payment', () => {
    expect(html).toContain('href="/paiements?commande=aaaaaaaa-1111-2222-3333-444444444444"');
  });
});
