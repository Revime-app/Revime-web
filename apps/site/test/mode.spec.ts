import { describe, expect, it } from 'vitest';
import type { MeResponse } from '@revime/shared';
import { modeBody, needsClientMode } from '../lib/client/mode';

const me = (profile: Partial<MeResponse['profile']>) => ({ profile: { activeMode: 'CLIENT', clientEnabled: true, repairerEnabled: false, ...profile } }) as MeResponse;

describe('client / réparateur mode', () => {
  it('sends the same body as the app when switching', () => {
    expect(modeBody('CLIENT')).toEqual({ activeMode: 'CLIENT', clientEnabled: true });
    expect(modeBody('REPAIRER')).toEqual({ activeMode: 'REPAIRER' });
  });

  it('switches before publishing only for a réparateur-only account', () => {
    expect(needsClientMode(null)).toBe(false);
    expect(needsClientMode(me({}))).toBe(false);
    expect(needsClientMode(me({ activeMode: 'REPAIRER', clientEnabled: true }))).toBe(false);
    expect(needsClientMode(me({ activeMode: 'REPAIRER', clientEnabled: false }))).toBe(true);
  });
});
