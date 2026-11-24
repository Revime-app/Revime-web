import { describe, it, expect } from 'vitest';
import { getTxBadge } from '../src/components/conversation/conversation-tx';

describe('getTxBadge — Bug V4 resolution', () => {
  describe('Dispute active gating', () => {
    it('returns "Suspendue — litige" with danger red styling when disputeOpen is true on a paid order', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: null,
        disputeOpen: true,
      });

      expect(badge.label).toBe('Suspendue — litige');
      expect(badge.bg).toBe('#fee2e2');
      expect(badge.color).toBe('#b91c1c');
    });

    it('returns "Suspendue — litige" when dispute is active during intermediate steps (REPAIR_STARTED)', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'REPAIR_STARTED',
        disputeOpen: true,
      });

      expect(badge.label).toBe('Suspendue — litige');
      expect(badge.bg).toBe('#fee2e2');
      expect(badge.color).toBe('#b91c1c');
    });

    it('returns "Suspendue — litige" when dispute is active during PARCEL_SENT step', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'PARCEL_SENT',
        disputeOpen: true,
      });

      expect(badge.label).toBe('Suspendue — litige');
      expect(badge.bg).toBe('#fee2e2');
      expect(badge.color).toBe('#b91c1c');
    });

    it('returns "Suspendue — litige" when dispute is active during AWAITING_VALIDATION step', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'AWAITING_VALIDATION',
        disputeOpen: true,
      });

      expect(badge.label).toBe('Suspendue — litige');
      expect(badge.bg).toBe('#fee2e2');
      expect(badge.color).toBe('#b91c1c');
    });
  });

  describe('Resolved and terminal transactions', () => {
    it('returns "Remboursée" if order is refunded, even if a dispute was previously open', () => {
      const badge = getTxBadge({
        status: 'REFUNDED',
        step: 'REPAIR_STARTED',
        disputeOpen: false,
      });

      expect(badge.label).toBe('Remboursée');
      expect(badge.bg).toBe('#fee2e2');
      expect(badge.color).toBe('#b91c1c');
    });

    it('returns "Suspendue — litige" over a refund while a dispute is still open, as the order sheet does', () => {
      const badge = getTxBadge({ status: 'REFUNDED', step: 'REPAIR_STARTED', disputeOpen: true });

      expect(badge.label).toBe('Suspendue — litige');
    });

    it('returns "Annulée" if order was abandoned/cancelled', () => {
      const badge = getTxBadge({
        status: 'ABANDONED',
        step: null,
        disputeOpen: false,
      });

      expect(badge.label).toBe('Annulée');
      expect(badge.bg).toBe('#f3f4f6');
      expect(badge.color).toBe('#6b7280');
    });

    it('returns "Fonds débloqués" if funds were released after dispute dismissal', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'RELEASED',
        disputeOpen: false,
      });

      expect(badge.label).toBe('Fonds débloqués');
      expect(badge.bg).toBe('#dcfce7');
      expect(badge.color).toBe('#15803d');
    });
  });

  describe('Standard lifecycle steps without dispute', () => {
    it('returns "Paiement en attente" for PENDING_PAYMENT status', () => {
      const badge = getTxBadge({
        status: 'PENDING_PAYMENT',
        step: null,
        disputeOpen: false,
      });

      expect(badge.label).toBe('Paiement en attente');
      expect(badge.bg).toBe('#fef3c7');
      expect(badge.color).toBe('#b45309');
    });

    it('returns "Paiement effectué" for newly paid order without dispute', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: null,
        disputeOpen: false,
      });

      expect(badge.label).toBe('Paiement effectué');
      expect(badge.bg).toBe('#dcfce7');
      expect(badge.color).toBe('#15803d');
    });

    it('returns "Réparation en cours" for REPAIR_STARTED', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'REPAIR_STARTED',
        disputeOpen: false,
      });

      expect(badge.label).toBe('Réparation en cours');
      expect(badge.bg).toBe('#e0e7ff');
      expect(badge.color).toBe('#3730a3');
    });

    it('returns "Réparation terminée" for REPAIR_DONE', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'REPAIR_DONE',
        disputeOpen: false,
      });

      expect(badge.label).toBe('Réparation terminée');
      expect(badge.bg).toBe('#dcfce7');
      expect(badge.color).toBe('#15803d');
    });

    it('returns "Validation client" for AWAITING_VALIDATION', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'AWAITING_VALIDATION',
        disputeOpen: false,
      });

      expect(badge.label).toBe('Validation client');
      expect(badge.bg).toBe('#fef3c7');
      expect(badge.color).toBe('#b45309');
    });

    it('returns "Colis envoyé" for PARCEL_SENT', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'PARCEL_SENT',
        disputeOpen: false,
      });

      expect(badge.label).toBe('Colis envoyé');
      expect(badge.bg).toBe('#e0f2fe');
      expect(badge.color).toBe('#0369a1');
    });

    it('returns "Colis reçu" for PARCEL_RECEIVED', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'PARCEL_RECEIVED',
        disputeOpen: false,
      });

      expect(badge.label).toBe('Colis reçu');
      expect(badge.bg).toBe('#e0f2fe');
      expect(badge.color).toBe('#0369a1');
    });

    it('returns "Colis retour envoyé" for RETURN_SENT', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'RETURN_SENT',
        disputeOpen: false,
      });

      expect(badge.label).toBe('Colis retour envoyé');
      expect(badge.bg).toBe('#e0f2fe');
      expect(badge.color).toBe('#0369a1');
    });

    it('returns "Colis retour reçu" for RETURN_RECEIVED', () => {
      const badge = getTxBadge({
        status: 'PAID',
        step: 'RETURN_RECEIVED',
        disputeOpen: false,
      });

      expect(badge.label).toBe('Colis retour reçu');
      expect(badge.bg).toBe('#e0f2fe');
      expect(badge.color).toBe('#0369a1');
    });
  });
});
