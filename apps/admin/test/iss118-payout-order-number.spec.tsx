import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { orderNumberFor, type AdminPayoutListItem } from '@revime/shared';
import { PayoutsTable } from '../components/PayoutsTable';
import { PayoutDetailDrawer } from '../components/PayoutDetailDrawer';
import { PayoutRetryModal } from '../components/PayoutRetryModal';

// The API fills `orderNumber` with orderNumberFor(), which already carries the « # ».
const orderNumber = orderNumberFor('ba9332d2-aaaa-bbbb-cccc-000000000000');

const item: AdminPayoutListItem = {
  id: 'ba9332d2-aaaa-bbbb-cccc-000000000000',
  orderNumber,
  createdAt: '2026-10-15T10:00:00.000Z',
  paidAt: '2026-10-15T10:05:00.000Z',
  releasedAt: null,
  amountCents: 8500,
  totalOrderCents: 10000,
  commissionCents: 1500,
  status: 'FAILED',
  repairerId: 'usr_rep_2',
  repairerName: 'Docteur Smartphone',
  repairerEmail: 'doc@smartphone.fr',
  stripeAccountId: 'acct_0987654321',
  transfersActive: false,
  stripeTransferId: null,
  stripeChargeId: 'ch_2M9ABCDEFGH1234567',
  failureReason: 'Compte Stripe restreint (KYC incomplet)',
  canRetry: true,
};

/** React puts a comment between adjacent text nodes (`#<!-- -->#CMD`): look at the text the operator reads. */
const text = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

describe('ISS-118 / FND-634: an order number is printed with one hash', () => {
  it('has the shape the API sends', () => {
    expect(orderNumber).toBe('#CMD-BA9332D2');
  });

  it('prints it once in the payouts table', () => {
    const html = renderToString(
      <PayoutsTable items={[item]} total={1} page={1} pageSize={25} totalPages={1} onPageChange={() => {}} onInspect={() => {}} onRetry={() => {}} />,
    );
    expect(text(html)).toContain('#CMD-BA9332D2');
    expect(text(html)).not.toContain('##');
  });

  it('prints it once in the detail drawer', () => {
    const html = renderToString(<PayoutDetailDrawer isOpen item={item} onClose={() => {}} />);
    expect(text(html)).toContain('#CMD-BA9332D2');
    expect(text(html)).not.toContain('##');
  });

  it('prints it once in the retry modal', () => {
    const html = renderToString(<PayoutRetryModal isOpen item={item} onClose={() => {}} onConfirm={() => {}} />);
    expect(text(html)).toContain('#CMD-BA9332D2');
    expect(text(html)).not.toContain('##');
  });
});
