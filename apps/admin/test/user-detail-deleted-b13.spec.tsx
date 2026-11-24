import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RepairerBlock } from '../components/RepairerBlock';
import { StaffControls } from '../components/StaffControls';
import type { AdminRepairerBlock, AdminUserStatus } from '@revime/shared';

vi.mock('../components/AdminGate', () => ({
  useAdminMe: () => ({
    role: 'super_admin',
    permissions: ['verification.decide', 'users.moderate', 'admin.manage'],
    twoFactorVerified: true,
  }),
}));

vi.mock('../lib/auth-client', () => ({
  useSession: () => ({
    data: { user: { id: 'admin-1', role: 'super_admin' } },
  }),
}));

describe('Bug B13: User Detail for deleted account', () => {
  const dummyBlock: AdminRepairerBlock = {
    displayName: 'Utilisateur supprimé',
    kind: 'PRO',
    bio: null,
    postalCode: null,
    serviceAreaLabel: null,
    serviceRadiusKm: null,
    repairerEnabled: true,
    publicBadge: 'IDENTITY',
    suspension: null,
    revocation: null,
    identity: {
      status: 'CANCELED',
      verifiedAt: null,
      lastErrorCode: null,
      variant: 'DOCUMENT_AND_SELFIE',
      redactionStatus: 'PROCESSING',
      erasureRequestedAt: '2026-10-09T10:00:00.000Z',
      selfieFraudSignalAt: null,
    },
    business: null,
    connectStatus: null,
    counts: { liveOffers: 0, hiddenLiveOffers: 0 },
  };

  const deletedStatus: AdminUserStatus = {
    kind: 'deleted',
    at: '2026-10-09T10:00:00.000Z',
  };

  it('RepairerBlock: suppresses révoquer and suspendre actions when account is deleted', () => {
    const html = renderToString(
      <RepairerBlock
        id="user-deleted-1"
        block={dummyBlock}
        status={deletedStatus}
        busy={false}
        act={vi.fn()}
        setError={vi.fn()}
      />,
    );

    // Bug B13: No active moderation/verification buttons for a deleted user
    expect(html).not.toContain('Révoquer la vérification');
    expect(html).not.toContain('Suspendre le mode réparateur');
    expect(html).not.toContain('Annuler la révocation');
    expect(html).not.toContain('Lever la suspension');
    // Public badge must not show "Réparateur vérifié"
    expect(html).not.toContain('Réparateur vérifié');
    expect(html).toContain('Aucun');
    // Bug B13 Review: Must NOT show false "réactivation ci-dessous" warning on deleted user
    expect(html).not.toContain('désactivé sur ce compte - la réactivation ci-dessous');
  });

  it('StaffControls: does not render role controls for a deleted user', () => {
    const html = renderToString(
      <StaffControls
        id="user-deleted-1"
        staffRole={null}
        status={deletedStatus}
        onDone={vi.fn()}
        setError={vi.fn()}
      />,
    );

    // Bug B13: Deleted user must not show role assignment controls
    expect(html).not.toContain('Enregistrer le rôle');
    expect(html).not.toContain('Rôle dans l&#x27;équipe');
    expect(html).not.toContain('Rôle dans l\'équipe');
  });

  it('RepairerBlock: displays translated French label for redaction status', () => {
    const redactedBlock: AdminRepairerBlock = {
      ...dummyBlock,
      identity: {
        ...dummyBlock.identity!,
        redactionStatus: 'REDACTED',
      },
    };

    const html = renderToString(
      <RepairerBlock
        id="user-deleted-1"
        block={redactedBlock}
        status={deletedStatus}
        busy={false}
        act={vi.fn()}
        setError={vi.fn()}
      />,
    );

    // Human-readable French label instead of raw REDACTED
    expect(html).toContain('Supprimé (effacé)');
  });
});
