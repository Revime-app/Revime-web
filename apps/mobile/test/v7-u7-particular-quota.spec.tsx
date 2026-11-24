import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  BUSINESS_REQUIRED_AT_CAP_TEXT,
  PARTICULAR_CAP_REACHED_TEXT,
  PARTICULAR_CAP_WARNING_TEXT,
  type MyParticularQuotaResponse,
  type ParticularQuotaStanding,
} from '@revime/shared';
import { findNodes, findNodesByType, findTextNodes } from './render-tree';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: {
      ink: '#141414', ink2: '#2b2b2e', muted: '#6b7280', line: '#e4e7ec', paper: '#ffffff',
      amber: '#f79009', amberDeep: '#b45309', red: '#f61b39', redDeep: '#bd0e26', redSoft: '#feedf0', navy: '#25324f',
    },
    radii: { card: 20, field: 12 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
    type: { caption: { size: 12 } },
  }),
}));
vi.mock('../src/components/Button', () => ({
  Button: (props: Record<string, unknown>) => React.createElement('Button', props),
}));

import {
  businessCardLine,
  offerCapNotice,
  quotaCardView,
} from '../src/lib/particular-quota-view';
import { ParticularQuotaCard } from '../src/components/ParticularQuotaCard';
import { OfferCapNotice } from '../src/components/OfferCapNotice';

/**
 * V7 A10 (U7, `DEC7-22`). The private individual sees his CGU art. 53 counter on Profil, is warned
 * at 80 % on the card and the offer form, and at the cap the form's send button gives way to a card
 * that opens « Mon entreprise ». The figures and the refusal sentence come from the server.
 */

const NBSP = ' ';

function res(
  missionsCount: number,
  amountCollectedCents: number,
  standing: ParticularQuotaStanding,
  offerBlockedMessage: string | null = null,
): MyParticularQuotaResponse {
  return {
    quota: {
      missionsCount,
      missionsMax: 10,
      amountCollectedCents,
      amountMaxCents: 150000,
      nextMissionReleaseAt: '2027-03-01T10:00:00.000Z',
      standing,
    },
    offerBlockedMessage,
  };
}

const PROFESSIONAL: MyParticularQuotaResponse = { quota: null, offerBlockedMessage: null };

describe('V7 A10: the Profil card (Q4)', () => {
  it('shows nothing for a professional, or before the counter has loaded', () => {
    expect(quotaCardView(PROFESSIONAL)).toBeNull();
    expect(quotaCardView(undefined)).toBeNull();
  });

  it('gives missions and amount against their limits, whole euros, and the release date', () => {
    const view = quotaCardView(res(6, 59_750, 'OK'));
    expect(view?.missionsLine).toBe('Missions payées : 6 / 10');
    expect(view?.amountLine).toBe(`Montant encaissé : 597 € / 1${NBSP}500 €`);
    expect(view?.missionsPercent).toBe(60);
    expect(view?.amountPercent).toBe(40);
    expect(view?.releaseLine).toBe('Prochaine mission libérée le 01/03/2027.');
    expect(view?.tone).toBe('normal');
    expect(view?.notice).toBeNull();
    expect(view?.showBusinessButton).toBe(false);
  });

  it('turns to a warning at 80 % with the agreed sentence (Q5)', () => {
    const view = quotaCardView(res(8, 71_700, 'WARNING'));
    expect(view?.tone).toBe('warning');
    expect(view?.notice).toBe(PARTICULAR_CAP_WARNING_TEXT);
    expect(view?.showBusinessButton).toBe(false);
  });

  it('turns red at the cap, with the server’s sentence and the « Mon entreprise » button (Q7)', () => {
    const view = quotaCardView(res(10, 80_000, 'REACHED', PARTICULAR_CAP_REACHED_TEXT));
    expect(view?.tone).toBe('blocked');
    expect(view?.notice).toBe(PARTICULAR_CAP_REACHED_TEXT);
    expect(view?.showBusinessButton).toBe(true);
    expect(view?.missionsPercent).toBe(100);
  });

  it('caps a bar at 100 % past the limit', () => {
    expect(quotaCardView(res(12, 180_000, 'REACHED', PARTICULAR_CAP_REACHED_TEXT))?.amountPercent).toBe(100);
  });

  it('says so when no mission counts yet', () => {
    const empty = res(0, 0, 'OK');
    empty.quota!.nextMissionReleaseAt = null;
    expect(quotaCardView(empty)?.releaseLine).toBe('Aucune mission payée sur les 12 derniers mois.');
  });

  it('renders the card’s lines and its button', () => {
    const onOpenBusiness = vi.fn();
    const tree = ParticularQuotaCard({ view: quotaCardView(res(10, 80_000, 'REACHED', PARTICULAR_CAP_REACHED_TEXT))!, onOpenBusiness });
    const text = findNodesByType(tree, 'Text').map((n) => findTextNodes(n).join(''));
    expect(text).toContain('Missions payées : 10 / 10');
    expect(text).toContain(PARTICULAR_CAP_REACHED_TEXT);
    const [button] = findNodesByType(tree, 'Button');
    expect(button.props.label).toBe('Mon entreprise');
    button.props.onPress();
    expect(onOpenBusiness).toHaveBeenCalled();
  });
});

