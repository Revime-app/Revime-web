import {
  type CommandeDto,
  type CommandeStep,
  formatDisputeReference,
  stepsFor,
} from './commande.schemas.js';
import { isPayoutHeld, timelineLabel, type RepairViewer } from './repair-status.js';
import { euros } from './compare-criteria.js';

export type DisputeTimelineStepState = 'done' | 'current' | 'future' | 'suspended' | 'closed';

export type DisputeTimelineBranchState = 'done' | 'active' | 'future';

export type DisputeTimelineMainStep = {
  key: string;
  label: string;
  sub: string | null;
  date: string | null;
  state: DisputeTimelineStepState;
};

export type DisputeTimelineBranchStep = {
  key: string;
  label: string;
  sub: string | null;
  date: string | null;
  state: DisputeTimelineBranchState;
};

export type DisputeTimelineBadge = {
  label: string;
  variant: 'solid' | 'outline';
};

export type DisputeTimelineResult = {
  hasDispute: boolean;
  disputeState: 'OPEN' | 'RESOLVED' | null;
  suspendedStep: CommandeStep | null;
  mainSteps: DisputeTimelineMainStep[];
  branchSteps: DisputeTimelineBranchStep[];
  branchColor: string;
  headerBadge: DisputeTimelineBadge | null;
  reference: string;
};

export const SHORT_MONTHS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

/**
 * Formats a timestamp into French date format:
 * - With time: « 2 oct. · 11:40 »
 * - Without time: « 2 oct. »
 */
