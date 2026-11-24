import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { formatShortReference, CopyableReference } from '../components/CopyableReference';
import {
  isDeletedUser,
  safeUserEmail,
  formatUserDisplay,
  DELETED_USER_NAME,
} from '../lib/user-display';
import { KpiTile } from '../components/KpiTile';
import { DisputeQueueTable } from '../app/litiges/DisputeQueueTable';
import { PaymentsTable } from '../app/paiements/PaymentsTable';
import { RecentActions, getAuditTargetHref } from '../components/RecentActions';
import type {
  AdminDisputeListItem,
  AdminPaymentListItem,
  AdminAuditEntry,
} from '@revime/shared';

describe('UI7 - Everything Clickable & Short References', () => {
  describe('Pillar 1: Short Reference Canonical Normalization (formatShortReference)', () => {
    it('normalizes full UUIDs into canonical short references CMD-XXXXXXXX', () => {
      const fullUuid = '2c53de51-b157-430a-9d04-123456789abc';
      expect(formatShortReference(fullUuid, 'CMD')).toBe('CMD-2C53DE51');
    });

    it('supports custom prefixes like LIT, USR, DEM', () => {
      const uuid = 'a9db011e-0000-0000-0000-000000000000';
      expect(formatShortReference(uuid, 'LIT')).toBe('LIT-A9DB011E');
      expect(formatShortReference(uuid, 'USR')).toBe('USR-A9DB011E');
      expect(formatShortReference(uuid, 'DEM')).toBe('DEM-A9DB011E');
    });

    it('supports hash prefix when hashPrefix is true', () => {
      const uuid = '2c53de51-0000-0000-0000-000000000000';
      expect(formatShortReference(uuid, 'CMD', true)).toBe('#CMD-2C53DE51');
    });

    it('idempotently handles already formatted references with or without hash', () => {
      expect(formatShortReference('CMD-2C53DE51')).toBe('CMD-2C53DE51');
      expect(formatShortReference('#CMD-2C53DE51')).toBe('CMD-2C53DE51');
      expect(formatShortReference('#CMD-2C53DE51', 'CMD', true)).toBe('#CMD-2C53DE51');
    });

    it('handles empty or blank inputs gracefully', () => {
      expect(formatShortReference('')).toBe('');
      expect(formatShortReference('   ')).toBe('');
    });
  });

  describe('Pillar 2: CopyableReference Component', () => {
    it('renders the formatted short reference and copy button', () => {
      const html = renderToString(
        <CopyableReference value="2c53de51-b157-430a-9d04-123456789abc" prefix="CMD" />
      );

      expect(html).toContain('data-testid="copyable-reference"');
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('data-testid="copy-reference-button"');
      expect(html).toContain('aria-label="Copier CMD-2C53DE51"');
      expect(html).toContain('title="Identifiant complet : 2c53de51-b157-430a-9d04-123456789abc"');
    });

    it('wraps the reference in an accessible Link when href is provided', () => {
      const html = renderToString(
        <CopyableReference
          value="2c53de51-b157-430a-9d04-123456789abc"
          prefix="CMD"
          href="/paiements?commande=2c53de51-b157-430a-9d04-123456789abc"
        />
      );

      expect(html).toContain('href="/paiements?commande=2c53de51-b157-430a-9d04-123456789abc"');
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('data-testid="copy-reference-button"');
    });
  });

  describe('Pillar 3: Deleted User Email Masking (user-display.ts)', () => {
    it('identifies deleted users via name and invalid email pattern', () => {
      expect(isDeletedUser('Utilisateur supprimé', 'deleted+abc@revime.invalid')).toBe(true);
      expect(isDeletedUser('Opérateur supprimé', 'deleted+xyz@revime.invalid')).toBe(true);
      expect(isDeletedUser('John Doe', 'deleted+123@revime.invalid')).toBe(true);
      expect(isDeletedUser('Utilisateur supprimé', 'some@email.com')).toBe(true);
      expect(isDeletedUser('Alice Martin', 'alice@example.com')).toBe(false);
      expect(isDeletedUser(null, undefined)).toBe(false);
    });

    it('safely suppresses deleted user email while preserving active emails', () => {
      expect(safeUserEmail('Utilisateur supprimé', 'deleted+abc@revime.invalid')).toBeNull();
      expect(safeUserEmail('Alice Martin', 'alice@example.com')).toBe('alice@example.com');
    });

    it('formats user display with DELETED_USER_NAME alone', () => {
      const deletedDisplay = formatUserDisplay(
        'Utilisateur supprimé',
        'deleted+abc@revime.invalid'
      );
      expect(deletedDisplay.name).toBe(DELETED_USER_NAME);
      expect(deletedDisplay.email).toBeNull();
      expect(deletedDisplay.isDeleted).toBe(true);

      const activeDisplay = formatUserDisplay('Bob Reparateur', 'bob@pro.fr');
      expect(activeDisplay.name).toBe('Bob Reparateur');
      expect(activeDisplay.email).toBe('bob@pro.fr');
      expect(activeDisplay.isDeleted).toBe(false);
    });
  });

  describe('Pillar 4: Clickable Dashboard KPI Tiles (KpiTile)', () => {
    it('renders an accessible Link with .kpi--clickable when href is specified', () => {
      const html = renderToString(
        <KpiTile
          label="Demandes ouvertes"
          value={{ kind: 'value', value: 12 }}
          href="/demandes?status=OPEN"
        />
      );

      expect(html).toContain('href="/demandes?status=OPEN"');
      expect(html).toContain('kpi--clickable');
      expect(html).toContain('Demandes ouvertes');
      expect(html).toContain('12');
    });

    it('renders a plain non-interactive tile when href is omitted', () => {
      const html = renderToString(
        <KpiTile
          label="Total arbitré"
          value={{ kind: 'value', value: 45 }}
        />
      );

      expect(html).not.toContain('href=');
      expect(html).not.toContain('kpi--clickable');
      expect(html).toContain('Total arbitré');
    });
  });

  describe('Pillar 5: Clickable Tables & Masked Emails in Views', () => {
    it('renders DisputeQueueTable with clickable rows, CopyableReference, and masked deleted emails', () => {
      const mockDisputes: AdminDisputeListItem[] = [
        {
          id: 'disp-11111111-2222-3333-4444-555555555555',
          number: 104,
          commandeId: '2c53de51-b157-430a-9d04-123456789abc',
          commandeStatus: 'PAID',
          initiator: 'CLIENT',
          reason: 'Colis endommagé',
          motif: 'ITEM_DAMAGED',
          clientName: 'Utilisateur supprimé',
          clientEmail: 'deleted+client1@revime.invalid',
          repairerName: 'Atelier Réparation',
          repairerEmail: 'atelier@pro.fr',
          repairCents: 8500,
          totalCents: 10500,
          assignedToUserId: null,
          assignedToName: null,
          status: 'OPEN',
          resolvedAt: null,
          verdict: null,
          createdAt: '2026-10-10T12:00:00.000Z',
        },
      ];

      const html = renderToString(
        <DisputeQueueTable items={mockDisputes} onOpenDossier={() => {}} />
      );

      // Row has pointer cursor
      expect(html).toContain('cursor:pointer');

      // Commande reference is formatted and links to payments
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('href="/paiements?commande=2c53de51-b157-430a-9d04-123456789abc"');

      // Deleted user displays DELETED_USER_NAME alone and never leaks deleted+...
      expect(html).toContain('Utilisateur supprimé');
      expect(html).not.toContain('deleted+client1@revime.invalid');

      // Active user email is displayed
      expect(html).toContain('atelier@pro.fr');
    });

    it('renders PaymentsTable with short references and masked deleted emails', () => {
      const mockPayments: AdminPaymentListItem[] = [
        {
          id: '2c53de51-b157-430a-9d04-123456789abc',
          createdAt: '2026-10-10T12:00:00.000Z',
          paidAt: '2026-10-10T12:00:00.000Z',
          clientName: 'Utilisateur supprimé',
          clientEmail: 'deleted+c99@revime.invalid',
          repairerName: 'Tech Services',
          repairerEmail: 'tech@services.fr',
          totalCents: 12000,
          repairCents: 10000,
          protectionCents: 1000,
          shippingCents: 1000,
          refundedCents: null,
          delivery: 'WORKSHOP',
          step: 'RELEASED',
          status: 'PAID',
          isDisputed: false,
          disputeId: null,
          disputeStatus: null,
          cancellationPending: false,
          stripeChargeId: 'ch_test_123',
          stripeTransferId: null,
          stripeRefundId: null,
          payoutStatus: 'NOT_APPLICABLE',
          payoutAmountCents: null,
        },
      ];

      const html = renderToString(
        <PaymentsTable items={mockPayments} onOpenDispute={() => {}} />
      );

      // Short reference formatted as CMD-2C53DE51 with copy button
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('data-testid="copy-reference-button"');

      // Deleted user email is suppressed
      expect(html).toContain('Utilisateur supprimé');
      expect(html).not.toContain('deleted+c99@revime.invalid');

      // Active repairer email preserved
      expect(html).toContain('tech@services.fr');
    });

    it('resolves audit target HREFs and masks deleted actor emails in RecentActions', () => {
      expect(getAuditTargetHref('user', 'usr-123')).toBe('/utilisateurs/usr-123');
      expect(getAuditTargetHref('demande', 'dem-456')).toBe('/demandes/dem-456');
      expect(getAuditTargetHref('dispute', 'disp-789')).toBe('/litiges?q=disp-789');
      expect(getAuditTargetHref('commande', 'cmd-abc')).toBe('/paiements?commande=cmd-abc');
      expect(getAuditTargetHref('signalement', 'sig-def')).toBe('/signalements/sig-def');

      const mockEntries: AdminAuditEntry[] = [
        {
          id: 'aud-1',
          action: 'user.suspend',
          statusCode: 200,
          actorEmail: 'deleted+op1@revime.invalid',
          targetType: 'user',
          targetId: 'usr-target-1',
          createdAt: '2026-10-10T12:00:00.000Z',
        },
      ];

      const html = renderToString(<RecentActions initialEntries={mockEntries} />);

      // Target links to user page
      expect(html).toContain('href="/utilisateurs/usr-target-1"');

      // Deleted actor email is masked as DELETED_USER_NAME
      expect(html).toContain('Utilisateur supprimé');
      expect(html).not.toContain('deleted+op1@revime.invalid');
    });
  });
});
