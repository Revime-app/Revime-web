import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import NotFound, { metadata as notFoundMetadata } from '../app/not-found';
import { formatAuditStatus, formatAuditTarget, RecentActions } from '../components/RecentActions';
import { RepairerBlock } from '../components/RepairerBlock';
import { PaymentsTable } from '../app/paiements/PaymentsTable';
import {
  COMMANDE_STATUS_LABEL,
  ADMIN_ROLE_LABEL,
  ADMIN_AUDIT_ACTION_LABEL,
  IDENTITY_STATUS_LABEL,
  IDENTITY_VARIANT_LABEL,
  CONNECT_STATUS_LABEL,
  TARGET_TYPE_LABEL,
  type AdminPaymentListItem,
  type AdminRepairerBlock,
} from '@revime/shared';

describe('UI5 - Full French Translation & Localized 404 Page', () => {
  describe('1. Localized Admin 404 Page (apps/admin/app/not-found.tsx)', () => {
    it('declares French metadata title and description', () => {
      expect(notFoundMetadata.title).toBe('Page introuvable · Revime Admin');
      expect(notFoundMetadata.description).toBe('La page demandée est introuvable.');
    });

    it('renders accessible French heading, explanation, and dashboard link', () => {
      const html = renderToString(<NotFound />);

      // Accessible container testid
      expect(html).toContain('data-testid="admin-not-found"');

      // Heading & description
      expect(html).toContain('404 · Page introuvable');
      expect(html).toContain('La ressource que vous recherchez n&#x27;existe pas, a été déplacée ou nécessite des droits d&#x27;accès différents.');

      // Primary navigation back to dashboard
      expect(html).toContain('href="/"');
      expect(html).toContain('Retour au tableau de bord');

      // Secondary quick links
      expect(html).toContain('href="/litiges"');
      expect(html).toContain('Litiges');
      expect(html).toContain('href="/demandes"');
      expect(html).toContain('Demandes');
      expect(html).toContain('href="/utilisateurs"');
      expect(html).toContain('Utilisateurs');
    });
  });

  describe('2. Single Source of Truth Shared Dictionaries (@revime/shared)', () => {
    it('translates PENDING_PAYMENT and PAID in COMMANDE_STATUS_LABEL', () => {
      expect(COMMANDE_STATUS_LABEL.PENDING_PAYMENT).toBe('En attente de paiement');
      expect(COMMANDE_STATUS_LABEL.PAID).toBe('Payé');
      expect(COMMANDE_STATUS_LABEL.ABANDONED).toBe('Abandonnée');
      expect(COMMANDE_STATUS_LABEL.REFUNDED).toBe('Remboursée');
    });

    it('translates super_admin in ADMIN_ROLE_LABEL', () => {
      expect(ADMIN_ROLE_LABEL.super_admin).toBe('Super administrateur');
      expect(ADMIN_ROLE_LABEL.admin).toBe('Admin');
    });

    it('translates dispute.note in ADMIN_AUDIT_ACTION_LABEL', () => {
      expect(ADMIN_AUDIT_ACTION_LABEL['dispute.note']).toBe("Ajout d'une note interne de litige");
    });

    it('translates Stripe Identity session statuses and variants', () => {
      expect(IDENTITY_STATUS_LABEL.VERIFIED).toBe('Vérifié');
      expect(IDENTITY_STATUS_LABEL.REQUIRES_INPUT).toBe('En attente de documents');
      expect(IDENTITY_STATUS_LABEL.PROCESSING).toBe('En cours de vérification');
      expect(IDENTITY_STATUS_LABEL.CANCELED).toBe('Annulé');

      expect(IDENTITY_VARIANT_LABEL.DOCUMENT_AND_SELFIE).toBe('Document et selfie');
      expect(IDENTITY_VARIANT_LABEL.DOCUMENT_ONLY).toBe('Document seul');
    });

    it('translates Stripe Connect account statuses', () => {
      expect(CONNECT_STATUS_LABEL.VERIFIED).toBe('Vérifié');
      expect(CONNECT_STATUS_LABEL.PENDING).toBe('En attente');
      expect(CONNECT_STATUS_LABEL.RESTRICTED).toBe('Restreint');
      expect(CONNECT_STATUS_LABEL.REJECTED).toBe('Refusé');
    });

    it('translates audit target types in TARGET_TYPE_LABEL', () => {
      expect(TARGET_TYPE_LABEL.user).toBe('Utilisateur');
      expect(TARGET_TYPE_LABEL.repairer).toBe('Réparateur');
      expect(TARGET_TYPE_LABEL.demande).toBe('Demande');
      expect(TARGET_TYPE_LABEL.dispute).toBe('Litige');
      expect(TARGET_TYPE_LABEL.commande).toBe('Commande');
      expect(TARGET_TYPE_LABEL.report).toBe('Signalement');
      expect(TARGET_TYPE_LABEL.review).toBe('Avis');
    });
  });

  describe('3. Human-Readable Error Status Code Formatting (RecentActions.tsx)', () => {
    it('formats successful status codes (2xx) as "Réussie"', () => {
      expect(formatAuditStatus(200)).toBe('Réussie');
      expect(formatAuditStatus(201)).toBe('Réussie');
      expect(formatAuditStatus(204)).toBe('Réussie');
    });

    it('formats 422 Unprocessable Entity into a clear French message', () => {
      expect(formatAuditStatus(422)).toBe('Refusée · Données non conformes (422)');
    });

    it('formats other client error codes (400, 401, 403, 404, 409, 429) clearly', () => {
      expect(formatAuditStatus(400)).toBe('Refusée · Requête invalide (400)');
      expect(formatAuditStatus(401)).toBe('Refusée · Non authentifié (401)');
      expect(formatAuditStatus(403)).toBe('Refusée · Accès refusé (403)');
      expect(formatAuditStatus(404)).toBe('Refusée · Introuvable (404)');
      expect(formatAuditStatus(409)).toBe('Refusée · Conflit métier (409)');
      expect(formatAuditStatus(429)).toBe('Refusée · Limite de requêtes (429)');
    });

    it('formats server errors (5xx) with French explanation', () => {
      expect(formatAuditStatus(500)).toBe('Échec serveur (500)');
      expect(formatAuditStatus(503)).toBe('Échec serveur (503)');
    });

    it('formats audit targets using French labels', () => {
      expect(formatAuditTarget('user', 'u-123')).toBe('Utilisateur u-123');
      expect(formatAuditTarget('dispute', 'd-456')).toBe('Litige d-456');
      expect(formatAuditTarget('commande', 'cmd-789')).toBe('Commande cmd-789');
      expect(formatAuditTarget(null, null)).toBe('-');
    });
  });

  describe('4. RepairerBlock Localized Display', () => {
    it('renders French labels for identity status, variant, and Connect status', () => {
      const mockBlock: AdminRepairerBlock = {
        displayName: 'Atelier Express',
        kind: 'PRO',
        bio: null,
        postalCode: '75011',
        serviceAreaLabel: null,
        serviceRadiusKm: null,
        repairerEnabled: true,
        publicBadge: 'IDENTITY',
        counts: { liveOffers: 3, hiddenLiveOffers: 0 },
        identity: {
          status: 'VERIFIED',
          verifiedAt: '2026-10-01T10:00:00.000Z',
          lastErrorCode: null,
          variant: 'DOCUMENT_AND_SELFIE',
          redactionStatus: null,
          erasureRequestedAt: null,
          selfieFraudSignalAt: null,
        },
        business: null,
        connectStatus: 'VERIFIED',
        revocation: null,
        suspension: null,
      };

      const html = renderToString(
        <RepairerBlock
          id="test-repairer-1"
          block={mockBlock}
          status={{ kind: 'active' }}
          busy={false}
          act={vi.fn()}
          setError={vi.fn()}
        />,
      );

      // Verify no raw enums leak
      expect(html).toMatch(/Statut\s*:\s*<\/strong>\s*(<!-- -->)?\s*Vérifié/);
      expect(html).toMatch(/Variante\s*:\s*<\/strong>\s*(<!-- -->)?\s*Document et selfie/);
      expect(html).toMatch(/Statut Stripe Connect\s*:\s*<\/strong>\s*(<!-- -->)?\s*Vérifié/);
      expect(html).not.toContain('VERIFIED');
      expect(html).not.toContain('DOCUMENT_AND_SELFIE');
    });
  });

  describe('5. PaymentsTable Localized Badges', () => {
    it('renders "En attente de paiement" for PENDING_PAYMENT orders', () => {
      const item: AdminPaymentListItem = {
        id: 'cmd-test-pending',
        createdAt: '2026-10-10T12:00:00.000Z',
        paidAt: null,
        status: 'PENDING_PAYMENT',
        step: null,
        delivery: 'WORKSHOP',
        totalCents: 5000,
        repairCents: 5000,
        shippingCents: 0,
        protectionCents: 0,
        clientName: 'Jean Dupont',
        clientEmail: 'jean@example.com',
        repairerName: 'Atelier Test',
        repairerEmail: 'atelier@example.com',
        isDisputed: false,
        disputeId: null,
        disputeStatus: null,
        stripeChargeId: null,
        stripeTransferId: null,
        stripeRefundId: null,
        refundedCents: null,
        cancellationPending: false,
        payoutStatus: 'NOT_APPLICABLE',
        payoutAmountCents: null,
      };

      const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={vi.fn()} />);
      expect(html).toContain('En attente de paiement');
      expect(html).toContain('Atelier');
    });

    it('renders "Payé" for PAID orders', () => {
      const item: AdminPaymentListItem = {
        id: 'cmd-test-paid',
        createdAt: '2026-10-10T12:00:00.000Z',
        paidAt: '2026-10-10T12:05:00.000Z',
        status: 'PAID',
        step: 'RELEASED',
        delivery: 'PARCEL',
        totalCents: 8500,
        repairCents: 6000,
        shippingCents: 2000,
        protectionCents: 500,
        clientName: 'Marie Curie',
        clientEmail: 'marie@example.com',
        repairerName: 'Atelier Alpha',
        repairerEmail: 'alpha@example.com',
        isDisputed: false,
        disputeId: null,
        disputeStatus: null,
        stripeChargeId: 'ch_test',
        stripeTransferId: null,
        stripeRefundId: null,
        refundedCents: null,
        cancellationPending: false,
        payoutStatus: 'NOT_APPLICABLE',
        payoutAmountCents: null,
      };

      const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={vi.fn()} />);
      expect(html).toContain('Payé');
      expect(html).toContain('Colis');
      expect(html).toContain('Fonds débloqués');
    });
  });
});