export function formatDisputeDate(iso: string | null | undefined, includeTime = true): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const day = d.getDate();
  const month = SHORT_MONTHS_FR[d.getMonth()] ?? '';
  if (!includeTime) {
    return `${day} ${month}`;
  }
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} · ${hours}:${minutes}`;
}

/**
 * Resolves the timestamp for a main sequence step.
 */
export function dateForStep(data: CommandeDto, step: CommandeStep): string | null {
  const events = data.stepEvents?.filter((e) => e.step === step) ?? [];
  if (events.length > 0) return events[events.length - 1]!.at;
  if (step === 'PAID') return data.paidAt;
  if (step === 'RETURN_SENT') return data.returnSentAt;
  if (step === 'RELEASED') return data.releasedAt;
  return null;
}

/**
 * Determines the step active when the dispute occurred:
 * - When dispute is open: current `data.step`.
 * - When dispute is resolved: the latest step in `stepEvents` at or before `dispute.openedAt`.
 */
export function deriveSuspendedStep(data: CommandeDto): CommandeStep {
  const openedAt = data.dispute?.openedAt ?? data.disputeOpenedAt;
  if (openedAt && data.stepEvents && data.stepEvents.length > 0) {
    const openTime = new Date(openedAt).getTime();
    const priorEvents = data.stepEvents
      .filter((e) => new Date(e.at).getTime() <= openTime)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    if (priorEvents.length > 0) {
      return priorEvents[priorEvents.length - 1]!.step;
    }
  }
  return data.step ?? 'PAID';
}

/**
 * Pure derivation logic mapping the order timeline and lateral dispute branch tracks
 * according to mockups 12-1 through 12-4.
 */
export function deriveDisputeTimeline(data: CommandeDto): DisputeTimelineResult {
  const hasDispute = Boolean(data.dispute || data.disputeOpen);

  if (!hasDispute) {
    const sequence = stepsFor(data.delivery);
    const viewer: RepairViewer = data.viewerRole ?? 'CLIENT';
    const currentStepIndex = data.step ? sequence.indexOf(data.step) : 0;

    const mainSteps: DisputeTimelineMainStep[] = sequence.map((s, idx) => ({
      key: s,
      label: timelineLabel(s, viewer, isPayoutHeld(data)),
      sub: null,
      date: formatDisputeDate(dateForStep(data, s)),
      state: idx < currentStepIndex ? 'done' : idx === currentStepIndex ? 'current' : 'future',
    }));

    return {
      hasDispute: false,
      disputeState: null,
      suspendedStep: null,
      mainSteps,
      branchSteps: [],
      branchColor: '',
      headerBadge: null,
      reference: '',
    };
  }

  const dispute = data.dispute;
  const disputeOpen = data.disputeOpen || dispute?.status === 'OPEN';
  const disputeState: 'OPEN' | 'RESOLVED' = disputeOpen ? 'OPEN' : 'RESOLVED';

  const isRefunded =
    data.status === 'REFUNDED' ||
    dispute?.status === 'RESOLVED_REFUNDED' ||
    dispute?.verdict === 'REFUNDED' ||
    dispute?.verdict === 'PARTIAL_REFUND';

  const isDismissed =
    dispute?.status === 'RESOLVED_DISMISSED' ||
    dispute?.verdict === 'DISMISSED';

  const isReleased =
    dispute?.status === 'RESOLVED_RELEASED' ||
    dispute?.verdict === 'RELEASED';

  const reference = dispute?.reference
    ? dispute.reference
    : dispute?.number
      ? formatDisputeReference(dispute.number)
      : '';

  const headerBadge: DisputeTimelineBadge = {
    label: disputeState === 'OPEN' ? 'Litige en cours' : 'Litige clôturé',
    variant: disputeState === 'OPEN' ? 'solid' : 'outline',
  };

  const branchColor = disputeState === 'OPEN' ? '#E02D3C' : '#141414';

  const suspendedStep = deriveSuspendedStep(data);
  const sequence = stepsFor(data.delivery);
  const viewer: RepairViewer = data.viewerRole ?? 'CLIENT';
  const suspendedIndex = sequence.indexOf(suspendedStep);
  const currentStepIndex = data.step ? sequence.indexOf(data.step) : suspendedIndex;

  const resolvedAt = dispute?.resolvedAt;

  // Build Main Track steps
  const mainSteps: DisputeTimelineMainStep[] = [];

  if (disputeState === 'OPEN') {
    for (let idx = 0; idx < sequence.length; idx++) {
      const s = sequence[idx]!;
      if (idx < suspendedIndex) {
        mainSteps.push({
          key: s,
          label: timelineLabel(s, viewer, isPayoutHeld(data)),
          sub: null,
          date: formatDisputeDate(dateForStep(data, s)),
          state: 'done',
        });
      } else if (idx === suspendedIndex) {
        mainSteps.push({
          key: s,
          label: timelineLabel(s, viewer, isPayoutHeld(data)),
          sub: 'Suspendue',
          date: null,
          state: 'suspended',
        });
      } else {
        mainSteps.push({
          key: s,
          label: timelineLabel(s, viewer, isPayoutHeld(data)),
          sub: null,
          date: null,
          state: 'future',
        });
      }
    }
  } else if (isRefunded) {
    // Scenario 12-4: Order terminates with closed step, RELEASED is excluded
    const limitIndex = suspendedIndex >= 0 ? suspendedIndex : sequence.length - 1;
    for (let idx = 0; idx <= limitIndex; idx++) {
      const s = sequence[idx]!;
      mainSteps.push({
        key: s,
        label: timelineLabel(s, viewer, isPayoutHeld(data)),
        sub: null,
        date: formatDisputeDate(dateForStep(data, s)),
        state: 'done',
      });
    }
    mainSteps.push({
      key: 'closed-refunded',
      label: 'Commande clôturée',
      sub: 'Aucun versement au réparateur',
      date: null,
      state: 'closed',
    });
  } else if (isDismissed) {
    // Scenario 12-3: Repair resumes at suspended step
    for (let idx = 0; idx < sequence.length; idx++) {
      const s = sequence[idx]!;
      if (idx < suspendedIndex) {
        mainSteps.push({
          key: s,
          label: timelineLabel(s, viewer, isPayoutHeld(data)),
          sub: null,
          date: formatDisputeDate(dateForStep(data, s)),
          state: 'done',
        });
      } else if (idx === suspendedIndex) {
        const isCurrent = currentStepIndex === suspendedIndex;
        const sub = resolvedAt ? `Reprise le ${formatDisputeDate(resolvedAt)}` : 'Reprise';
        mainSteps.push({
          key: s,
          label: timelineLabel(s, viewer, isPayoutHeld(data)),
          sub,
          date: null,
          state: isCurrent ? 'current' : 'done',
        });
      } else {
        mainSteps.push({
          key: s,
          label: timelineLabel(s, viewer, isPayoutHeld(data)),
          sub: null,
          date: idx <= currentStepIndex ? formatDisputeDate(dateForStep(data, s)) : null,
          state: idx < currentStepIndex ? 'done' : idx === currentStepIndex ? 'current' : 'future',
        });
      }
    }
  } else {
    // Other resolved states (e.g. Scenario 12-5 RELEASED)
    for (let idx = 0; idx < sequence.length; idx++) {
      const s = sequence[idx]!;
      mainSteps.push({
        key: s,
        label: timelineLabel(s, viewer, isPayoutHeld(data)),
        sub: null,
        date: formatDisputeDate(dateForStep(data, s)),
        state: idx < currentStepIndex ? 'done' : idx === currentStepIndex ? 'current' : 'future',
      });
    }
  }

  // Build Lateral Branch steps
  const branchSteps: DisputeTimelineBranchStep[] = [];
  const openDate = dispute?.openedAt ?? data.disputeOpenedAt;

  // Step 1: Litige ouvert
  branchSteps.push({
    key: 'branch-open',
    label: 'Litige ouvert',
    sub: null,
    date: formatDisputeDate(openDate),
    state: 'done',
  });

  // Step 2: Traitement par REVIME
  if (disputeState === 'OPEN') {
    branchSteps.push({
      key: 'branch-review',
      label: 'Traitement par REVIME',
      sub: 'En cours',
      date: formatDisputeDate(dispute?.assignedAt),
      state: 'active',
    });
  } else {
    branchSteps.push({
      key: 'branch-review',
      label: 'Traitement par REVIME',
      sub: null,
      date: formatDisputeDate(dispute?.assignedAt ?? resolvedAt),
      state: 'done',
    });
  }

  // Step 3: Décision
  if (disputeState === 'OPEN') {
    branchSteps.push({
      key: 'branch-decision',
      label: 'Décision',
      sub: 'En attente',
      date: null,
      state: 'future',
    });
  } else {
    let decisionSub = 'Litige clôturé';
    if (isDismissed) {
      decisionSub = resolvedAt ? `Reprise · ${formatDisputeDate(resolvedAt)}` : 'Reprise';
    } else if (isRefunded) {
      const prefix = data.partialRefund ? 'Remboursement partiel' : 'Client remboursé';
      decisionSub = resolvedAt ? `${prefix} · ${formatDisputeDate(resolvedAt, false)}` : prefix;
    } else if (isReleased) {
      decisionSub = resolvedAt ? `Paiement au réparateur · ${formatDisputeDate(resolvedAt)}` : 'Paiement au réparateur';
    }

    branchSteps.push({
      key: 'branch-decision',
      label: 'Décision',
      sub: decisionSub,
      date: null,
      state: 'done',
    });

    // Step 4: Remboursement effectué (only for refund outcomes)
    if (isRefunded) {
      const amountFormatted = euros(data.totalCents);
      const refundSub = resolvedAt ? `${amountFormatted} · ${formatDisputeDate(resolvedAt, false)}` : amountFormatted;
      branchSteps.push({
        key: 'branch-refund-executed',
        label: 'Remboursement effectué',
        sub: refundSub,
        date: null,
        state: 'done',
      });
    }
  }

  return {
    hasDispute: true,
    disputeState,
    suspendedStep,
    mainSteps,
    branchSteps,
    branchColor,
    headerBadge,
    reference,
  };
}
