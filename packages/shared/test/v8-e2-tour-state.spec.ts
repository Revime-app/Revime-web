import { describe, expect, it } from 'vitest';
import {
  TOUR_PAGE_IDS,
  newerTourMode,
  parseTourState,
  tourModeStateSchema,
  updateTourSchema,
  type TourModeState,
} from '../src/index.js';

/** V8 E2, `DEC8-09` (2): « seen » on the account, per mode, newest write wins. */

const at = (iso: string): TourModeState => ({ offer: 'STARTED', seen: [], updatedAt: iso });

describe('tourModeStateSchema', () => {
  it('accepts an empty, never-offered state', () => {
    expect(tourModeStateSchema.safeParse({ offer: null, seen: [], updatedAt: '2026-11-17T20:00:00.000Z' }).success).toBe(true);
  });

  it('rejects an unknown page id', () => {
    expect(tourModeStateSchema.safeParse({ offer: 'STARTED', seen: ['nope'], updatedAt: '2026-11-17T20:00:00.000Z' }).success).toBe(false);
  });

  it('rejects more pages than exist', () => {
    const seen = [...TOUR_PAGE_IDS, 'accueil'];
    expect(tourModeStateSchema.safeParse({ offer: 'STARTED', seen, updatedAt: '2026-11-17T20:00:00.000Z' }).success).toBe(false);
  });

  it('rejects an offer value other than STARTED or DECLINED', () => {
    expect(tourModeStateSchema.safeParse({ offer: 'LATER', seen: [], updatedAt: '2026-11-17T20:00:00.000Z' }).success).toBe(false);
  });

  it('names the eleven pages the two modes cover', () => {
    expect([...TOUR_PAGE_IDS]).toEqual([
      'accueil', 'publier', 'demandes', 'recherche', 'messages', 'reparations', 'offres', 'propositions', 'tableau', 'profil', 'parametres',
    ]);
  });
});

describe('updateTourSchema', () => {
  it('takes one mode and its whole state', () => {
    expect(updateTourSchema.safeParse({ mode: 'REPAIRER', state: at('2026-11-17T20:00:00.000Z') }).success).toBe(true);
    expect(updateTourSchema.safeParse({ mode: 'ADMIN', state: at('2026-11-17T20:00:00.000Z') }).success).toBe(false);
  });
});

describe('parseTourState', () => {
  it('reads a null or missing column as null (never offered)', () => {
    expect(parseTourState(null)).toBeNull();
    expect(parseTourState(undefined)).toBeNull();
  });

  it('reads a corrupt column as both modes empty, so /me never fails on it', () => {
    expect(parseTourState({ CLIENT: 'x' })).toEqual({ CLIENT: null, REPAIRER: null });
    expect(parseTourState('garbage')).toEqual({ CLIENT: null, REPAIRER: null });
  });

  it('reads a valid column as itself', () => {
    const state = { CLIENT: at('2026-11-17T20:00:00.000Z'), REPAIRER: null };
    expect(parseTourState(state)).toEqual(state);
  });
});

describe('newerTourMode', () => {
  const older = at('2026-11-17T20:00:00.000Z');
  const newer = { ...at('2026-11-17T21:00:00.000Z'), seen: ['accueil' as const] };

  it('null against null is null', () => {
    expect(newerTourMode(null, null)).toBeNull();
  });

  it('keeps whichever side exists', () => {
    expect(newerTourMode(older, null)).toBe(older);
    expect(newerTourMode(null, newer)).toBe(newer);
  });

  it('older write is ignored', () => {
    expect(newerTourMode(newer, older)).toBe(newer);
  });

  it('the newer incoming write wins', () => {
    expect(newerTourMode(older, newer)).toBe(newer);
  });

  it('a tie goes to the incoming write', () => {
    const incoming = { ...older, seen: ['profil' as const] };
    expect(newerTourMode(older, incoming)).toBe(incoming);
  });
});
