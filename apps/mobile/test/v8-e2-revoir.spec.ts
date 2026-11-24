import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TourState } from '@revime/shared';
import { replayState } from '../src/lib/tour';

/** V8 E2 criterion 8, `DEC8-09` (5), `Q8-02`: « Revoir la visite » resets the current mode only. */

const NOW = new Date('2026-11-17T23:30:00.000Z');
const before: TourState = {
  CLIENT: { offer: 'DECLINED', seen: ['accueil', 'profil'], updatedAt: '2026-11-17T20:00:00.000Z' },
  REPAIRER: { offer: 'STARTED', seen: ['accueil'], updatedAt: '2026-11-17T21:00:00.000Z' },
};

describe('replayState', () => {
  it('restarts the current mode with nothing seen and no offer', () => {
    expect(replayState(before, 'CLIENT', NOW).CLIENT).toEqual({ offer: 'STARTED', seen: [], updatedAt: NOW.toISOString() });
  });

  it('leaves the other mode untouched', () => {
    expect(replayState(before, 'CLIENT', NOW).REPAIRER).toBe(before.REPAIRER);
    expect(replayState(before, 'REPAIRER', NOW).CLIENT).toBe(before.CLIENT);
  });

  it('works on a never-written state', () => {
    expect(replayState(null, 'REPAIRER', NOW)).toEqual({
      CLIENT: null,
      REPAIRER: { offer: 'STARTED', seen: [], updatedAt: NOW.toISOString() },
    });
  });
});

describe('the Paramètres row', () => {
  const src = readFileSync(resolve(__dirname, '../app/parametres/index.tsx'), 'utf8');

  it('sits in the « Mode » section right after « Mode réparateur », and closes it', () => {
    const mode = src.slice(src.indexOf('<SettingsSection title="Mode">'), src.indexOf('</SettingsSection>', src.indexOf('<SettingsSection title="Mode">')));
    const reparateur = mode.indexOf('label="Mode réparateur"');
    const revoir = mode.indexOf('label={REVOIR_LA_VISITE}');
    expect(reparateur).toBeGreaterThan(-1);
    expect(revoir).toBeGreaterThan(reparateur);
    expect(mode.slice(reparateur, revoir)).not.toMatch(/\blast\b/);
    expect(mode.slice(revoir)).toMatch(/\blast\b/);
  });

  it('replays the current mode and carries its own bubble target', () => {
    expect(src).toMatch(/onPress=\{replayCurrentMode\}/);
    expect(src).toMatch(/useTourTarget\('revoirVisite'\)/);
  });
});

describe('review fix I1: « Revoir la visite » returns to the existing tab shell', () => {
  it('dismisses the stack before switching to Accueil, never pushing a second (tabs)', () => {
    const provider = readFileSync(resolve(__dirname, '../src/tour/TourProvider.tsx'), 'utf8');
    const body = provider.slice(provider.indexOf('const replayCurrentMode'), provider.indexOf('const value = useMemo'));
    expect(body).toMatch(/if \(router\.canDismiss\(\)\) router\.dismissAll\(\);\s*router\.navigate\('\/\(tabs\)'\)/);
  });
});