describe('V7 A10: the offer form (Q5, Q7, Q9)', () => {
  it('says nothing for a professional or below 80 %', () => {
    expect(offerCapNotice(PROFESSIONAL, null)).toEqual({ kind: 'none' });
    expect(offerCapNotice(res(7, 0, 'OK'), null)).toEqual({ kind: 'none' });
    expect(offerCapNotice(undefined, null)).toEqual({ kind: 'none' });
  });

  it('warns at 80 %', () => {
    expect(offerCapNotice(res(8, 0, 'WARNING'), null)).toEqual({ kind: 'warning', text: PARTICULAR_CAP_WARNING_TEXT });
  });

  it('blocks at the cap with the server’s sentence, « Vérification en cours » included', () => {
    const pending = 'Vérification en cours. Vous pourrez envoyer des offres dès que votre vérification sera validée.';
    expect(offerCapNotice(res(10, 0, 'REACHED', pending), null)).toEqual({ kind: 'blocked', text: pending });
  });

  it('blocks on the server’s PARTICULAR_CAP_REACHED refusal even before the counter has caught up', () => {
    expect(offerCapNotice(res(9, 0, 'WARNING'), PARTICULAR_CAP_REACHED_TEXT)).toEqual({
      kind: 'blocked',
      text: PARTICULAR_CAP_REACHED_TEXT,
    });
  });

  it('the blocked notice carries the sentence and opens Mon entreprise; the warning has no button', () => {
    const onOpenBusiness = vi.fn();
    const blocked = OfferCapNotice({ notice: { kind: 'blocked', text: PARTICULAR_CAP_REACHED_TEXT }, onOpenBusiness });
    expect(findNodesByType(blocked, 'Text').map((n) => findTextNodes(n).join(''))).toContain(PARTICULAR_CAP_REACHED_TEXT);
    findNodesByType(blocked, 'Button')[0].props.onPress();
    expect(onOpenBusiness).toHaveBeenCalled();

    const warning = OfferCapNotice({ notice: { kind: 'warning', text: PARTICULAR_CAP_WARNING_TEXT }, onOpenBusiness });
    expect(findNodesByType(warning, 'Button')).toEqual([]);
    expect(OfferCapNotice({ notice: { kind: 'none' }, onOpenBusiness })).toBeNull();
  });
});

describe('V7 A10: the Mon entreprise card (Q8)', () => {
  it('reads « Requis » at the cap and « Facultatif » otherwise', () => {
    expect(businessCardLine(res(10, 0, 'REACHED', PARTICULAR_CAP_REACHED_TEXT))).toBe(BUSINESS_REQUIRED_AT_CAP_TEXT);
    expect(businessCardLine(res(8, 0, 'WARNING'))).toMatch(/^Facultatif : /);
    expect(businessCardLine(PROFESSIONAL)).toMatch(/^Facultatif : /);
  });
});

describe('V7 A10: the screens use them', () => {
  const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

  it('the offer form reads the counter, shows the notice and refetches on the cap refusal', () => {
    const src = read('app/demande/[id]/offre.tsx');
    expect(src).toContain('useMyParticularQuota(');
    expect(src).toContain('<OfferCapNotice');
    expect(src).toContain("'PARTICULAR_CAP_REACHED'");
  });

  it('Profil renders the card and the Mon entreprise line', () => {
    const src = read('app/(tabs)/profil.tsx');
    expect(src).toContain('<ParticularQuotaCard');
    expect(src).toContain('businessCardLine(');
    expect(src).toContain('PLAFOND PARTICULIER');
  });

  it('a section label that never ends up in a Text node is not counted', () => {
    // Guards the helper above: `findNodes` sees only elements, not the source.
    expect(findNodes(null, () => true)).toEqual([]);
  });
});
