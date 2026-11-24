import { describe, expect, it, vi } from 'vitest';
import { NO_ATTENTION } from './no-attention.js';
import { AdminOverviewService } from '../src/admin/admin-overview.service.js';
import {
  BUSINESS_NEEDS_DECISION_WHERE,
  IDENTITY_NEEDS_DECISION_WHERE,
  identityNeedsDecision,
} from '../src/admin/verification-needs-decision.js';

// RU-13 review of B6: « utiliser le même calcul sur le tableau de bord ». The Vérifications list, the dashboard
// tile and the sidebar badge each had their own rule for « an operator can decide here ».

type Facts = Parameters<typeof identityNeedsDecision>[0];
const base: Facts = {
  decision: null,
  status: 'REQUIRES_INPUT',
  verifiedAt: null,
  lastErrorCode: null,
  selfieFraudSignalAt: null,
};

describe('identityNeedsDecision', () => {
  it.each<[string, Partial<Facts>, boolean]>([
    ['a session not started', {}, false],
    ['documents submitted, awaiting a decision', { status: 'PROCESSING' }, true],
    ['documents failed', { lastErrorCode: 'document_unreadable' }, true],
    ['a selfie fraud signal', { selfieFraudSignalAt: new Date() }, true],
    ['a fraud signal on an identity Stripe verified: the operator can still withdraw it', { status: 'VERIFIED', verifiedAt: new Date(), selfieFraudSignalAt: new Date() }, true],
    ['an identity Stripe verified', { status: 'VERIFIED', verifiedAt: new Date() }, false],
    ['a PROCESSING status already stamped verified', { status: 'PROCESSING', verifiedAt: new Date() }, false],
    ['a cancelled session', { status: 'CANCELED' }, false],
    ['an already decided identity, whatever Stripe says', { decision: 'REFUSED', status: 'PROCESSING', selfieFraudSignalAt: new Date() }, false],
  ])('%s', (_name, over, expected) => {
    expect(identityNeedsDecision({ ...base, ...over })).toBe(expected);
  });
});

describe('the dashboard tile and the sidebar badge count what the list lists', () => {
  const makePrisma = () => ({
    $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
    user: { count: vi.fn().mockResolvedValue(0) },
    session: { findMany: vi.fn().mockResolvedValue([]) },
    profile: { count: vi.fn().mockResolvedValue(0) },
    repairerProfile: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) }, // findMany: V8 E1 setup figures
    identityVerification: { count: vi.fn().mockResolvedValue(4) },
    businessVerification: { count: vi.fn().mockResolvedValue(3) },
    demande: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    offer: { count: vi.fn().mockResolvedValue(0) },
    commande: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalCents: 0, protectionCents: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    dispute: { count: vi.fn().mockResolvedValue(0) },
    cancellationRequest: { count: vi.fn().mockResolvedValue(0) },
    conversationReport: { count: vi.fn().mockResolvedValue(0) },
    staffInvitation: { count: vi.fn().mockResolvedValue(0) },
  });

  it('the tile counts identity AND business rows, by the shared rule', async () => {
    const prisma = makePrisma();
    const o = await new AdminOverviewService(prisma as never, NO_ATTENTION as never).overview();

    expect(prisma.identityVerification.count).toHaveBeenCalledWith({ where: IDENTITY_NEEDS_DECISION_WHERE });
    expect(prisma.businessVerification.count).toHaveBeenCalledWith({ where: BUSINESS_NEEDS_DECISION_WHERE });
    expect(o.repairers.pendingVerification).toEqual(expect.objectContaining({ kind: 'value', value: 7 }));
  });

  it('the sidebar badge counts by the same rule, so the two cannot disagree', async () => {
    const prisma = makePrisma();
    const badges = await new AdminOverviewService(prisma as never, NO_ATTENTION as never).getBadgeCounts();

    expect(prisma.identityVerification.count).toHaveBeenCalledWith({ where: IDENTITY_NEEDS_DECISION_WHERE });
    expect(prisma.businessVerification.count).toHaveBeenCalledWith({ where: BUSINESS_NEEDS_DECISION_WHERE });
    expect(badges.verifications).toBe(7);
  });

  it('pins the filters to the cases identityNeedsDecision accepts', () => {
    expect(IDENTITY_NEEDS_DECISION_WHERE.decision).toBeNull();
    expect(IDENTITY_NEEDS_DECISION_WHERE.OR).toEqual([
      { selfieFraudSignalAt: { not: null } },
      { verifiedAt: null, status: 'PROCESSING' },
      { verifiedAt: null, status: 'REQUIRES_INPUT', lastErrorCode: { not: null } },
    ]);
    expect(BUSINESS_NEEDS_DECISION_WHERE.status).toBe('PENDING');
    // The list's population: IDENTITY or BUSINESS level, or any account with an identity session.
    expect(BUSINESS_NEEDS_DECISION_WHERE.user.OR).toEqual([
      { profile: { is: { verificationLevel: { in: ['IDENTITY', 'BUSINESS'] } } } },
      { identityVerification: { isNot: null } },
    ]);
  });

  it('only counts accounts the list shows: a live réparateur profile', () => {
    expect(IDENTITY_NEEDS_DECISION_WHERE.user).toEqual({ profile: { is: { repairerEnabled: true, deletedAt: null } } });
    expect(JSON.stringify(BUSINESS_NEEDS_DECISION_WHERE)).toContain('"repairerEnabled":true');
    expect(JSON.stringify(BUSINESS_NEEDS_DECISION_WHERE)).toContain('"deletedAt":null');
  });
});
