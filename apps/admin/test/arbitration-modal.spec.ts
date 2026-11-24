import { describe, it, expect } from 'vitest';
import {
  getArbitrationConfig,
  type ArbitrationMode,
} from '../app/litiges/ArbitrationModal';
import { getDisputeStatusBadge } from '../app/litiges/DisputeDossierDrawer';
import { getVerdictLabel } from '../lib/dispute-status-label';
import { ROLE_PERMISSIONS, type AdminRole } from '@revime/shared';
import { hasPermission } from '../lib/permissions';

const adminUser = (role: AdminRole) => ({
  role,
  permissions: [...ROLE_PERMISSIONS[role]],
  twoFactorVerified: true,
});

describe('CF5-22 Dispute Resolution: Permissions', () => {
  it('allows finance, admin, and super_admin to resolve disputes', () => {
    expect(hasPermission(adminUser('super_admin'), 'disputes.resolve')).toBe(true);
    expect(hasPermission(adminUser('admin'), 'disputes.resolve')).toBe(true);
    expect(hasPermission(adminUser('finance'), 'disputes.resolve')).toBe(true);
  });

  it('prohibits support, moderation, and read_only from resolving disputes', () => {
    expect(hasPermission(adminUser('support'), 'disputes.resolve')).toBe(false);
    expect(hasPermission(adminUser('moderation'), 'disputes.resolve')).toBe(false);
    expect(hasPermission(adminUser('read_only'), 'disputes.resolve')).toBe(false);
  });

  it('allows support to handle disputes (instruction, messages, notes) without resolution power', () => {
    expect(hasPermission(adminUser('support'), 'disputes.handle')).toBe(true);
    expect(hasPermission(adminUser('support'), 'disputes.resolve')).toBe(false);
  });
});

describe('CF5-22 Dispute Resolution: getArbitrationConfig (4 Outcomes)', () => {
  const disputeId = 'disp-123';

  it('configures Outcome 1: « La réparation reprend » (DISMISS)', () => {
    const config = getArbitrationConfig('DISMISS', disputeId);
    expect(config.title).toBe('La réparation reprend');
    expect(config.warningText).toContain('la commande repart à l\'étape où elle s\'était arrêtée');
    expect(config.submitLabel).toBe('Confirmer la reprise de la réparation');
    expect(config.endpoint).toBe('/api/proxy/admin/litiges/disp-123/resolve-dismiss');
  });

  it('configures Outcome 2: « Paiement au réparateur » (RELEASE)', () => {
    const config = getArbitrationConfig('RELEASE', disputeId, 7500);
    expect(config.title).toBe('Paiement au réparateur');
    expect(config.warningText).toContain('déblocage de l\'escrow Stripe');
    expect(config.submitLabel.replace(/\u202F|\u00A0/g, ' ')).toBe('Confirmer le paiement (75,00 €)');
    expect(config.endpoint).toBe('/api/proxy/admin/litiges/disp-123/resolve-release');
  });

  it('configures Outcome 3: « Remboursement » (REFUND_FULL)', () => {
    const config = getArbitrationConfig('REFUND_FULL', disputeId);
    expect(config.title).toBe('Remboursement intégral du client');
    expect(config.endpoint).toBe('/api/proxy/admin/litiges/disp-123/resolve-refund');
    expect(config.isRefund).toBe(true);
    expect(config.refundPreset).toBe('full');
  });

  it('configures Outcome 4: « Remboursement partiel » (REFUND_PARTIAL)', () => {
    const config = getArbitrationConfig('REFUND_PARTIAL', disputeId);
    expect(config.title).toBe('Remboursement partiel');
    expect(config.endpoint).toBe('/api/proxy/admin/litiges/disp-123/resolve-refund');
    expect(config.isRefund).toBe(true);
    expect(config.refundPreset).toBe('suggestion');
  });

  it('supports legacy REFUND mode as alias to full refund', () => {
    const config = getArbitrationConfig('REFUND', disputeId);
    expect(config.title).toBe('Remboursement intégral du client');
    expect(config.isRefund).toBe(true);
    expect(config.refundPreset).toBe('full');
  });
});

describe('CF5-22 Dispute Resolution: Status & Verdict Labels', () => {
  it('renders « La réparation reprend » for DISMISSED and DISMISS_NO_ACTION verdicts', () => {
    expect(getVerdictLabel('DISMISSED')).toBe('La réparation reprend');
    expect(getVerdictLabel('DISMISS_NO_ACTION')).toBe('La réparation reprend');
  });

  it('renders « Paiement au réparateur » for RELEASE_REPAIRER verdict', () => {
    expect(getVerdictLabel('RELEASE_REPAIRER')).toBe('Paiement au réparateur');
  });

  it('renders « Client intégralement remboursé » for REFUND_CLIENT verdict', () => {
    expect(getVerdictLabel('REFUND_CLIENT')).toBe('Client intégralement remboursé');
  });

  it('renders « Client partiellement remboursé » for PARTIAL_REFUND verdict', () => {
    expect(getVerdictLabel('PARTIAL_REFUND')).toBe('Client partiellement remboursé');
  });

  it('renders « Réparation reprise » for RESOLVED_DISMISSED status badge', () => {
    const badge = getDisputeStatusBadge('RESOLVED_DISMISSED');
    expect(badge.label).toBe('Réparation reprise');
  });
});
