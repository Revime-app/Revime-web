import { describe, it, expect } from 'vitest';
import { deriveDisputeTimeline, formatDisputeDate } from '../src/timeline-dispute.js';
import type { CommandeDto } from '../src/commande.schemas.js';

function baseCommande(overrides?: Partial<CommandeDto>): CommandeDto {
  return {
    id: 'cmd-test',
    demandeId: 'dem-test',
    demandeTitle: 'Moitié de l’écran cassé',
    demandeDescription: null,
    delivery: 'HAND_DELIVERY',
    status: 'PAID',
    step: 'REPAIR_STARTED',
    totalCents: 10636,
    payoutCents: 9000,
    paidAt: '2026-10-01T21:01:00.000Z',
    releasedAt: null,
    returnSentAt: null,
    createdAt: '2026-10-01T21:00:00.000Z',
    viewerRole: 'CLIENT',
    disputeOpen: false,
    disputeOpenedAt: null,
    stepEvents: [
      { step: 'PAID', at: '2026-10-01T21:01:00.000Z' },
      { step: 'REPAIR_STARTED', at: '2026-10-02T09:15:00.000Z' },
    ],
    photoUrls: [],
    client: { name: 'Client', avatarUrl: null },
    repairer: { userId: 'u2', name: 'Repairer', avatarUrl: null },
    conversationId: 'conv-1',
    ...overrides,
  };
}

