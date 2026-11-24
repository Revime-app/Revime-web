import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { formatKpiCount, type AdminOverview, type KpiValue } from '@revime/shared';
import { KpiTile } from '../components/KpiTile';
import { DashboardOverview } from '../components/DashboardOverview';

const v = (value: number, mom?: number | null): KpiValue => ({
  kind: 'value',
  value,
  ...(mom !== undefined ? { mom } : {}),
});

/** A full overview, every figure distinct so a tile bound to the wrong field shows. */
const overview: AdminOverview = {
  pendingActions: { litiges: 4, verifications: 2, signalements: 1, annulations: 3, attention: 5, stalePayments: 7 },
  users: { total: v(1001), recent: v(1002), active: v(1003), suspended: v(1004) },
  repairers: {
    total: v(2001),
    verified: v(2002),
    pendingVerification: v(2003),
    suspended: v(2004),
    // V8 E1: the current API always sends these (older ones omit them, `v8-e1-setup-kpis.spec.tsx`).
    setupComplete: v(2005),
    setupIncomplete: v(2006),
  },
  demandes: { published: v(3001, 8.5), inProgress: v(3002, 0), done: v(3003, -5) },
  offers: { sent: v(4001, 5.2), accepted: v(4002, 12), rejected: v(4003, -2.1), withdrawn: v(4004, null) },
  payments: { volumeCents: v(500000, 3), commissionCents: v(60000), pending: v(5003, 10), refunded: v(5004, 20) },
  disputes: { open: v(6001, 30), inReview: v(6002, -40), closed: v(6003, 50) },
  trends30d: { revenue: [], demandes: [] },
  context: { demoAccounts: 0, testFixtureAccounts: 0, stripeTestMode: false, recentWindowDays: 30 },
};

const tile = (html: string, label: string): string => {
  const at = html.indexOf(`>${label}</p>`);
  expect(at, `no tile labelled « ${label} »`).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<a ', at);
  return html.slice(start, html.indexOf('</a>', at));
};

describe('P2 — KPI Variations & Offers Group Adjustments', () => {
  describe('KpiTile MoM trend badge', () => {
    it('renders a rise with a + prefix, French decimal comma and the green class', () => {
      const html = renderToString(<KpiTile label="Nouveaux" value={v(125, 12.5)} />);
      expect(html).toContain('kpi__trend--positive');
      expect(html).toContain('+12,5 % vs 30j préc.');
    });

    it('renders a fall with the red class', () => {
      const html = renderToString(<KpiTile label="Demandes" value={v(80, -4.2)} />);
      expect(html).toContain('kpi__trend--negative');
      expect(html).toContain('-4,2 % vs 30j préc.');
    });

    it('colours a rise red and a fall green when a rise is bad news', () => {
      const up = renderToString(<KpiTile label="Litiges" value={v(5, 30)} badWhenUp />);
      expect(up).toContain('kpi__trend--negative');
      expect(up).toContain('+30');
      const down = renderToString(<KpiTile label="Litiges" value={v(5, -30)} badWhenUp />);
      expect(down).toContain('kpi__trend--positive');
    });

    it('shows no variation when there is none to compare with (null or absent)', () => {
      for (const value of [v(3, null), v(3)]) {
        const html = renderToString(<KpiTile label="Comptes" value={value} />);
        expect(html).not.toContain('kpi__trend');
        expect(html).not.toContain('vs 30j préc.');
      }
    });

    it('treats 0 % as a variation, not as none', () => {
      const html = renderToString(<KpiTile label="En cours" value={v(22, 0)} />);
      expect(html).toContain('kpi__trend--positive');
      expect(html).toContain('0 % vs 30j préc.');
    });
  });

  describe('the dashboard as rendered', () => {
    const html = renderToString(<DashboardOverview o={overview} />);

    it('lists four offer tiles, « Non retenues » on the REJECTED figure and the REJECTED list', () => {
      const group = html.slice(html.indexOf('>Offres<'), html.indexOf('>Paiements<'));
      for (const label of ['Envoyées', 'Acceptées', 'Non retenues', 'Retirées']) expect(group).toContain(`>${label}</p>`);
      // « Refusées » would be a second tile on the same rows, and an invented « unselected » link opens nothing.
      expect(group).not.toContain('Refusées');
      expect(group).not.toContain('unselected');
      const nonRetenues = tile(html, 'Non retenues');
      expect(nonRetenues).toContain('href="/offres?status=REJECTED"');
      expect(nonRetenues).toContain(`>${formatKpiCount(overview.offers.rejected)}<`);
    });

    it('renders the « À traiter » block above the groups and the two 30-day charts', () => {
      expect(html).toContain('id="pending-actions-title"');
      expect(html.indexOf('pending-actions-title')).toBeLessThan(html.indexOf('>Utilisateurs<'));
      expect(html).toContain('charts-grid');
    });

    it('has no « Expirées » or « Non applicable » tile', () => {
      expect(html).not.toContain('Expirées');
      expect(html).not.toContain('Non applicable');
    });

    it('links Publiées to the visible demandes', () => {
      expect(tile(html, 'Publiées')).toContain('href="/demandes?etat=visible"');
    });

    it('colours the variation of open disputes, refunds and waiting payments red when they rise', () => {
      for (const label of ['Ouverts', 'Remboursements', 'Paiements en attente']) {
        expect(tile(html, label), label).toContain('kpi__trend--negative');
      }
      // A fall in disputes under review is good news; closed disputes rising is good news.
      expect(tile(html, 'En cours de traitement')).toContain('kpi__trend--positive');
      expect(tile(html, 'Clôturés')).toContain('kpi__trend--positive');
      // A rise in accepted offers is good news.
      expect(tile(html, 'Acceptées')).toContain('kpi__trend--positive');
    });
  });
});
