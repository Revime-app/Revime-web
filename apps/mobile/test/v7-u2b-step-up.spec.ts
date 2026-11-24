import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
}));
// api.ts imports the auth client, which loads Expo's native modules; Node cannot.
vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));

import { deviceHeaders, DEVICE_ID_KEY } from '../src/lib/device-id';
import { runWithStepUp } from '../src/lib/step-up';
import { ApiError } from '../src/lib/api';

/**
 * V7 A11 (U2b). The app half: a device id that survives sign-out (its own secure-store key, which the
 * auth client's cookie wipe never touches), and « confirm, then try again » around a sensitive call.
 */
describe('deviceHeaders', () => {
  beforeEach(() => store.clear());

  it('creates one id, keeps it, and sends it with a label', () => {
    const first = deviceHeaders();
    expect(first['x-revime-device']).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(first['x-revime-device-label']).toMatch(/application Revime$/);
    expect(deviceHeaders()['x-revime-device']).toBe(first['x-revime-device']);
    expect(store.get(DEVICE_ID_KEY)).toBe(first['x-revime-device']);
  });

  it('keeps the id outside the auth client’s cookie key, so sign-out leaves it', () => {
    deviceHeaders();
    expect(DEVICE_ID_KEY).not.toMatch(/cookie/);
  });
});

describe('runWithStepUp', () => {
  const stepUp = new ApiError('STEP_UP_REQUIRED', 'Confirmez votre identité pour continuer.', undefined, 403);

  it('runs the call once when no confirmation is needed', async () => {
    const call = vi.fn(async () => 'done');
    const confirm = vi.fn(async () => true);
    expect(await runWithStepUp(call, confirm)).toEqual({ ok: true, value: 'done' });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks for confirmation on STEP_UP_REQUIRED, then tries again once', async () => {
    const call = vi.fn().mockRejectedValueOnce(stepUp).mockResolvedValueOnce('done');
    const confirm = vi.fn(async () => true);
    expect(await runWithStepUp(call, confirm)).toEqual({ ok: true, value: 'done' });
    expect(confirm).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('stops quietly when the user closes the sheet', async () => {
    const call = vi.fn().mockRejectedValue(stepUp);
    expect(await runWithStepUp(call, async () => false)).toEqual({ ok: false, cancelled: true });
    expect(call).toHaveBeenCalledOnce();
  });

  it('passes any other error through', async () => {
    const other = new ApiError('CONFLICT', 'Réparation en cours.', undefined, 409);
    await expect(runWithStepUp(vi.fn().mockRejectedValue(other), async () => true)).rejects.toBe(other);
  });
});
