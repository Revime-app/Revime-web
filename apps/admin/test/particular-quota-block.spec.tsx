import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminParticularQuota } from '@revime/shared';
import { ParticularQuotaBlock } from '../components/ParticularQuotaBlock';

describe('A-2: ParticularQuotaBlock Component', () => {
  const sampleQuota: AdminParticularQuota = {
    missionsCount: 3,
    missionsMax: 10,
    amountCollectedCents: 24000,
    amountMaxCents: 150000,
    nextMissionReleaseAt: '2027-02-14T00:00:00.000Z',
    pendingPayoutCents: 8500,
    isBlockedFiscal: true,
  };

  it('renders title and structure matching mockup page9_img1.png', () => {
    const html = renderToString(<ParticularQuotaBlock quota={sampleQuota} />);

    expect(html).toContain('Compteur particulier · 12 mois glissants');
    expect(html).toContain('Missions payées :');
    expect(html).toContain('3 / 10');
    expect(html).toContain('Montant encaissé :');
    expect(html).toContain('240');
    // `Intl` separates thousands with a narrow no-break space; \s matches it and a plain space alike.
    expect(html).toMatch(/1\s500\s€/);
    expect(html).toContain('Versements');
  });

  it('calculates and renders progress bar widths correctly', () => {
    const html = renderToString(<ParticularQuotaBlock quota={sampleQuota} />);

    // missionsPercent: 3 / 10 = 30%
    expect(html).toContain('width:30%');
    // amountPercent: 24000 / 150000 = 16%
    expect(html).toContain('width:16%');
  });

  it('caps progress bar width at 100% when exceeding limits', () => {
    const cappedQuota: AdminParticularQuota = {
      ...sampleQuota,
      missionsCount: 12,
      amountCollectedCents: 180000,
    };
    const html = renderToString(<ParticularQuotaBlock quota={cappedQuota} />);

    expect(html).toContain('width:100%');
    expect(html).toContain('12 / 10');
  });

  it('displays next mission release date when available', () => {
    const html = renderToString(<ParticularQuotaBlock quota={sampleQuota} />);

    expect(html).toContain('Prochaine mission libérée le');
    expect(html).toMatch(/Plafond \(CGU art\. 53\) : 10 missions ou 1\s500\s€\./);
  });

  // V7 A10 (U7) reversed ISS-061: the offer gate now enforces the ceiling, so the caption says it does
  // (v7-u7-particular-quota-block.spec.tsx). Still not the mockup's « Blocage automatique » wording.
  it('says the ceiling blocks offers, in the agreed words rather than the mockup’s', () => {
    const html = renderToString(<ParticularQuotaBlock quota={sampleQuota} />);

    expect(html).not.toContain('Blocage automatique');
    expect(html).not.toContain('Ce compteur ne bloque pas les offres');
    expect(html).toContain('Au plafond, les offres sont bloquées');
  });

  it('states the ceiling the server sent, not a constant of its own', () => {
    const html = renderToString(
      <ParticularQuotaBlock quota={{ ...sampleQuota, missionsMax: 20, amountMaxCents: 300000 }} />,
    );
    expect(html).toMatch(/Plafond \(CGU art\. 53\) : 20 missions ou 3\s000\s€\./);
  });

  it('displays fallback release message when no missions exist', () => {
    const zeroQuota: AdminParticularQuota = {
      ...sampleQuota,
      missionsCount: 0,
      amountCollectedCents: 0,
      nextMissionReleaseAt: null,
      pendingPayoutCents: 0,
      isBlockedFiscal: false,
    };
    const html = renderToString(<ParticularQuotaBlock quota={zeroQuota} />);

    expect(html).toContain('Aucune mission sur les 12 derniers mois.');
    expect(html).toContain('Plafond (CGU art. 53)');
  });

  it('renders pending payout and displays Bloqué : infos fiscales badge when blocked', () => {
    const html = renderToString(<ParticularQuotaBlock quota={sampleQuota} />);

    expect(html).toContain('En attente');
    expect(html).toContain('85,00');
    expect(html).toContain('Bloqué : infos fiscales');
  });

  it('renders pending payout without badge when fiscal declaration is complete', () => {
    const unblockedQuota: AdminParticularQuota = {
      ...sampleQuota,
      isBlockedFiscal: false,
      pendingPayoutCents: 12000,
    };
    const html = renderToString(<ParticularQuotaBlock quota={unblockedQuota} />);

    expect(html).toContain('En attente');
    expect(html).toContain('120,00');
    expect(html).not.toContain('Bloqué : infos fiscales');
  });
});
