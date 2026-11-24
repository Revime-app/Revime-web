import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { MeResponse } from '@revime/shared';

vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));

import { completeRoleStep } from '../src/lib/signup-actions';
import { shouldRetryMe, tabGateTarget } from '../src/lib/signup-steps';
import { onSessionStale } from '../src/lib/session-signal';
import { throwApiError } from '../src/lib/api';

/**
 * V9 B1, final review fixes (`CLIENT_FEEDBACK_V9.md` §11, U2 review row).
 * #1: the role step went to the tabs with the stale `me`, so the gate sent it back to the role step,
 *     forever. #2: a `me` that failed to load was never read again, so owed steps could be skipped.
 */
const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('#1 the role step refreshes before leaving', () => {
  it('applies the modes, then refreshes the session, in that order', async () => {
    const order: string[] = [];
    await completeRoleStep(
      { client: true, repairer: false },
      {
        applyModes: async () => {
          order.push('apply');
          return {} as MeResponse;
        },
        refresh: async () => {
          order.push('refresh');
        },
      },
    );
    expect(order).toEqual(['apply', 'refresh']);
  });

  it('does not refresh, and rethrows, when the modes fail (the screen shows the error)', async () => {
    const refresh = vi.fn(async () => {});
    await expect(
      completeRoleStep({ client: true, repairer: false }, {
        applyModes: async () => {
          throw new Error('suspendu');
        },
        refresh,
      }),
    ).rejects.toThrow('suspendu');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('the stale me is what looped: with it the gate returns to the role step', () => {
    const stale = {
      signupMethod: 'GOOGLE',
      usernameConfirmedAt: '2026-11-19T10:00:00.000Z',
      cguVersion: null,
      profile: { onboardingCompletedAt: null },
      emailVerified: true,
      phoneVerified: false,
    } as never;
    expect(tabGateTarget({ session: {}, me: stale })).toBe('/(auth)/roles?apply=1');
  });

  it('roles.tsx goes through completeRoleStep on the client card', () => {
    expect(src('app/(auth)/roles.tsx')).toMatch(/await completeRoleStep\(\{ client: true, repairer: false \}/);
  });
});

describe('#2 a me that failed to load is read again', () => {
  it('asks for a retry only while signed in, loaded, and without me', () => {
    expect(shouldRetryMe({ session: {}, loading: false, me: null })).toBe(true);
    expect(shouldRetryMe({ session: {}, loading: true, me: null })).toBe(false);
    expect(shouldRetryMe({ session: null, loading: false, me: null })).toBe(false);
    expect(shouldRetryMe({ session: {}, loading: false, me: {} as never })).toBe(false);
  });

  it('marks the session stale on both CGU refusals, and on nothing else', () => {
    const seen: number[] = [];
    const off = onSessionStale(() => seen.push(1));
    for (const code of ['CGU_ACCEPTANCE_REQUIRED', 'CGU_REACCEPT_REQUIRED', 'CONFLICT']) {
      try {
        throwApiError({ error: { code, message: 'm' } }, 403);
      } catch {
        // expected
      }
    }
    off();
    expect(seen).toHaveLength(2);
  });

  it('the session provider listens, and the tab layout retries', () => {
    expect(src('src/lib/session.tsx')).toMatch(/onSessionStale\(\(\) => \{?\s*void refreshIfStale\(\)/);
    expect(src('app/(tabs)/_layout.tsx')).toMatch(/shouldRetryMe\(\{ session, loading, me \}\)/);
  });
});
