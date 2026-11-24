import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminRefundListResponse } from '@revime/shared';

const loaded: AdminRefundListResponse = {
  total: 60,
  page: 1,
  pageSize: 25,
  summary: { totalRefundedCents: 1000, count: 60, averageRefundCents: 16 },
  items: [
    {
      commandeId: 'aaaaaaaa-1111-2222-3333-444444444444',
      orderNumber: 'CMD-AAAAAAAA',
      date: '2026-09-20T10:00:00.000Z',
      clientName: 'Claire',
      repairerName: 'David',
      refundedCents: 8000,
      motif: null,
      status: 'FULL',
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

describe('RU-16 UI8: the refunds list has the list controls the client asked for', () => {
  it('sorts by column, shows « Page X sur Y » with a row-count choice, and exports CSV', () => {
    const html = renderToString(<RefundsList onOpen={vi.fn()} />).replace(/<!-- -->/g, '');
    for (const key of ['date', 'orderNumber', 'clientName', 'repairerName', 'refundedCents', 'motif', 'status']) {
      expect(html).toContain(`data-testid="sort-${key}"`);
    }
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain('60 remboursements · Page 1 sur 3');
    expect(html).toContain('data-testid="csv-export-button"');
    expect(html).toContain('<select');
  });
});
