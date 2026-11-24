import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AssigneePicker, assignDisputeToUser, unassignDisputeUser } from '../components/AssigneePicker';
import { DisputeQueueTable } from '../app/litiges/DisputeQueueTable';
import LitigesPage, { buildLitigesQueryString, fetchDisputesQueue } from '../app/litiges/page';
import type { AdminDisputeListItem } from '@revime/shared';

// Mock next/navigation
let mockSearchParamsGet = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsGet(key),
  }),
  usePathname: () => '/litiges',
}));

describe('P17 — Litiges: Team Member Assignment & "Mes dossiers" Filter', () => {
  const originalFetch = global.fetch;
  let fetchCalls: Array<{ url: string; options?: RequestInit }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    fetchCalls = [];
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      fetchCalls.push({ url, options });
      if (url.includes('/api/proxy/admin/litiges/assignees')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 'usr-1', name: 'Alice Admin', email: 'alice@revime.fr', role: 'admin' },
              { id: 'usr-2', name: 'Bob Support', email: 'bob@revime.fr', role: 'support' },
            ]),
        });
      }
      if (url.includes('/api/proxy/admin/litiges')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [],
              total: 0,
              page: 1,
              pageSize: 25,
              openCount: 0,
              inReviewCount: 0,
              resolvedCount: 0,
            }),
        });
      }
      if (url.includes('/api/proxy/admin/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: { id: 'usr-me' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. « Mes dossiers » Filter Tab in /litiges', () => {
    it('renders « Mes dossiers » tab and marks it active when status is MINE', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'status') return 'MINE';
        return null;
      });

      const html = renderToString(<LitigesPage />);

      // Verify « Mes dossiers » tab is rendered and active
      expect(html).toContain('Mes dossiers');
      expect(html).toContain('data-testid="tab-mine"');
      expect(html).toContain('border-bottom:2px solid var(--navy, #25324f)');
    });

    it('renders « Mes dossiers » tab as active when onlyMine=true in search params', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'onlyMine') return 'true';
        return null;
      });

      const html = renderToString(<LitigesPage />);

      expect(html).toContain('Mes dossiers');
      expect(html).toContain('data-testid="tab-mine"');
      expect(html).toContain('border-bottom:2px solid var(--navy, #25324f)');
    });

    it('buildLitigesQueryString includes onlyMine=true and omits status=MINE', () => {
      const qs = buildLitigesQueryString({ status: 'MINE', page: 1, pageSize: 25 });
      expect(qs).toContain('onlyMine=true');
      expect(qs).not.toContain('status=MINE');
    });

    it('toggles onlyMine=true in fetch request when status is MINE or onlyMine is true', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [], total: 0 }),
      });

      const qs = buildLitigesQueryString({ onlyMine: true });
      await fetchDisputesQueue(qs, mockFetch as any);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/proxy/admin/litiges?onlyMine=true'),
      );
    });
  });

  describe('2. <AssigneePicker /> Component Rendering', () => {
    it('renders assignees dropdown and « M\'assigner » button when dispute is unassigned', () => {
      const html = renderToString(
        <AssigneePicker
          disputeId="disp-17"
          currentAssigneeId={null}
          currentAssigneeName={null}
          currentUserId="usr-me"
        />,
      );

      expect(html).toContain('data-testid="assignee-picker"');
      expect(html).toContain('data-testid="assignee-select"');
      expect(html).toContain('Non assigné');
      expect(html).toContain('data-testid="assign-to-me-btn"');
      expect(html).toContain("M&#x27;assigner");
    });

    it('renders current assignee name and hides « M\'assigner » when assigned to current user', () => {
      const html = renderToString(
        <AssigneePicker
          disputeId="disp-17"
          currentAssigneeId="usr-me"
          currentAssigneeName="Moi"
          currentUserId="usr-me"
        />,
      );

      expect(html).toContain('data-testid="assignee-name"');
      expect(html).toContain('lucide-user');
      expect(html).toContain('Moi');
      expect(html).not.toContain('data-testid="assign-to-me-btn"');
    });

    it('renders current assignee name and shows « M\'assigner » when assigned to another user', () => {
      const html = renderToString(
        <AssigneePicker
          disputeId="disp-17"
          currentAssigneeId="usr-other"
          currentAssigneeName="Autre Collaborateur"
          currentUserId="usr-me"
        />,
      );

      expect(html).toContain('data-testid="assignee-name"');
      expect(html).toContain('lucide-user');
      expect(html).toContain('Autre Collaborateur');
      expect(html).toContain('data-testid="assign-to-me-btn"');
      expect(html).toContain("M&#x27;assigner");
    });
  });

  describe('3. Assign & Unassign API Calls', () => {
    it('calls assign API with current user when clicking « M\'assigner »', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const res = await assignDisputeToUser('disp-17', 'usr-me', mockFetch as any);

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/proxy/admin/litiges/disp-17/assign',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigneeUserId: 'usr-me' }),
        }),
      );
    });

    it('calls assign API with target user ID when selecting another staff member', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const res = await assignDisputeToUser('disp-17', 'usr-collab-456', mockFetch as any);

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/proxy/admin/litiges/disp-17/assign',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigneeUserId: 'usr-collab-456' }),
        }),
      );
    });

    it('calls unassign API when désassigner is selected', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const res = await unassignDisputeUser('disp-17', mockFetch as any);

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/proxy/admin/litiges/disp-17/unassign',
        expect.objectContaining({
          method: 'PATCH',
        }),
      );
    });
  });

  describe('4. DisputeQueueTable Integration & Design Tokens', () => {
    const mockItem: AdminDisputeListItem = {
      id: 'disp-row-1',
      commandeId: 'c1234567-0000-0000-0000-000000000001',
      number: 101,
      motif: null,
      status: 'OPEN',
      initiator: 'CLIENT',
      reason: 'Panne persistante',
      clientName: 'Alice',
      clientEmail: 'alice@test.fr',
      repairerName: 'Bob',
      repairerEmail: 'bob@test.fr',
      totalCents: 15000,
      repairCents: 12000,
      assignedToUserId: null,
      assignedToName: null,
      createdAt: '2026-10-14T10:00:00.000Z',
      resolvedAt: null,
      verdict: null,
      commandeStatus: null,
    };

    it('mounts <AssigneePicker /> in column 7 and uses Bleu Ink for action button', () => {
      const html = renderToString(
        <DisputeQueueTable
          items={[mockItem]}
          onOpenDossier={vi.fn()}
          currentUserId="usr-me"
        />,
      );

      // Verify AssigneePicker mounted
      expect(html).toContain('data-testid="assignee-picker"');
      expect(html).toContain('data-testid="assign-to-me-btn"');

      // Verify "Examiner le dossier" button uses Bleu Ink var(--navy, #25324f) and NOT #141414
      expect(html).toContain('Examiner le dossier');
      expect(html).toContain('background-color:var(--navy, #25324f)');
      expect(html).not.toMatch(/background-color:(var\(--accent,\s*)?#141414/);
    });
  });
});
