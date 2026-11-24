import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DisputeSpacesPanel, type MainMessageItem } from '../app/litiges/DisputeSpacesPanel';
import { resolveConfidentialSender, resolveDisputeSender, DISPUTE_ROLE_STYLE } from '../lib/dispute-spaces';

describe('Bug B7: Dispute messaging sender display with names and role colors', () => {
  // The client asked for « une couleur par rôle »: pinned to the semantic tokens (they follow the theme), and the four
  // must be distinct, which the violet-to-blue collapse had broken (support and client shared a colour).
  it('gives each role its own colour (client info, réparateur warning, support success, system neutral)', () => {
    expect(DISPUTE_ROLE_STYLE.CLIENT.color).toBe('var(--badge-info-text)');
    expect(DISPUTE_ROLE_STYLE.REPAIRER.color).toBe('var(--badge-warning-text)');
    expect(DISPUTE_ROLE_STYLE.ADMIN.color).toBe('var(--badge-success-text)');
    expect(DISPUTE_ROLE_STYLE.SYSTEM.color).toBe('var(--ink2)');
    expect(new Set(Object.values(DISPUTE_ROLE_STYLE).map((s) => s.color)).size).toBe(4);
  });

  describe('resolveConfidentialSender (one party confidential space)', () => {
    const client = { id: 'c1', name: 'Camille Martin' };
    const repairer = { id: 'r1', name: 'Atelier Martin' };

    it('names the party of the tab for its own messages', () => {
      expect(resolveConfidentialSender({ author: 'CLIENT' }, 'CLIENT', client, repairer)).toMatchObject({
        role: 'CLIENT',
        label: 'Client · Camille Martin',
        color: DISPUTE_ROLE_STYLE.CLIENT.color,
      });
      expect(resolveConfidentialSender({ author: 'REPAIRER' }, 'REPAIRER', client, repairer)).toMatchObject({
        role: 'REPAIRER',
        label: 'Réparateur · Atelier Martin',
        color: DISPUTE_ROLE_STYLE.REPAIRER.color,
      });
    });

    it('labels the messages of REVIME as support whichever tab they are in', () => {
      for (const tab of ['CLIENT', 'REPAIRER'] as const) {
        expect(resolveConfidentialSender({ author: 'REVIME' }, tab, client, repairer)).toMatchObject({
          role: 'ADMIN',
          label: 'REVIME — Support',
        });
      }
    });

    it('does not stutter when the party has no real name (a deleted account)', () => {
      expect(resolveConfidentialSender({ author: 'CLIENT' }, 'CLIENT', { id: 'c1', name: 'Client' }, repairer).label).toBe('Client');
      expect(resolveConfidentialSender({ author: 'REPAIRER' }, 'REPAIRER', client, null).label).toBe('Réparateur');
    });
  });

  const mockClient = {
    id: 'usr_client_123',
    name: 'Camille Martin',
  };

  const mockRepairer = {
    id: 'usr_repairer_456',
    name: 'Atelier Martin',
  };

  describe('resolveDisputeSender helper', () => {
    it('resolves client message to "Client · <nom>" with blue styling', () => {
      const msg: MainMessageItem = {
        id: 'msg-1',
        senderUserId: 'usr_client_123',
        kind: 'USER',
        body: 'En combien de temps ?',
        createdAt: '2026-10-10T12:00:00.000Z',
      };

      const result = resolveDisputeSender(msg, mockClient, mockRepairer);
      expect(result.role).toBe('CLIENT');
      expect(result.label).toBe('Client · Camille Martin');
      expect(result.color).toBe(DISPUTE_ROLE_STYLE.CLIENT.color);
      expect(result.badgeBg).toBe(DISPUTE_ROLE_STYLE.CLIENT.badgeBg);
      expect(result.badgeBorder).toBe(DISPUTE_ROLE_STYLE.CLIENT.badgeBorder);
    });

    it('resolves repairer message to "Réparateur · <nom>" with amber styling', () => {
      const msg: MainMessageItem = {
        id: 'msg-2',
        senderUserId: 'usr_repairer_456',
        kind: 'USER',
        body: '1h max',
        createdAt: '2026-10-10T12:05:00.000Z',
      };

      const result = resolveDisputeSender(msg, mockClient, mockRepairer);
      expect(result.role).toBe('REPAIRER');
      expect(result.label).toBe('Réparateur · Atelier Martin');
      expect(result.color).toBe(DISPUTE_ROLE_STYLE.REPAIRER.color);
      expect(result.badgeBg).toBe(DISPUTE_ROLE_STYLE.REPAIRER.badgeBg);
      expect(result.badgeBorder).toBe(DISPUTE_ROLE_STYLE.REPAIRER.badgeBorder);
    });

    it('resolves support message to "REVIME — Support" with pink styling', () => {
      const msg: MainMessageItem = {
        id: 'msg-3',
        senderUserId: 'admin_ops_789',
        kind: 'SUPPORT',
        body: 'REVIME — Support : Bonjour, nous prenons en charge le litige.',
        createdAt: '2026-10-10T12:10:00.000Z',
      };

      const result = resolveDisputeSender(msg, mockClient, mockRepairer);
      expect(result.role).toBe('ADMIN');
      expect(result.label).toBe('REVIME — Support');
      expect(result.color).toBe(DISPUTE_ROLE_STYLE.ADMIN.color);
    });

    it('resolves system message to "Système" with neutral slate styling', () => {
      const msg: MainMessageItem = {
        id: 'msg-4',
        senderUserId: null,
        kind: 'SYSTEM',
        body: 'Litige ouvert : REVIME examine la situation.',
        createdAt: '2026-10-10T12:15:00.000Z',
      };

      const result = resolveDisputeSender(msg, mockClient, mockRepairer);
      expect(result.role).toBe('SYSTEM');
      expect(result.label).toBe('Système');
      expect(result.color).toBe(DISPUTE_ROLE_STYLE.SYSTEM.color);
    });

    it('falls back to "Client" and "Réparateur" when name is missing or empty', () => {
      const msgClient: MainMessageItem = {
        id: 'msg-5',
        senderUserId: 'usr_client_no_name',
        kind: 'USER',
        body: 'Test',
        createdAt: '2026-10-10T12:20:00.000Z',
      };
      const resultClient = resolveDisputeSender(
        msgClient,
        { id: 'usr_client_no_name', name: '' },
        mockRepairer,
      );
      expect(resultClient.role).toBe('CLIENT');
      expect(resultClient.label).toBe('Client');

      const msgRepairer: MainMessageItem = {
        id: 'msg-6',
        senderUserId: 'usr_repairer_no_name',
        kind: 'USER',
        body: 'Test 2',
        createdAt: '2026-10-10T12:25:00.000Z',
      };
      const resultRepairer = resolveDisputeSender(
        msgRepairer,
        mockClient,
        { id: 'usr_repairer_no_name', name: '   ' },
      );
      expect(resultRepairer.role).toBe('REPAIRER');
      expect(resultRepairer.label).toBe('Réparateur');
    });

    it('does not duplicate prefix or stutter when senderName is "Client" or "Réparateur"', () => {
      const msgClientDup: MainMessageItem = {
        id: 'msg-dup-1',
        senderUserId: 'usr_client_dup',
        senderRole: 'CLIENT',
        senderName: 'Client',
        body: 'Message from client with senderName="Client"',
        createdAt: '2026-10-10T12:28:00.000Z',
      };
      const resClient = resolveDisputeSender(
        msgClientDup,
        { id: 'usr_client_dup', name: '' },
        mockRepairer,
      );
      expect(resClient.label).toBe('Client');
      expect(resClient.label).not.toBe('Client · Client');

      const msgRepairerDup: MainMessageItem = {
        id: 'msg-dup-2',
        senderUserId: 'usr_repairer_dup',
        senderRole: 'REPAIRER',
        senderName: 'Réparateur',
        body: 'Message from repairer with senderName="Réparateur"',
        createdAt: '2026-10-10T12:29:00.000Z',
      };
      const resRepairer = resolveDisputeSender(
        msgRepairerDup,
        mockClient,
        { id: 'usr_repairer_dup', name: '' },
      );
      expect(resRepairer.label).toBe('Réparateur');
      expect(resRepairer.label).not.toBe('Réparateur · Réparateur');
    });

    it('strips redundant prefix if name already starts with "Client · " or "Réparateur · "', () => {
      const msgPre: MainMessageItem = {
        id: 'msg-pre-1',
        senderUserId: 'usr_c_pre',
        senderRole: 'CLIENT',
        senderName: 'Client · Jean Dupont',
        body: 'Message already prefixed',
        createdAt: '2026-10-10T12:30:00.000Z',
      };
      const res = resolveDisputeSender(msgPre, { id: 'usr_c_pre', name: 'Client · Jean Dupont' }, null);
      expect(res.label).toBe('Client · Jean Dupont');
      expect(res.label).not.toContain('Client · Client');
    });

    it('falls back to "Participant" for unknown user ID without name', () => {
      const msgUnknown: MainMessageItem = {
        id: 'msg-7',
        senderUserId: 'usr_stranger_999',
        kind: 'USER',
        body: 'Inconnu',
        createdAt: '2026-10-10T12:30:00.000Z',
      };
      const result = resolveDisputeSender(msgUnknown, mockClient, mockRepairer);
      expect(result.role).toBe('UNKNOWN');
      expect(result.label).toBe('Participant');
    });
  });

  describe('DisputeSpacesPanel component rendering', () => {
    it('renders "Client · <nom>" and "Réparateur · <nom>" instead of raw user ID codes', () => {
      const messages: MainMessageItem[] = [
        {
          id: 'm1',
          senderUserId: 'usr_client_123',
          kind: 'USER',
          body: 'En combien de temps ?',
          createdAt: '2026-10-10T12:00:00.000Z',
        },
        {
          id: 'm2',
          senderUserId: 'usr_repairer_456',
          kind: 'USER',
          body: '1h max',
          createdAt: '2026-10-10T12:05:00.000Z',
        },
        {
          id: 'm3',
          senderUserId: null,
          kind: 'SYSTEM',
          body: 'Litige ouvert : REVIME examine la situation.',
          createdAt: '2026-10-10T12:10:00.000Z',
        },
      ];

      const html = renderToString(
        <DisputeSpacesPanel
          disputeId="disp-123"
          disputeStatus="OPEN"
          mainMessages={messages}
          client={mockClient}
          repairer={mockRepairer}
        />,
      );

      // Must NOT display raw user ID codes
      expect(html).not.toContain('usr_client_123');
      expect(html).not.toContain('usr_repairer_456');

      // MUST display Human role + Name
      expect(html).toContain('Client · Camille Martin');
      expect(html).toContain('Réparateur · Atelier Martin');
      expect(html).toContain('Système');

      // MUST display role colors
      expect(html).toContain(DISPUTE_ROLE_STYLE.CLIENT.color);
      expect(html).toContain(DISPUTE_ROLE_STYLE.REPAIRER.color);
    });
  });
});
