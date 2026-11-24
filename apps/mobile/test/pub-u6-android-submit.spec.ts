import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * REVIME_APP_PUBLICATION_PREPARATION.md PUB-32 (unit U6): the Android submit profile.
 *
 * `eas submit --platform android --profile production` must land the AAB on Google Play's internal
 * testing track as a DRAFT, so nothing reaches testers or the public until the client promotes it in
 * Play Console himself (DECP-02, DECP-14). The Google service-account key lives in EAS credentials on
 * Expo's servers (PUB-10), never in git: so the profile carries no key path, and no key file is tracked.
 */
const mobile = path.resolve(__dirname, '..');
const eas = JSON.parse(readFileSync(path.join(mobile, 'eas.json'), 'utf8'));
const app = JSON.parse(readFileSync(path.join(mobile, 'app.json'), 'utf8'));

describe('submit.production.android', () => {
  const android = eas.submit?.production?.android;

  it('exists', () => {
    expect(android).toBeTruthy();
  });

  it('uploads to the internal testing track as a draft, never a live release', () => {
    expect(android.track).toBe('internal');
    expect(android.releaseStatus).toBe('draft');
    expect(android.rollout).toBeUndefined();
  });

  it('carries no service-account key path: the key is the one assigned to the app on EAS', () => {
    expect(android.serviceAccountKeyPath).toBeUndefined();
    expect(JSON.stringify(eas)).not.toMatch(/serviceAccountKeyPath|private_key/);
  });

  it('targets the same package the app is built with', () => {
    expect(app.expo.android.package).toBe('fr.revime.app');
    if (android.applicationId !== undefined) expect(android.applicationId).toBe(app.expo.android.package);
  });

  it('leaves the iOS submit profile as it was', () => {
    expect(eas.submit.production.ios).toMatchObject({
      ascAppId: '6800161772',
      appleTeamId: 'B53DSP22UV',
      bundleIdentifier: 'fr.revime.demo',
    });
  });
});

describe('no Google service-account key file in the app folder', () => {
  function jsonFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      if (name === 'node_modules' || name.startsWith('.')) return [];
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return jsonFiles(full);
      return name.endsWith('.json') ? [full] : [];
    });
  }

  it('finds none', () => {
    const keys = jsonFiles(mobile).filter((f) => /"type"\s*:\s*"service_account"/.test(readFileSync(f, 'utf8')));
    expect(keys).toEqual([]);
  });
});
