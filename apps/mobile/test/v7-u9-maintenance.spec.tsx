import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAINTENANCE_POLL_IN_USE_MS,
  MAINTENANCE_POLL_ON_SCREEN_MS,
  MAINTENANCE_STAFF_BANNER,
  MAINTENANCE_TITLE,
  type PlatformStatus,
} from '@revime/shared';
import { findNodesByType, findTextNodes } from './render-tree';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: { ink: '#141414', ink2: '#2b2b2e', muted: '#6b7280', line: '#e4e7ec', paper: '#ffffff', amber: '#f79009', amberDeep: '#b45309', navy: '#25324f' },
    accent: { accent: '#f61b39', accentDeep: '#bd0e26' },
    radii: { card: 20, field: 12 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
    type: { caption: { size: 12 } },
  }),
}));
vi.mock('../src/components/Button', () => ({
  Button: (props: Record<string, unknown>) => React.createElement('Button', props),
}));
vi.mock('../src/components/BrandWordmark', () => ({
  BrandWordmark: (props: Record<string, unknown>) => React.createElement('BrandWordmark', props),
}));
vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));

import { createMaintenanceWatcher, liftedFromScreen, maintenanceView } from '../src/lib/maintenance';
import { onMaintenanceAnswer } from '../src/lib/maintenance-signal';
import { throwApiError } from '../src/lib/api';
import { MaintenanceScreen, MaintenanceStaffBanner } from '../src/components/MaintenanceScreen';

/**
 * V7 D5 (U9, `DEC7-24`). The app's half of maintenance mode: a blocking screen for everyone but the
 * team, a banner for the team, the status read at launch, on return to the foreground, every 5 min
 * in use, every 60 s while the screen is up, and at once on a `MAINTENANCE` answer; fail open.
 */

const ON: PlatformStatus = { maintenance: { enabled: true, message: 'De retour à 18 h.' } };
const OFF: PlatformStatus = { maintenance: { enabled: false, message: 'De retour à 18 h.' } };
const base = { teamLogin: false, inAuthGroup: false };

describe('what the app shows', () => {
  it('nothing while maintenance is off, or while the status is unknown (fail open, Q4)', () => {
    expect(maintenanceView({ ...base, status: OFF, role: null })).toBe('none');
    expect(maintenanceView({ ...base, status: null, role: null })).toBe('none');
  });

  it('the screen to a client, a réparateur or a signed-out visitor', () => {
    expect(maintenanceView({ ...base, status: ON, role: null })).toBe('screen');
    expect(maintenanceView({ ...base, status: ON, role: 'user' })).toBe('screen');
  });

  it('the banner to a team member (Q5)', () => {
    expect(maintenanceView({ ...base, status: ON, role: 'support' })).toBe('banner');
  });

  it('the login screen after « Connexion équipe », and the screen again once he leaves it (Q1)', () => {
    expect(maintenanceView({ status: ON, role: null, teamLogin: true, inAuthGroup: true })).toBe('none');
    expect(maintenanceView({ status: ON, role: null, teamLogin: true, inAuthGroup: false })).toBe('screen');
    expect(maintenanceView({ status: ON, role: null, teamLogin: false, inAuthGroup: true })).toBe('screen');
  });
});

describe('when the screen lifts', () => {
  it('reloads the session once, since /users/me was refused while it was up', () => {
    expect(liftedFromScreen('screen', 'none')).toBe(true);
    expect(liftedFromScreen('screen', 'banner')).toBe(true);
    expect(liftedFromScreen('screen', 'screen')).toBe(false);
    expect(liftedFromScreen('none', 'none')).toBe(false);
    expect(liftedFromScreen(null, 'none')).toBe(false);
  });

  it('the gate calls the session refresh on that transition', () => {
    const gate = readFileSync(join(__dirname, '..', 'src/components/MaintenanceGate.tsx'), 'utf8');
    expect(gate).toMatch(/liftedFromScreen\([^)]*\)\)\s*void refresh\(\)/);
  });
});