describe('deriveDisputeTimeline', () => {
  it('Scenario 12-1: Dispute open during repair (REPAIR_STARTED)', () => {
    const data = baseCommande({
      disputeOpen: true,
      disputeOpenedAt: '2026-10-02T11:40:00.000Z',
      dispute: {
        number: 6,
        reference: '#LIT-0006',
        status: 'OPEN',
        motifLabel: 'Désaccord',
        openedAt: '2026-10-02T11:40:00.000Z',
        openedBySide: 'CLIENT',
        unread: false,
      },
    });

    const result = deriveDisputeTimeline(data);
    expect(result.hasDispute).toBe(true);
    expect(result.disputeState).toBe('OPEN');
    expect(result.headerBadge).toEqual({ label: 'Litige en cours', variant: 'solid' });
    expect(result.suspendedStep).toBe('REPAIR_STARTED');

    // Suspended step on main line
    const suspended = result.mainSteps.find(s => s.key === 'REPAIR_STARTED');
    expect(suspended?.state).toBe('suspended');
    expect(suspended?.sub).toBe('Suspendue');

    // Branch steps
    expect(result.branchSteps).toHaveLength(3);
    expect(result.branchSteps[0]?.label).toBe('Litige ouvert');
    expect(result.branchSteps[0]?.state).toBe('done');
    expect(result.branchSteps[1]?.label).toBe('Traitement par REVIME');
    expect(result.branchSteps[1]?.sub).toBe('En cours');
    expect(result.branchSteps[1]?.state).toBe('active');
    expect(result.branchSteps[2]?.label).toBe('Décision');
    expect(result.branchSteps[2]?.sub).toBe('En attente');
    expect(result.branchSteps[2]?.state).toBe('future');
  });

  it('Scenario 12-2: Dispute open during validation (AWAITING_VALIDATION)', () => {
    const data = baseCommande({
      step: 'AWAITING_VALIDATION',
      stepEvents: [
        { step: 'PAID', at: '2026-10-01T21:01:00.000Z' },
        { step: 'REPAIR_STARTED', at: '2026-10-02T09:15:00.000Z' },
        { step: 'REPAIR_DONE', at: '2026-10-02T15:20:00.000Z' },
        { step: 'AWAITING_VALIDATION', at: '2026-10-02T15:22:00.000Z' },
      ],
      disputeOpen: true,
      disputeOpenedAt: '2026-10-02T18:05:00.000Z',
      dispute: {
        number: 6,
        reference: '#LIT-0006',
        status: 'OPEN',
        motifLabel: 'Désaccord',
        openedAt: '2026-10-02T18:05:00.000Z',
        openedBySide: 'CLIENT',
        unread: false,
      },
    });

    const result = deriveDisputeTimeline(data);
    expect(result.hasDispute).toBe(true);
    expect(result.disputeState).toBe('OPEN');
    expect(result.headerBadge).toEqual({ label: 'Litige en cours', variant: 'solid' });
    expect(result.suspendedStep).toBe('AWAITING_VALIDATION');

    // Prior steps done
    const paid = result.mainSteps.find(s => s.key === 'PAID');
    expect(paid?.state).toBe('done');
    const repairDone = result.mainSteps.find(s => s.key === 'REPAIR_DONE');
    expect(repairDone?.state).toBe('done');

    // Suspended step on main line
    const suspended = result.mainSteps.find(s => s.key === 'AWAITING_VALIDATION');
    expect(suspended?.state).toBe('suspended');
    expect(suspended?.sub).toBe('Suspendue');

    // Following step future
    const released = result.mainSteps.find(s => s.key === 'RELEASED');
    expect(released?.state).toBe('future');

    // Branch steps
    expect(result.branchSteps).toHaveLength(3);
    expect(result.branchSteps[0]?.label).toBe('Litige ouvert');
    expect(result.branchSteps[0]?.state).toBe('done');
    expect(result.branchSteps[1]?.label).toBe('Traitement par REVIME');
    expect(result.branchSteps[1]?.sub).toBe('En cours');
    expect(result.branchSteps[1]?.state).toBe('active');
    expect(result.branchSteps[2]?.label).toBe('Décision');
    expect(result.branchSteps[2]?.sub).toBe('En attente');
    expect(result.branchSteps[2]?.state).toBe('future');
  });

  it('Scenario 12-3: Decision - Repair resumes (RESOLVED_DISMISSED)', () => {
    const data = baseCommande({
      disputeOpen: false,
      dispute: {
        number: 6,
        reference: '#LIT-0006',
        status: 'RESOLVED_DISMISSED',
        motifLabel: 'Désaccord',
        openedAt: '2026-10-02T11:40:00.000Z',
        resolvedAt: '2026-10-03T10:30:00.000Z',
        verdict: 'DISMISSED',
        openedBySide: 'CLIENT',
        unread: false,
      },
    });

    const result = deriveDisputeTimeline(data);
    expect(result.hasDispute).toBe(true);
    expect(result.disputeState).toBe('RESOLVED');
    expect(result.headerBadge).toEqual({ label: 'Litige clôturé', variant: 'outline' });

    // Suspended step resumes
    const suspended = result.mainSteps.find(s => s.key === 'REPAIR_STARTED');
    expect(suspended?.state).toBe('current');
    expect(suspended?.sub).toContain('Reprise');

    // Branch steps all done
    expect(result.branchSteps).toHaveLength(3);
    expect(result.branchSteps[0]?.state).toBe('done');
    expect(result.branchSteps[1]?.state).toBe('done');
    expect(result.branchSteps[2]?.state).toBe('done');
    expect(result.branchSteps[2]?.sub).toContain('Reprise');
  });

  it('Scenario 12-4: Decision - Refund (RESOLVED_REFUNDED)', () => {
    const data = baseCommande({
      status: 'REFUNDED',
      step: 'AWAITING_VALIDATION',
      stepEvents: [
        { step: 'PAID', at: '2026-10-01T21:01:00.000Z' },
        { step: 'REPAIR_STARTED', at: '2026-10-02T09:15:00.000Z' },
        { step: 'REPAIR_DONE', at: '2026-10-02T15:20:00.000Z' },
        { step: 'AWAITING_VALIDATION', at: '2026-10-02T15:22:00.000Z' },
      ],
      disputeOpen: false,
      dispute: {
        number: 6,
        reference: '#LIT-0006',
        status: 'RESOLVED_REFUNDED',
        motifLabel: 'Désaccord',
        openedAt: '2026-10-02T18:05:00.000Z',
        resolvedAt: '2026-10-03T09:00:00.000Z',
        verdict: 'REFUNDED',
        openedBySide: 'CLIENT',
        unread: false,
      },
    });

    const result = deriveDisputeTimeline(data);
    expect(result.hasDispute).toBe(true);
    expect(result.headerBadge).toEqual({ label: 'Litige clôturé', variant: 'outline' });

    // Main line terminates with closed order without repairer payout
    const lastStep = result.mainSteps[result.mainSteps.length - 1];
    expect(lastStep?.key).toBe('closed-refunded');
    expect(lastStep?.label).toBe('Commande clôturée');
    expect(lastStep?.sub).toBe('Aucun versement au réparateur');
    expect(result.mainSteps.find(s => s.key === 'RELEASED')).toBeUndefined();

    // Branch has 4 steps ending in refund executed
    expect(result.branchSteps).toHaveLength(4);
    expect(result.branchSteps[2]?.label).toBe('Décision');
    expect(result.branchSteps[2]?.sub).toContain('remboursé');
    expect(result.branchSteps[3]?.label).toBe('Remboursement effectué');
  });

  it('Scenario 12-5: Decision - Release (RESOLVED_RELEASED)', () => {
    const data = baseCommande({
      step: 'RELEASED',
      releasedAt: '2026-10-03T14:00:00.000Z',
      stepEvents: [
        { step: 'PAID', at: '2026-10-01T21:01:00.000Z' },
        { step: 'REPAIR_STARTED', at: '2026-10-02T09:15:00.000Z' },
        { step: 'REPAIR_DONE', at: '2026-10-02T15:20:00.000Z' },
        { step: 'AWAITING_VALIDATION', at: '2026-10-02T15:22:00.000Z' },
        { step: 'RELEASED', at: '2026-10-03T14:00:00.000Z' },
      ],
      disputeOpen: false,
      dispute: {
        number: 6,
        reference: '#LIT-0006',
        status: 'RESOLVED_RELEASED',
        motifLabel: 'Désaccord',
        openedAt: '2026-10-02T18:05:00.000Z',
        resolvedAt: '2026-10-03T14:00:00.000Z',
        verdict: 'RELEASED',
        openedBySide: 'REPAIRER',
        unread: false,
      },
    });

    const result = deriveDisputeTimeline(data);
    expect(result.hasDispute).toBe(true);
    expect(result.disputeState).toBe('RESOLVED');
    expect(result.headerBadge).toEqual({ label: 'Litige clôturé', variant: 'outline' });

    const released = result.mainSteps.find(s => s.key === 'RELEASED');
    expect(released).toBeDefined();
    expect(released?.state).toBe('current');

    expect(result.branchSteps).toHaveLength(3);
    expect(result.branchSteps[0]?.state).toBe('done');
    expect(result.branchSteps[1]?.state).toBe('done');
    expect(result.branchSteps[2]?.state).toBe('done');
    expect(result.branchSteps[2]?.label).toBe('Décision');
    expect(result.branchSteps[2]?.sub).toContain('réparateur');
  });

  it('No dispute returns hasDispute: false with standard sequence', () => {
    const data = baseCommande();
    const result = deriveDisputeTimeline(data);
    expect(result.hasDispute).toBe(false);
    expect(result.disputeState).toBeNull();
    expect(result.headerBadge).toBeNull();
    expect(result.branchSteps).toEqual([]);
    expect(result.mainSteps.length).toBeGreaterThan(0);
    const current = result.mainSteps.find(s => s.key === 'REPAIR_STARTED');
    expect(current?.state).toBe('current');
  });

  it('formatDisputeDate formats dates nicely in French', () => {
    const formattedWithTime = formatDisputeDate('2026-10-02T11:40:00.000Z', true);
    expect(formattedWithTime).toContain('oct.');
    expect(formattedWithTime).toContain('·');

    const formattedWithoutTime = formatDisputeDate('2026-10-03T09:00:00.000Z', false);
    expect(formattedWithoutTime).toContain('oct.');
    expect(formattedWithoutTime).not.toContain('·');
  });
});
