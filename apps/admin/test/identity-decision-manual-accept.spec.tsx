import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminVerificationListItem } from '@revime/shared';
import {
  validateIdentityAccept,
  stripeIdentitySessionUrl,
} from '../lib/identity-decision';
import {
  IdentityDecisionPanelView,
  sendIdentityAcceptRequest,
} from '../app/verifications/IdentityDecisionPanel';

const makeRow = (over: Partial<AdminVerificationListItem> = {}): AdminVerificationListItem => ({
  id: 'user-1:IDENTITY',
  userId: 'user-1',
  date: '2026-10-12T10:00:00Z',
  displayName: 'Hamed Klimane',
  username: 'hamedk',
  email: 'hamed@example.com',
  accountKind: 'PRO',
  type: 'IDENTITY',
  status: 'DOCUMENTS_REQUIRED',
  needsAction: true,
  detail: null,
  siren: null,
  siret: null,
  marker: 'demo',
  identity: {
    stripeStatus: 'REQUIRES_INPUT',
    stripeSessionId: 'vs_test_hamed_123',
    lastErrorCode: null,
    fraudSignal: false,
    decision: null,
    motif: null,
    note: null,
    decidedAt: null,
    decidedBy: null,
  },
  ...over,
});

describe('Bug B5: Identity manual acceptance validation & Stripe link', () => {
  describe('1. validateIdentityAccept pure helper', () => {
    it('rejects empty or whitespace-only note', () => {
      expect(validateIdentityAccept('')).toEqual({
        ok: false,
        error: "Le motif d'acceptation manuelle est obligatoire (au moins 5 caractères).",
      });
      expect(validateIdentityAccept('    ')).toEqual({
        ok: false,
        error: "Le motif d'acceptation manuelle est obligatoire (au moins 5 caractères).",
      });
    });

    it('rejects notes shorter than 5 characters', () => {
      expect(validateIdentityAccept('ok')).toEqual({
        ok: false,
        error: "Le motif d'acceptation manuelle est obligatoire (au moins 5 caractères).",
      });
      expect(validateIdentityAccept('abcd')).toEqual({
        ok: false,
        error: "Le motif d'acceptation manuelle est obligatoire (au moins 5 caractères).",
      });
    });

    it('rejects notes longer than 500 characters', () => {
      expect(validateIdentityAccept('a'.repeat(501))).toEqual({
        ok: false,
        error: '500 caractères maximum.',
      });
    });

    it('accepts valid justification note and returns trimmed text', () => {
      expect(validateIdentityAccept('  Passeport physique vérifié  ')).toEqual({
        ok: true,
        note: 'Passeport physique vérifié',
      });
    });
  });

  describe('2. stripeIdentitySessionUrl pure helper', () => {
    it('returns direct link to Stripe Identity verification session when ID provided', () => {
      expect(stripeIdentitySessionUrl('vs_test_hamed_123')).toBe(
        'https://dashboard.stripe.com/identity/verification-sessions/vs_test_hamed_123',
      );
    });

    it('falls back to general verifications dashboard when ID is missing or null', () => {
      expect(stripeIdentitySessionUrl(null)).toBe('https://dashboard.stripe.com/identity/verification-sessions');
      expect(stripeIdentitySessionUrl(undefined)).toBe('https://dashboard.stripe.com/identity/verification-sessions');
    });
  });

  describe('3. sendIdentityAcceptRequest', () => {
    it('rejects without network request if note is invalid', async () => {
      const fetchMock = vi.fn();
      await expect(sendIdentityAcceptRequest('user-1', '', fetchMock)).rejects.toThrow(
        "Le motif d'acceptation manuelle est obligatoire",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends PATCH with trimmed note when valid', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });

      const res = await sendIdentityAcceptRequest('user-1', '  Passeport vérifié  ', fetchMock);
      expect(res).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/proxy/admin/users/user-1/identity/accept',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: 'Passeport vérifié' }),
        }),
      );
    });
  });

  describe('4. IdentityDecisionPanelView rendering', () => {
    it('renders direct link to Stripe Identity session', () => {
      const row = makeRow();
      const html = renderToString(
        <IdentityDecisionPanelView
          row={row}
          canDecide={true}
          confirmingAccept={false}
          acceptNote=""
          banner={null}
          saving={false}
          onClose={() => {}}
          onChanged={() => {}}
          onStartConfirmAccept={() => {}}
          onCancelConfirmAccept={() => {}}
          onAccept={() => {}}
          onSetAcceptNote={() => {}}
          modal={null}
          onSetModal={() => {}}
          onConflict={() => {}}
        />,
      );

      expect(html).toContain('https://dashboard.stripe.com/identity/verification-sessions/vs_test_hamed_123');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('Consulter la session Stripe Identity');
    });

    it('renders mandatory justification note input when confirming acceptance', () => {
      const row = makeRow();
      const html = renderToString(
        <IdentityDecisionPanelView
          row={row}
          canDecide={true}
          confirmingAccept={true}
          acceptNote=""
          banner={null}
          saving={false}
          onClose={() => {}}
          onChanged={() => {}}
          onStartConfirmAccept={() => {}}
          onCancelConfirmAccept={() => {}}
          onAccept={() => {}}
          onSetAcceptNote={() => {}}
          modal={null}
          onSetModal={() => {}}
          onConflict={() => {}}
        />,
      );

      // Must be mandatory, not optional
      expect(html).toContain('Motif de justification (obligatoire)');
      expect(html).not.toContain('Note (facultatif)');
    });

    it('renders justification reason prominently when identity was accepted manually', () => {
      const row = makeRow({
        status: 'ADMIN_ACCEPTED',
        identity: {
          stripeStatus: 'REQUIRES_INPUT',
          stripeSessionId: 'vs_test_hamed_123',
          lastErrorCode: null,
          fraudSignal: false,
          decision: 'ACCEPTED',
          motif: null,
          note: 'Passeport physique contrôlé en agence',
          decidedAt: '2026-10-12T14:00:00Z',
          decidedBy: 'ops_lead',
        },
      });

      const html = renderToString(
        <IdentityDecisionPanelView
          row={row}
          canDecide={true}
          confirmingAccept={false}
          acceptNote=""
          banner={null}
          saving={false}
          onClose={() => {}}
          onChanged={() => {}}
          onStartConfirmAccept={() => {}}
          onCancelConfirmAccept={() => {}}
          onAccept={() => {}}
          onSetAcceptNote={() => {}}
          modal={null}
          onSetModal={() => {}}
          onConflict={() => {}}
        />,
      );

      expect(html).toContain('Motif d&#x27;acceptation manuelle :');
      expect(html).toContain('Passeport physique contrôlé en agence');
    });
  });
});
