import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { formatKpiCount, type AdminOverview, type KpiValue } from '@revime/shared';
import { DashboardOverview } from '../components/DashboardOverview';

/** V8 E1, criterion 8: how many repairers finished their setup, and how many have not. */
const v = (value: number): KpiValue => ({ kind: 'value', value });

const base: AdminOverview = {
  pendingActions: { litiges: 0, verifications: 0, signalements: 0, annulations: 0, attention: 0, stalePayments: 0 },
  users: { total: v(1001), recent: v(1002), active: v(1003), suspended: v(1004) },
  repairers: { total: v(2001), verified: v(2002), pendingVerification: v(2003), suspended: v(2004) },
  demandes: { published: v(3001), inProgress: v(3002), done: v(3003) },
  offers: { sent: v(4001), accepted: v(4002), rejected: v(4003), withdrawn: v(4004) },
  payments: { volumeCents: v(500000), commissionCents: v(60000), pending: v(5003), refunded: v(5004) },
  disputes: { open: v(6001), inReview: v(6002), closed: v(6003) },
  trends30d: { revenue: [], demandes: [] },
  context: { demoAccounts: 0, testFixtureAccounts: 0, stripeTestMode: false, recentWindowDays: 30 },
};

/** The tile's own markup: from its label to the end of its element. */
const tile = (html: string, label: string): string => {
  const at = html.indexOf(`>${label}</p>`);
  expect(at, `no tile labelled « ${label} »`).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<div class="kpi', at);
  return html.slice(start, html.indexOf('</div>', at));
};

describe('V8 E1: setup tiles in « Réparateurs »', () => {
  it('shows « Configuration terminée » and « Configuration en cours » with their values', () => {
    const html = renderToString(
      <DashboardOverview
        o={{ ...base, repairers: { ...base.repairers, setupComplete: v(2005), setupIncomplete: v(2006) } }}
      />,
    );
    expect(tile(html, 'Configuration terminée')).toContain(formatKpiCount(v(2005)));
    expect(tile(html, 'Configuration en cours')).toContain(formatKpiCount(v(2006)));
    // In the Réparateurs group, after « Inscrits ».
    expect(html.indexOf('>Configuration terminée</p>')).toBeGreaterThan(html.indexOf('>Inscrits</p>'));
  });

  it('an API without the two figures shows both tiles unavailable, never a crash', () => {
    const html = renderToString(<DashboardOverview o={base} />);
    expect(tile(html, 'Configuration terminée')).toContain('Non disponible');
    expect(tile(html, 'Configuration en cours')).toContain('Non disponible');
  });
});
