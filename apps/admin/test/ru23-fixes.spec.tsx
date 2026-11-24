import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { AdminCategoryTreeItem, AdminStatsOverviewDto } from '@revime/shared';
import { dropMove, moveAndRenumber } from '../lib/category-drag';
import { CategoryTaxonomyView } from '../app/categories/CategoryTaxonomyView';
import { FinancialTrendsChart } from '../app/statistiques/FinancialTrendsChart';
import { LEADERBOARD_SIZE, RepairerLeaderboardView } from '../app/statistiques/RepairerLeaderboardView';

describe('P22: drag-and-drop decision (dropMove)', () => {
  const group = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('moves a row to the position of the row it is dropped on, inside its own group', () => {
    expect(dropMove(group, 'a', 'c')).toEqual({ from: 0, to: 2 });
    expect(dropMove(group, 'c', 'a')).toEqual({ from: 2, to: 0 });
  });

  it('is not a move when nothing is dragged, when dropped on itself, or across groups', () => {
    expect(dropMove(group, null, 'b')).toBeNull();
    expect(dropMove(group, 'b', 'b')).toBeNull();
    expect(dropMove(group, 'x', 'b')).toBeNull(); // dragged from another group
    expect(dropMove(group, 'a', 'x')).toBeNull(); // dropped on another group
  });
});

describe('P22: a move renumbers the group like the API does', () => {
  const rows = [
    { id: 'a', sortOrder: 5 },
    { id: 'b', sortOrder: 5 }, // a duplicate, as in production
    { id: 'c', sortOrder: 8 },
  ];

  it('moves the row and numbers the whole group 10, 20, 30', () => {
    expect(moveAndRenumber(rows, 2, 0)).toEqual([
      { id: 'c', sortOrder: 10 },
      { id: 'a', sortOrder: 20 },
      { id: 'b', sortOrder: 30 },
    ]);
  });

  it('removes the duplicates even for a one-step move, and leaves the input untouched', () => {
    const moved = moveAndRenumber(rows, 0, 1);
    expect(moved.map((r) => r.sortOrder)).toEqual([10, 20, 30]);
    expect(rows.map((r) => r.sortOrder)).toEqual([5, 5, 8]);
  });
});

describe('P22: the taxonomy rows can be dragged', () => {
  const sub = (id: string, parentId: string, sortOrder: number): AdminCategoryTreeItem => ({
    id,
    parentId,
    slug: id,
    labelFr: id,
    icon: null,
    description: null,
    active: true,
    sortOrder,
    demandesCount: 0,
    repairersCount: 0,
    children: [],
  });
  const tree: AdminCategoryTreeItem[] = [
    { ...sub('root-1', null as unknown as string, 10), parentId: null, children: [sub('sub-1', 'root-1', 10), sub('sub-2', 'root-1', 20)] },
    { ...sub('root-2', null as unknown as string, 20), parentId: null },
  ];

  it('renders every root and subcategory row as draggable, next to the up/down buttons', () => {
    const html = renderToString(<CategoryTaxonomyView initialCategories={tree} />);
    for (const id of ['root-1', 'root-2', 'sub-1', 'sub-2']) {
      expect(html).toMatch(new RegExp(`<tr[^>]*data-testid="category-row-${id}"[^>]*draggable="true"|<tr[^>]*draggable="true"[^>]*data-testid="category-row-${id}"`));
    }
    // the keyboard path stays
    expect(html).toContain('Monter');
  });
});

describe('P24: the two series of the activity chart are two colours', () => {
  const timeseries: AdminStatsOverviewDto['timeseries'] = {
    registrations: [
      { date: '2026-05-01', label: '1 mai', clients: 8, repairers: 2, total: 10 },
      { date: '2026-05-02', label: '2 mai', clients: 12, repairers: 3, total: 15 },
    ],
    activity: [
      { date: '2026-05-01', label: '1 mai', demandes: 450, offers: 200 },
      { date: '2026-05-02', label: '2 mai', demandes: 600, offers: 320 },
    ],
    financials: [
      { date: '2026-05-01', label: '1 mai', gmvCents: 150000, commissionCents: 15000, ordersCount: 5 },
      { date: '2026-05-02', label: '2 mai', gmvCents: 220000, commissionCents: 22000, ordersCount: 8 },
    ],
  };

  it('draws Inscriptions and Demandes in different hues', () => {
    const html = renderToString(<FinancialTrendsChart timeseries={timeseries} initialMode="activity" />);
    expect(html).toContain('var(--badge-info-text)');
    expect(html).toContain('var(--badge-warning-text)');
  });
});

describe('P24: the leaderboard shows ten rows of the sort, from the rows the API sends', () => {
  const rep = (n: number): AdminStatsOverviewDto['topRepairers'][number] => ({
    repairerId: `r${n}`,
    name: `ZZ${String(n).padStart(2, '0')}`,
    businessName: null,
    avatarUrl: null,
    city: null,
    offersSent: 100 - n,
    offersAccepted: 1,
    acceptanceRate: 1,
    totalRevenueCents: n * 100,
    rating: null,
    reviewsCount: 0,
  });

  it('shows the first ten in the default order when the API sent more', () => {
    expect(LEADERBOARD_SIZE).toBe(10);
    const html = renderToString(<RepairerLeaderboardView topRepairers={Array.from({ length: 14 }, (_, i) => rep(i + 1))} />);
    expect(html).toContain('ZZ10');
    expect(html).not.toContain('ZZ11');
  });
});
