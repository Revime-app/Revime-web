import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminVerificationListItem } from '@revime/shared';
import { VerificationsTableView } from '../app/verifications/VerificationsList';

describe('Bug B6: VerificationsTableView "Décider" button visibility and actionability', () => {
  const mockActionableRow: AdminVerificationListItem = {
    id: 'u1:IDENTITY',
    userId: 'u1',
    date: '2026-08-16T14:00:00.000Z',
    displayName: 'Hamed Klimane',
    username: 'hamed',
    email: 'hamed@example.fr',
    accountKind: 'PRO',
    type: 'IDENTITY',
    status: 'DOCUMENTS_REQUIRED',
    needsAction: true,
    detail: 'Document illisible',
    siren: null,
    siret: null,
    marker: null,
    identity: {
      stripeStatus: 'REQUIRES_INPUT',
      stripeSessionId: 'vs_test_123',
      lastErrorCode: 'document_unverified_other',
      fraudSignal: false,
      decision: null,
      motif: null,
      note: null,
      decidedAt: null,
      decidedBy: null,
    },
  };

  const mockNonActionableRow: AdminVerificationListItem = {
    id: 'u2:IDENTITY',
    userId: 'u2',
    date: '2026-08-16T14:00:00.000Z',
    displayName: 'Camille Legal',
    username: 'camille',
    email: 'camille@example.fr',
    accountKind: 'PRO',
    type: 'IDENTITY',
    status: 'NOT_STARTED',
    needsAction: false,
    detail: null,
    siren: null,
    siret: null,
    marker: null,
    identity: null,
  };

  it('renders "Décider" button for actionable rows and "Voir" link for non-actionable rows via VerificationsTableView', () => {
    const actionableHtml = renderToString(<VerificationsTableView items={[mockActionableRow]} />);
    expect(actionableHtml).toContain('Décider');
    expect(actionableHtml).not.toContain('/utilisateurs/u1');

    const nonActionableHtml = renderToString(<VerificationsTableView items={[mockNonActionableRow]} />);
    expect(nonActionableHtml).not.toContain('Décider');
    expect(nonActionableHtml).toContain('Voir');
    expect(nonActionableHtml).toContain('/utilisateurs/u2');
  });
});
