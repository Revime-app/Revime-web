import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminReportDetailDto, AdminReportListResponse } from '@revime/shared';
import { ReportTargetPreview } from '../components/ReportTargetPreview';
import SignalementDetailPage from '../app/signalements/[id]/page';
import SignalementsPage from '../app/signalements/page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'rep-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn() }),
  usePathname: () => '/signalements/rep-1',
}));

vi.mock('../components/AdminGate', () => ({
  useAdminMe: () => ({ role: 'super_admin', permissions: ['content.moderate', 'reports.handle'], twoFactorVerified: true }),
}));

const TOMBSTONE = 'deleted+usr-gone@revime.invalid';

describe('RU-16 UI7: a deleted account reads « Utilisateur supprimé » alone on the report pages', () => {
  it('the list never prints the tombstone address', () => {
    const data: AdminReportListResponse = {
      total: 1, page: 1, pageSize: 20, totalPages: 1,
      counts: { open: 1, resolved: 0, total: 1 },
      items: [{
        id: 'item-1', conversationId: 'c-1', reason: 'SPAM', gravity: 'MEDIUM', gravityLabel: 'Moyenne',
        reasonLabel: 'Message indésirable', targetType: 'USER', createdAt: '2026-10-14T08:10:00.000Z',
        resolvedAt: null, resolutionVerdict: null,
        reporter: { id: 'u1', name: 'Utilisateur supprimé', email: TOMBSTONE },
        reported: { id: 'u2', name: 'Utilisateur supprimé', email: TOMBSTONE },
        demande: null, assignedTo: null, conversationClosed: false,
      }],
    };
    const html = renderToString(<SignalementsPage initialData={data} />);
    expect(html).toContain('Utilisateur supprimé');
    expect(html).not.toContain('revime.invalid');
  });

  it('the detail page never prints it, for either party', () => {
    const report = {
      id: 'rep-1', conversationId: 'conv-1', reason: 'SPAM', reasonLabel: 'Message indésirable',
      gravity: 'MEDIUM', gravityLabel: 'Moyenne', targetType: 'USER', likelyReportedMessageId: null,
      targetEntitySummary: { id: 'u2', targetType: 'USER', title: 'Profil', name: 'Utilisateur supprimé', email: TOMBSTONE },
      createdAt: '2026-10-14T09:00:00.000Z', resolvedAt: null, resolutionVerdict: null,
      resolutionVerdictLabel: null, resolutionNote: null, assignedTo: null, resolvedBy: null,
      reporter: { id: 'u1', name: 'Utilisateur supprimé', email: TOMBSTONE, createdAt: '2026-01-01T00:00:00.000Z', reportsCount: 0 },
      reported: {
        id: 'u2', name: 'Utilisateur supprimé', email: TOMBSTONE, createdAt: '2026-01-01T00:00:00.000Z',
        role: 'client', banned: false, repairerSuspended: false, reportsReceivedCount: 1,
      },
      conversation: { id: 'conv-1', closed: false, demande: { id: 'd1', title: 'Écran' }, messages: [] },
    } as unknown as AdminReportDetailDto;
    const html = renderToString(<SignalementDetailPage initialReport={report} />);
    expect(html).toContain('Utilisateur supprimé');
    expect(html).not.toContain('revime.invalid');
  });

  it('the target preview never prints it', () => {
    const html = renderToString(
      <ReportTargetPreview
        targetType="USER"
        targetEntitySummary={{ id: 'u2', targetType: 'USER', title: 'Profil', name: 'Utilisateur supprimé', email: TOMBSTONE }}
      />,
    );
    expect(html).not.toContain('revime.invalid');
  });
});
