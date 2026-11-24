import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accents, palette, radii, spacing } from '@revime/tokens';
import type { OfferBlock } from '@revime/shared';
import { findNodesByType, findTextNodes } from './render-tree';

/** V8 E1, mockup 3 (`DEC8-08` (6)): one sheet per reason the server would refuse an offer. */

const mockPush = vi.fn();
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock('../src/theme', () => ({
  useTheme: () => ({ palette, accent: accents.pro, radii, spacing }),
}));
vi.mock('../src/icons', () => ({
  IconShieldCheck: (props: any) => React.createElement('IconShieldCheck', props),
  IconBriefcase: (props: any) => React.createElement('IconBriefcase', props),
  IconMailSend: (props: any) => React.createElement('IconMailSend', props),
  IconClock: (props: any) => React.createElement('IconClock', props),
}));

let mockMe: any;
vi.mock('../src/lib/session', () => ({ useSessionContext: () => ({ me: mockMe }) }));
let mockIdentity: any = null;
let mockBusiness: any = null;
const identityEnabled = vi.fn();
const businessEnabled = vi.fn();
vi.mock('../src/lib/queries', () => ({
  useIdentityStatus: (enabled: boolean) => {
    identityEnabled(enabled);
    return { data: enabled ? mockIdentity : undefined };
  },
  useBusinessStatus: (enabled: boolean) => {
    businessEnabled(enabled);
    return { data: enabled ? mockBusiness : undefined };
  },
}));

import { useOfferBlock } from '../src/lib/use-offer-block';
import { OfferGateSheet } from '../src/components/OfferGateSheet';

function me(over: { level?: string; kind?: string; connectEnabled?: boolean; identityRequired?: boolean } = {}) {
  return {
    verificationRequired: true,
    identityRequired: over.identityRequired ?? true,
    connectEnabled: over.connectEnabled ?? true,
    profile: { verificationLevel: over.level ?? 'BASIC', repairerEnabled: true },
    repairer: { kind: over.kind ?? 'INDIVIDUAL' },
  };
}

beforeEach(() => {
  mockIdentity = null;
  mockBusiness = null;
  mockPush.mockClear();
});

describe('V8 E1 useOfferBlock', () => {
  it('a repairer with nothing verified is IDENTITY', () => {
    mockMe = me();
    expect(useOfferBlock()).toBe('IDENTITY');
  });
  it('an identity session under review is IDENTITY_PENDING', () => {
    mockMe = me();
    mockIdentity = { status: 'PROCESSING', lastErrorCode: null, decision: null };
    expect(useOfferBlock()).toBe('IDENTITY_PENDING');
  });
  it('a PRO at IDENTITY reads his business status (and only then asks for it)', () => {
    mockMe = me({ level: 'IDENTITY', kind: 'PRO' });
    mockBusiness = { status: 'PENDING' };
    expect(useOfferBlock()).toBe('BUSINESS_PENDING');
    expect(businessEnabled).toHaveBeenLastCalledWith(true);
    mockMe = me({ level: 'IDENTITY' });
    useOfferBlock();
    expect(businessEnabled).toHaveBeenLastCalledWith(false);
  });
  it('an unconfirmed account is BASIC', () => {
    mockMe = me({ level: 'NONE' });
    expect(useOfferBlock()).toBe('BASIC');
  });
  it('no lock when connect is off (no way to verify), as CF-10 ruled', () => {
    mockMe = me({ connectEnabled: false });
    expect(useOfferBlock()).toBeNull();
  });
  it('a verified repairer is not blocked', () => {
    mockMe = me({ level: 'IDENTITY' });
    expect(useOfferBlock()).toBeNull();
  });
});

function sheet(block: OfferBlock) {
  const onVerifyIdentity = vi.fn();
  const onDismiss = vi.fn();
  const tree = OfferGateSheet({ visible: true, block, onDismiss, onVerifyIdentity, verifying: false, error: null });
  const buttons = findNodesByType(tree, 'Button');
  return { tree, texts: findTextNodes(tree), buttons, onVerifyIdentity, onDismiss };
}

describe('V8 E1 OfferGateSheet', () => {
  it('IDENTITY: mockup 3', () => {
    const { texts, buttons, onVerifyIdentity } = sheet('IDENTITY');
    expect(texts).toContain('Vérifiez votre identité pour envoyer votre offre');
    expect(texts).toContain(
      "Pour la sécurité de tous, chaque réparateur doit vérifier son identité avant de proposer une réparation. Ça ne se fait qu'une fois.",
    );
    expect(texts).toContain("Vérification d'identité · 2 min");
    expect(buttons.map((b) => b.props.label)).toEqual(['Vérifier mon identité', 'Plus tard']);
    buttons[0].props.onPress();
    expect(onVerifyIdentity).toHaveBeenCalled();
  });

  it('IDENTITY_PENDING: under review, nothing to press but « Plus tard »', () => {
    const { texts, buttons } = sheet('IDENTITY_PENDING');
    expect(texts).toContain('Vérification en cours');
    expect(texts).toContain(
      'Vos documents ont bien été transmis. Vous pourrez envoyer des offres dès que votre vérification sera validée.',
    );
    expect(buttons.map((b) => b.props.label)).toEqual(['Plus tard']);
  });

  it('BUSINESS: the Pro step, to « Mon entreprise »', () => {
    const { texts, buttons, onDismiss } = sheet('BUSINESS');
    expect(texts).toContain('Vérifiez votre entreprise pour envoyer votre offre');
    expect(texts).toContain(
      "Pour envoyer une offre en tant que professionnel, votre entreprise doit être vérifiée. Ça ne se fait qu'une fois.",
    );
    expect(texts).toContain('Informations professionnelles · 3 min');
    buttons[0].props.onPress();
    expect(buttons[0].props.label).toBe('Vérifier mon entreprise');
    expect(onDismiss).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/entreprise');
  });

  it("BUSINESS_REDO: the server's own sentence", () => {
    const { texts, buttons } = sheet('BUSINESS_REDO');
    expect(texts).toContain(
      "Votre vérification d'entreprise est à refaire : ouvrez « Mon entreprise » pour en voir le motif.",
    );
    expect(buttons[0].props.label).toBe('Vérifier mon entreprise');
  });

  it('BUSINESS_PENDING: under review', () => {
    const { texts, buttons } = sheet('BUSINESS_PENDING');
    expect(texts).toContain('Vérification en cours');
    expect(texts).toContain(
      'Vérification en cours. Vous pourrez envoyer des offres dès que votre vérification sera validée.',
    );
    expect(buttons.map((b) => b.props.label)).toEqual(['Plus tard']);
  });

  it('BASIC: confirm the account first', () => {
    const { texts, buttons } = sheet('BASIC');
    expect(texts).toContain('Confirmez votre compte pour envoyer votre offre');
    expect(texts).toContain(
      "Pour envoyer une offre, confirmez votre adresse e-mail ou votre numéro de mobile. Cela prend moins d'une minute.",
    );
    buttons[0].props.onPress();
    expect(mockPush).toHaveBeenCalledWith('/verification');
  });
});

describe('V8 E1 request page wiring', () => {
  const page = readFileSync(resolve(__dirname, '../app/demande/[id]/index.tsx'), 'utf8');
  it('locks « Faire une offre » on useOfferBlock and opens OfferGateSheet with that block', () => {
    expect(page).toContain("from '../../../src/lib/use-offer-block'");
    expect(page).toContain('<OfferGateSheet');
    expect(page).toMatch(/block=\{offerBlockReason\}/);
    expect(page).not.toContain('IdentityGateSheet');
  });
});