describe('when the app reads the status (Q3)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function watcher(fetchStatus: () => Promise<PlatformStatus>) {
    const changes: (PlatformStatus | null)[] = [];
    const w = createMaintenanceWatcher({ fetchStatus, onChange: (s) => changes.push(s) });
    return { w, changes };
  }

  it('reads at launch, then every 5 minutes in use', async () => {
    const fetchStatus = vi.fn(async () => OFF);
    const { w, changes } = watcher(fetchStatus);
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(changes).toEqual([OFF]);
    await vi.advanceTimersByTimeAsync(MAINTENANCE_POLL_IN_USE_MS - 1);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    w.stop();
  });

  it('every 60 seconds while the screen is up, so it lifts by itself', async () => {
    const fetchStatus = vi.fn(async () => ON);
    const { w } = watcher(fetchStatus);
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    w.setOnScreen(true);
    await vi.advanceTimersByTimeAsync(MAINTENANCE_POLL_ON_SCREEN_MS);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    w.stop();
  });

  it('at once on refresh (foreground, « Réessayer », a MAINTENANCE answer)', async () => {
    const fetchStatus = vi.fn(async () => ON);
    const { w } = watcher(fetchStatus);
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    w.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    w.stop();
  });

  it('a failed first read changes nothing (the app opens), and a later one keeps the last answer', async () => {
    const fetchStatus = vi.fn<() => Promise<PlatformStatus>>().mockRejectedValueOnce(new Error('offline'));
    const { w, changes } = watcher(fetchStatus);
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(changes).toEqual([]);
    fetchStatus.mockResolvedValueOnce(ON).mockRejectedValueOnce(new Error('offline'));
    w.refresh();
    await vi.advanceTimersByTimeAsync(0);
    w.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(changes).toEqual([ON]);
    w.stop();
  });

  it('stops reading once stopped', async () => {
    const fetchStatus = vi.fn(async () => OFF);
    const { w } = watcher(fetchStatus);
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    w.stop();
    await vi.advanceTimersByTimeAsync(MAINTENANCE_POLL_IN_USE_MS * 3);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });
});

describe('a MAINTENANCE answer from any call', () => {
  it('tells the gate at once, and other errors do not', () => {
    const listener = vi.fn();
    const off = onMaintenanceAnswer(listener);
    expect(() => throwApiError({ error: { code: 'MAINTENANCE', message: 'De retour à 18 h.' } }, 503)).toThrow('De retour à 18 h.');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => throwApiError({ error: { code: 'SERVICE_UNAVAILABLE', message: 'x' } }, 503)).toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    expect(() => throwApiError({ error: { code: 'MAINTENANCE', message: 'y' } }, 503)).toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('the screen and the banner (Q2, Q5)', () => {
  it('shows the wordmark, the title, the dashboard message, « Réessayer » and « Connexion équipe »', () => {
    const onRetry = vi.fn();
    const onTeamLogin = vi.fn();
    const tree = MaintenanceScreen({ message: 'De retour à 18 h.', onRetry, onTeamLogin });
    expect(findNodesByType(tree, 'BrandWordmark')).toHaveLength(1);
    const text = findNodesByType(tree, 'Text').map((n) => findTextNodes(n).join(''));
    expect(text).toContain(MAINTENANCE_TITLE);
    expect(text).toContain('De retour à 18 h.');
    const [retry] = findNodesByType(tree, 'Button');
    expect(retry.props.label).toBe('Réessayer');
    retry.props.onPress();
    expect(onRetry).toHaveBeenCalled();
    const team = findNodesByType(tree, 'Pressable').find((n) => findTextNodes(n).join('') === 'Connexion équipe');
    expect(team).toBeDefined();
    team.props.onPress();
    expect(onTeamLogin).toHaveBeenCalled();
  });

  it('the team banner carries the agreed sentence', () => {
    const tree = MaintenanceStaffBanner();
    expect(findNodesByType(tree, 'Text').map((n) => findTextNodes(n).join(''))).toContain(MAINTENANCE_STAFF_BANNER);
  });
});

describe('wiring', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('the root layout wraps the navigator in the gate', () => {
    expect(read('app/_layout.tsx')).toMatch(/<MaintenanceGate>[\s\S]*<Stack[\s\S]*<\/MaintenanceGate>/);
  });

  it('the gate reads the public status route, on foreground, and on a MAINTENANCE answer', () => {
    const gate = read('src/components/MaintenanceGate.tsx');
    expect(gate).toContain("'/platform/status'");
    expect(gate).toContain('AppState');
    expect(gate).toContain('onMaintenanceAnswer(');
    expect(gate).toContain("router.push('/(auth)/login')");
  });
});
