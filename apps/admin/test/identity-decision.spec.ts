import { describe, expect, it } from 'vitest';
import type { AdminVerificationListItem } from '@revime/shared';
import { allowedActions, decisionLine, parseDecisionForm } from '../lib/identity-decision';

/** CF4-39 (sub-project M, spec §4.4 / §4.6). Pure helpers of the identity decision panel. */

type Identity = NonNullable<AdminVerificationListItem['identity']>;
const identity = (over: Partial<Identity> = {}): Identity => ({
  stripeStatus: 'REQUIRES_INPUT',
  stripeSessionId: null,
  lastErrorCode: null,
  fraudSignal: false,
  decision: null,
  motif: null,
  note: null,
  decidedAt: null,
  decidedBy: null,
  ...over,
});

describe('allowedActions', () => {
  it('undecided, not Stripe-verified → all three', () => {
    expect(allowedActions(identity())).toEqual({ accept: true, refuse: true, request: true });
  });

  it('undecided, Stripe-verified → refuse and request only', () => {
    expect(allowedActions(identity({ stripeStatus: 'VERIFIED' }))).toEqual({ accept: false, refuse: true, request: true });
  });

  it('REFUSED → accept and request', () => {
    expect(allowedActions(identity({ stripeStatus: 'VERIFIED', decision: 'REFUSED' }))).toEqual({
      accept: true,
      refuse: false,
      request: true,
    });
  });

  it('DOCUMENTS_REQUESTED → accept and refuse', () => {
    expect(allowedActions(identity({ decision: 'DOCUMENTS_REQUESTED' }))).toEqual({
      accept: true,
      refuse: true,
      request: false,
    });
  });

  it('ACCEPTED → refuse and request', () => {
    expect(allowedActions(identity({ decision: 'ACCEPTED' }))).toEqual({ accept: false, refuse: true, request: true });
  });

  it('no identity row → none', () => {
    expect(allowedActions(null)).toEqual({ accept: false, refuse: false, request: false });
  });
});

describe('decisionLine', () => {
  const at = '2026-09-30T08:00:00.000Z';

  it('a refusal: label · motif · date par @author', () => {
    expect(decisionLine({ decision: 'REFUSED', motif: 'EXPIRED', note: null, decidedAt: at, decidedBy: 'ops' })).toBe(
      'Refusée par REVIME · Document expiré · 30/09/2026 par @ops',
    );
  });

  it('a documents request with Autre carries the note', () => {
    expect(
      decisionLine({ decision: 'DOCUMENTS_REQUESTED', motif: 'OTHER', note: 'Photo coupée', decidedAt: at, decidedBy: 'ops' }),
    ).toBe('Nouveaux documents demandés · Autre : Photo coupée · 30/09/2026 par @ops');
  });

  it('an acceptance shows its optional note', () => {
    expect(decisionLine({ decision: 'ACCEPTED', motif: null, note: 'Vu dans Stripe', decidedAt: at, decidedBy: 'ops' })).toBe(
      'Acceptée manuellement · Vu dans Stripe · 30/09/2026 par @ops',
    );
    expect(decisionLine({ decision: 'ACCEPTED', motif: null, note: null, decidedAt: at, decidedBy: 'ops' })).toBe(
      'Acceptée manuellement · 30/09/2026 par @ops',
    );
  });

  it('no author (fiche, or account gone) drops « par »', () => {
    expect(decisionLine({ decision: 'REFUSED', motif: 'ILLEGIBLE', note: null, decidedAt: at })).toBe(
      'Refusée par REVIME · Document illisible · 30/09/2026',
    );
    expect(decisionLine({ decision: 'REFUSED', motif: 'ILLEGIBLE', note: null, decidedAt: at, decidedBy: null })).toBe(
      'Refusée par REVIME · Document illisible · 30/09/2026',
    );
  });

  it('undecided or no identity → null', () => {
    expect(decisionLine({ decision: null, motif: null, note: null, decidedAt: null })).toBeNull();
    expect(decisionLine(null)).toBeNull();
  });
});

describe('parseDecisionForm', () => {
  it('maps the shared schema’s messages onto the two fields', () => {
    expect(parseDecisionForm('', '')).toEqual({ ok: false, errors: { motif: 'Choisissez un motif.' } });
    expect(parseDecisionForm('OTHER', '  ')).toEqual({ ok: false, errors: { note: 'Précisez le motif.' } });
    expect(parseDecisionForm('EXPIRED', 'x'.repeat(501))).toEqual({ ok: false, errors: { note: '500 caractères maximum.' } });
  });

  it('returns the body to send', () => {
    expect(parseDecisionForm('EXPIRED', ' ')).toEqual({ ok: true, data: { motif: 'EXPIRED' } });
    expect(parseDecisionForm('OTHER', ' Photo coupée ')).toEqual({ ok: true, data: { motif: 'OTHER', note: 'Photo coupée' } });
  });
});
