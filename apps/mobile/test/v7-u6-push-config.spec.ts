import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * V7 A5 (U6). Android push needs Firebase: without `android.googleServicesFile` the build has no
 * FCM sender, `getExpoPushTokenAsync` rejects on every Android phone and no token ever reaches the
 * API (production held 0 Android tokens on 2026-10-28, `FND7-015`). Expo's prebuild copies the file
 * and applies the `com.google.gms.google-services` Gradle plugin from this one key.
 */
const root = path.resolve(__dirname, '..');
const app = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo;

describe('Android Firebase configuration (V7 A5)', () => {
  it('names a google-services.json that exists', () => {
    const file = app.android?.googleServicesFile;
    expect(typeof file).toBe('string');
    expect(existsSync(path.join(root, file))).toBe(true);
  });

  it('is the Firebase config of this Android package', () => {
    const services = JSON.parse(readFileSync(path.join(root, app.android.googleServicesFile), 'utf8'));
    const packages = services.client.map(
      (c: { client_info: { android_client_info: { package_name: string } } }) =>
        c.client_info.android_client_info.package_name,
    );
    expect(packages).toContain(app.android.package);
  });
});
