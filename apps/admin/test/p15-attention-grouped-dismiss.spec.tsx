import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import AttentionPage, {
  AttentionTable,
  getAttentionReasons,
  type AttentionItem,
} from '../app/attention/page';
import {
  DismissAttentionModal,
  handleDismissModalKeyDown,
  handleBackdropClick,
  type DismissAttentionModalProps,
} from '../components/DismissAttentionModal';
import { ATTENTION_REASON_LABEL } from '@revime/shared';

describe('P15: Commandes à surveiller (/attention) & DismissAttentionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const multiReasonItem: AttentionItem = {
    commandeId: '2c53de51-0000-4000-8000-000000000001',
    demandeTitle: 'Écran iPhone 14 Pro cassé',
    clientName: 'Alice Client',
    repairerName: 'Bob Réparateur',
    reasons: ['PARCEL_BLOCKED', 'STALLED'],
    status: 'PAID',
    step: 'PARCEL_SENT',
    totalCents: 15000,
    since: '2026-10-10T10:00:00.000Z',
  };

  const disputeItem: AttentionItem = {
    commandeId: '3b64ef62-0000-4000-8000-000000000002',
    demandeTitle: 'Batterie MacBook Pro',
    clientName: 'Charlie Client',
    repairerName: 'David Réparateur',
    reasons: ['DISPUTED'],
    status: 'PAID',
    step: 'REPAIR_STARTED',
    totalCents: 22000,
    since: '2026-10-11T12:00:00.000Z',
  };

  const cancellationItem: AttentionItem = {
    commandeId: '4a75f073-0000-4000-8000-000000000003',
    demandeTitle: 'Appareil photo Sony',
    clientName: 'Eva Client',
    repairerName: 'Frank Réparateur',
    reasons: ['CANCELLATION_REQUESTED'],
    status: 'PAID',
    step: 'PAID',
    totalCents: 9500,
    since: '2026-10-12T08:00:00.000Z',
  };

  const legacyItem: AttentionItem = {
    commandeId: '2c53de51-0000-4000-8000-000000000004',
    demandeTitle: 'Trottinette Xiaomi',
    reason: 'PAYMENT_PENDING_STALE',
    status: 'PENDING_PAYMENT',
    step: null,
    totalCents: 4900,
    since: '2026-10-09T14:00:00.000Z',
  };

  describe('1. Reason Helper (getAttentionReasons)', () => {
    it('extracts multiple reasons from reasons array', () => {
      expect(getAttentionReasons(multiReasonItem)).toEqual(['PARCEL_BLOCKED', 'STALLED']);
    });

    it('falls back to single reason property for backwards compatibility', () => {
      expect(getAttentionReasons(legacyItem)).toEqual(['PAYMENT_PENDING_STALE']);
    });

    it('returns empty array if no reason is specified', () => {
      expect(getAttentionReasons({} as AttentionItem)).toEqual([]);
    });
  });

  describe('2. AttentionTable Component Rendering', () => {
    it('renders multi-pill badges when an order carries multiple anomaly reasons', () => {
      const html = renderToString(
        <AttentionTable
          items={[multiReasonItem]}
          cancellingId={null}
          onCancel={vi.fn()}
          onDismiss={vi.fn()}
        />
      );

      // Both anomaly reason labels must be present in the row
      expect(html).toContain(ATTENTION_REASON_LABEL.PARCEL_BLOCKED);
      expect(html).toContain(ATTENTION_REASON_LABEL.STALLED);
      // Commande reference and actors
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('Alice Client');
      expect(html).toContain('Bob Réparateur');
    });

    it('proposes contextual action "Gérer le colis" for parcel anomaly orders', () => {
      const html = renderToString(
        <AttentionTable
          items={[multiReasonItem]}
          cancellingId={null}
          onCancel={vi.fn()}
          onDismiss={vi.fn()}
        />
      );

      expect(html).toContain('Gérer le colis');
      expect(html).toContain('/colis?commandeId=2c53de51-0000-4000-8000-000000000001');
    });

    it('proposes contextual action "Voir le litige" for disputed orders', () => {
      const html = renderToString(
        <AttentionTable
          items={[disputeItem]}
          cancellingId={null}
          onCancel={vi.fn()}
          onDismiss={vi.fn()}
        />
      );

      expect(html).toContain('Voir le litige');
      expect(html).toContain('/litiges?q=3b64ef62-0000-4000-8000-000000000002');
    });

    it('proposes contextual action "Examiner l\'annulation" for cancellation requested orders', () => {
      const html = renderToString(
        <AttentionTable
          items={[cancellationItem]}
          cancellingId={null}
          onCancel={vi.fn()}
          onDismiss={vi.fn()}
        />
      );

      expect(html).toContain("Examiner l&#x27;annulation");
      expect(html).toContain('/annulations?id=4a75f073-0000-4000-8000-000000000003');
    });

    it('always renders "Marquer comme traité" action button on each row', () => {
      const html = renderToString(
        <AttentionTable
          items={[multiReasonItem, disputeItem]}
          cancellingId={null}
          onCancel={vi.fn()}
          onDismiss={vi.fn()}
        />
      );

      const matches = html.match(/Marquer comme traité/g);
      expect(matches).not.toBeNull();
      expect(matches?.length).toBe(2);
    });

    it('does not offer "Marquer comme traité" on a dossier that ends by acting (a client waiting on a cancellation)', () => {
      const html = renderToString(
        <AttentionTable
          items={[disputeItem, cancellationItem]}
          cancellingId={null}
          onCancel={vi.fn()}
          onDismiss={vi.fn()}
        />
      );

      expect(html.match(/Marquer comme traité/g)?.length).toBe(1);
    });
  });

  describe('3. DismissAttentionModal Component', () => {
    const modalProps: DismissAttentionModalProps = {
      isOpen: true,
      onClose: vi.fn(),
      onConfirm: vi.fn(),
      submitting: false,
      commandeId: '2c53de51-0000-4000-8000-000000000001',
      demandeTitle: 'Écran iPhone 14 Pro cassé',
      clientName: 'Alice Client',
      repairerName: 'Bob Réparateur',
      reasons: ['PARCEL_BLOCKED', 'STALLED'],
    };

    it('renders nothing when isOpen is false', () => {
      const html = renderToString(<DismissAttentionModal {...modalProps} isOpen={false} />);
      expect(html).toBe('');
    });

    it('renders accessible dialog with title and role when isOpen is true', () => {
      const html = renderToString(<DismissAttentionModal {...modalProps} />);
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('id="dismiss-attention-modal-title"');
      expect(html).toContain('Marquer comme traité');
    });

    it('displays short reference CMD-2C53DE51, actors, and anomaly reason badges', () => {
      const html = renderToString(<DismissAttentionModal {...modalProps} />);
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('Écran iPhone 14 Pro cassé');
      expect(html).toContain('Alice Client');
      expect(html).toContain('Bob Réparateur');
      expect(html).toContain(ATTENTION_REASON_LABEL.PARCEL_BLOCKED);
      expect(html).toContain(ATTENTION_REASON_LABEL.STALLED);
    });

    it('renders required textarea for dismissal reason and Bleu Ink confirm button', () => {
      const html = renderToString(<DismissAttentionModal {...modalProps} />);
      expect(html).toContain('Motif du classement');
      expect(html).toContain('id="dismiss-reason-input"');
      expect(html).toContain('Confirmer le classement');
      expect(html).toContain('Annuler');
      // Verifies Bleu Ink primary button token
      expect(html).toContain('var(--navy, #25324f)');
      // Zero pitch-black buttons
      expect(html).not.toContain('background-color: #000000');
      expect(html).not.toContain('background-color: #141414');
    });

    it('displays loading indicator when submitting is true', () => {
      const html = renderToString(<DismissAttentionModal {...modalProps} submitting={true} />);
      expect(html).toContain('Traitement…');
    });

    describe('Modal Escape and Backdrop Handlers', () => {
      it('calls onClose when Escape is pressed and not submitting', () => {
        const onClose = vi.fn();
        handleDismissModalKeyDown({ key: 'Escape' }, false, onClose);
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('does NOT call onClose when Escape is pressed while submitting', () => {
        const onClose = vi.fn();
        handleDismissModalKeyDown({ key: 'Escape' }, true, onClose);
        expect(onClose).not.toHaveBeenCalled();
      });

      it('calls onClose when backdrop is clicked and not submitting', () => {
        const onClose = vi.fn();
        handleBackdropClick(false, onClose);
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('does NOT call onClose when backdrop is clicked while submitting', () => {
        const onClose = vi.fn();
        handleBackdropClick(true, onClose);
        expect(onClose).not.toHaveBeenCalled();
      });
    });
  });

  describe('4. AttentionPage Integration with initialItems', () => {
    it('renders initialItems properly with badges, references, and dismissal trigger buttons', () => {
      const html = renderToString(
        <AttentionPage initialItems={[multiReasonItem, disputeItem, cancellationItem]} />
      );

      expect(html).toContain('Commandes nécessitant une attention');
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('CMD-3B64EF62');
      expect(html).toContain('CMD-4A75F073');
      expect(html).toContain(ATTENTION_REASON_LABEL.PARCEL_BLOCKED);
      expect(html).toContain(ATTENTION_REASON_LABEL.DISPUTED);
      expect(html).toContain(ATTENTION_REASON_LABEL.CANCELLATION_REQUESTED);
    });

    it('renders empty state banner when initialItems is empty', () => {
      const html = renderToString(<AttentionPage initialItems={[]} />);
      expect(html).toContain('Aucune commande à surveiller');
      expect(html).toContain('Toutes les transactions sont conformes');
    });
  });
});
