import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  BUSINESS_REQUIRED_AT_CAP_TEXT,
  PARTICULAR_CAP_REACHED_TEXT,
  PARTICULAR_CAP_WARNING_TEXT,
  PARTICULAR_QUOTA_MAX_CENTS,
  PARTICULAR_QUOTA_MAX_MISSIONS,
  myParticularQuotaResponseSchema,
  particularQuotaStanding,
} from '../src/index.js';

/**
 * V7 A10 (U7, `DEC7-22`): the private-individual cap of CGU art. 53, 10 missions or 1 500 € over a
 * rolling 12 months. One standing for the app's card, the offer form, the dashboard and the server.
 */
describe('V7 U7 particular quota, shared', () => {
  const figures = (missionsCount: number, amountCollectedCents: number) => ({
    missionsCount,
    missionsMax: PARTICULAR_QUOTA_MAX_MISSIONS,
    amountCollectedCents,
    amountMaxCents: PARTICULAR_QUOTA_MAX_CENTS,
  });

  it('is OK below 80 % of both limits', () => {
    expect(particularQuotaStanding(figures(7, 119_999))).toBe('OK');
  });

  it('warns at 8 missions or at 1 200 €, whichever comes first (Q2)', () => {
    expect(particularQuotaStanding(figures(8, 0))).toBe('WARNING');
    expect(particularQuotaStanding(figures(0, 120_000))).toBe('WARNING');
  });

  it('is reached AT 10 missions or AT 1 500 €, not past them (Q2)', () => {
    expect(particularQuotaStanding(figures(10, 0))).toBe('REACHED');
    expect(particularQuotaStanding(figures(0, 150_000))).toBe('REACHED');
    expect(particularQuotaStanding(figures(9, 149_999))).toBe('WARNING');
  });

  it('reads the limits it is given, not constants of its own', () => {
    expect(particularQuotaStanding({ missionsCount: 10, missionsMax: 20, amountCollectedCents: 0, amountMaxCents: 300_000 })).toBe('OK');
    expect(particularQuotaStanding({ missionsCount: 16, missionsMax: 20, amountCollectedCents: 0, amountMaxCents: 300_000 })).toBe('WARNING');
  });

  it('carries the agreed wording (Q5, Q7, Q8)', () => {
    expect(PARTICULAR_CAP_WARNING_TEXT).toBe(
      'Vous approchez du plafond des réparateurs particuliers. Au-delà, faites vérifier votre entreprise pour continuer à proposer des offres.',
    );
    expect(PARTICULAR_CAP_REACHED_TEXT).toBe(
      'Vous avez atteint le plafond des réparateurs particuliers (10 missions ou 1 500 € sur 12 mois). Faites vérifier votre entreprise dans « Mon entreprise » pour continuer à proposer des offres.',
    );
    expect(BUSINESS_REQUIRED_AT_CAP_TEXT).toBe('Requis pour continuer à proposer des offres : vérifiez votre SIREN ou SIRET.');
  });

  it('has its own error code, so the app can tell the cap from any other refusal', () => {
    expect(API_ERROR_CODES).toContain('PARTICULAR_CAP_REACHED');
  });

  it('parses the repairer’s own counter, and null for a professional', () => {
    const quota = {
      ...figures(8, 71_700),
      nextMissionReleaseAt: '2027-03-01T10:00:00.000Z',
      standing: 'WARNING',
    };
    expect(myParticularQuotaResponseSchema.parse({ quota, offerBlockedMessage: null }).quota?.standing).toBe('WARNING');
    expect(myParticularQuotaResponseSchema.parse({ quota: null, offerBlockedMessage: null }).quota).toBeNull();
  });
});
