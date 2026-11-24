import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminParticularQuota } from '@revime/shared';
import { ParticularQuotaBlock } from '../components/ParticularQuotaBlock';

/**
 * V7 A10 (U7, `DEC7-22` Q11). The offer gate now refuses a private individual at the cap, so the
 * counter's caption stops saying it does not, and a reached cap reads « Offres bloquées ».
 */
const quota = (missionsCount: number, amountCollectedCents: number): AdminParticularQuota => ({
  missionsCount,
  missionsMax: 10,
  amountCollectedCents,
  amountMaxCents: 150000,
  nextMissionReleaseAt: '2027-02-14T00:00:00.000Z',
  pendingPayoutCents: 0,
  isBlockedFiscal: false,
});

describe('V7 U7: the dashboard counter says the cap blocks offers', () => {
  it('states that offers are blocked at the cap, and no longer that the team must act', () => {
    const html = renderToString(<ParticularQuotaBlock quota={quota(3, 24000)} />);
    expect(html).toContain("Au plafond, les offres sont bloquées jusqu&#x27;à la vérification de l&#x27;entreprise.");
    expect(html).not.toContain('Ce compteur ne bloque pas les offres');
  });

  it.each([
    ['10 missions', quota(10, 0)],
    ['1 500 €', quota(2, 150000)],
  ])('reads « Offres bloquées » at %s', (_label, q) => {
    expect(renderToString(<ParticularQuotaBlock quota={q} />)).toContain('Offres bloquées');
  });

  it('says nothing of a block below the cap, 80 % included', () => {
    expect(renderToString(<ParticularQuotaBlock quota={quota(9, 149999)} />)).not.toContain('Offres bloquées');
  });
});
