import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RecentActions, fetchRecentAudit, readAuditItems } from '../components/RecentActions';
import type { AdminAuditEntry } from '@revime/shared';

describe('RecentActions Component & Audit Response Reading', () => {
  const sampleEntries: AdminAuditEntry[] = [
    {
      id: 'audit-1',
      actorEmail: 'admin@revime.fr',
      action: 'user.suspend',
      targetType: 'user',
      targetId: 'usr-123',
      statusCode: 200,
      createdAt: '2026-10-17T12:00:00.000Z',
    },
    {
      id: 'audit-2',
      actorEmail: 'admin@revime.fr',
      action: 'commande.refund',
      targetType: 'commande',
      targetId: 'cmd-456',
      statusCode: 200,
      createdAt: '2026-10-17T13:00:00.000Z',
    },
  ];

  const envelope = (items: unknown) => ({ items, total: 2, page: 1, pageSize: 20, totalPages: 1 });

  describe('readAuditItems', () => {
    it('unpacks the items of the AdminAuditListResponse envelope /admin/audit returns', () => {
      const result = readAuditItems(envelope(sampleEntries));
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('audit-1');
      expect(result[1]?.id).toBe('audit-2');
    });

    it('returns an empty list for an envelope that really is empty', () => {
      expect(readAuditItems({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 })).toEqual([]);
    });

    // 🛑 The whole point: a body that is not the envelope must FAIL (the caller shows
    // « Impossible de charger »), never coalesce into « Aucune action enregistrée ».
    it.each([
      ['a raw array (the pre-0449f517 shape, no longer produced)', sampleEntries],
      ['null', null],
      ['undefined', undefined],
      ['an empty object', {}],
      ['items that are not an array', { items: 'not an array' }],
      ['items null', { items: null }],
      ['a string', 'string error'],
    ])('throws instead of reading %s as an empty log', (_label, body) => {
      expect(() => readAuditItems(body)).toThrow();
    });
  });

  describe('fetchRecentAudit', () => {
    const answer = (ok: boolean, body: unknown, status = 200) =>
      vi.fn(async () => ({ ok, status, json: async () => body }) as Response);

    it('asks for the twenty newest entries and returns the items of the envelope', async () => {
      const f = answer(true, envelope(sampleEntries));
      await expect(fetchRecentAudit(f)).resolves.toEqual(sampleEntries);
      expect(f).toHaveBeenCalledWith('/api/proxy/admin/audit?limit=20');
    });

    it('rejects on a non-OK answer, so the block shows the error state', async () => {
      await expect(fetchRecentAudit(answer(false, envelope([]), 500))).rejects.toThrow('500');
    });

    it('rejects on a 200 whose body is a raw array (the crash this block had)', async () => {
      await expect(fetchRecentAudit(answer(true, sampleEntries))).rejects.toThrow();
    });
  });

  describe('RecentActions rendering', () => {
    it('renders audit rows when initialEntries are provided', () => {
      const html = renderToString(<RecentActions initialEntries={sampleEntries} />);
      expect(html).toContain('<table class="table"');
      expect(html).toContain('admin@revime.fr');
      expect(html).toContain('Suspension');
      expect(html).toContain('Remboursement');
      expect(html).toContain('Réussie');
    });

    it('renders empty message when initialEntries is empty', () => {
      const html = renderToString(<RecentActions initialEntries={[]} />);
      expect(html).toContain('Aucune action enregistrée pour le moment.');
      expect(html).not.toContain('<table');
    });

    it('renders loading state when mounted without initialEntries', () => {
      const html = renderToString(<RecentActions />);
      expect(html).toContain('Chargement des actions...');
    });
  });
});
