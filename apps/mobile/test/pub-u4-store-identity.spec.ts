import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * REVIME_APP_PUBLICATION_PREPARATION.md U4 (PUB-30, PUB-38, PUB-39): what the store binary declares
 * about itself.
 *
 * PUB-30. Apple rejects an upload whose « required reason » APIs have no declared reason. Expo's
 * guide: Apple does not reliably read the PrivacyInfo files of static CocoaPods dependencies, so the
 * app's own manifest (`ios.privacyManifests`) must repeat every category and reason its dependencies
 * declare. This test derives that list from the dependencies' own files, so a new dependency that
 * declares a new reason fails here instead of at App Store Connect.
 */
const mobile = path.resolve(__dirname, '..');
const repoRoot = path.resolve(mobile, '..', '..');
const app = JSON.parse(readFileSync(path.join(mobile, 'app.json'), 'utf8')).expo;

type ApiEntry = { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] };

/** Every PrivacyInfo.xcprivacy shipped under a package's `ios/` folder, plus React Native's own. */
function dependencyManifests(): string[] {
  const nm = path.join(repoRoot, 'node_modules');
  const found: string[] = [];
  const packages: string[] = [];
  for (const entry of readdirSync(nm)) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      for (const sub of readdirSync(path.join(nm, entry))) packages.push(path.join(nm, entry, sub));
    } else {
      packages.push(path.join(nm, entry));
    }
  }
  for (const pkg of packages) {
    const f = path.join(pkg, 'ios', 'PrivacyInfo.xcprivacy');
    if (existsSync(f)) found.push(f);
  }
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'example' || e.name === 'android') continue;
        walk(p);
      } else if (e.name === 'PrivacyInfo.xcprivacy') {
        found.push(p);
      }
    }
  };
  walk(path.join(nm, 'react-native'));
  return found;
}

/** Category → reasons, read from a plist's NSPrivacyAccessedAPITypes array. */
function declaredReasons(plist: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const blocks = plist.split('<key>NSPrivacyAccessedAPIType</key>').slice(1);
  for (const block of blocks) {
    const type = /<string>(NSPrivacyAccessedAPICategory\w+)<\/string>/.exec(block)?.[1];
    if (!type) continue;
    const reasonsBlock = block.split('<key>NSPrivacyAccessedAPITypeReasons</key>')[1] ?? '';
    const arr = reasonsBlock.slice(0, reasonsBlock.indexOf('</array>'));
    const reasons = [...arr.matchAll(/<string>([0-9A-F]{4}\.\d)<\/string>/g)].map((m) => m[1]);
    const set = out.get(type) ?? new Set<string>();
    reasons.forEach((r) => set.add(r));
    out.set(type, set);
  }
  return out;
}

describe('iOS privacy manifest (PUB-30)', () => {
  const manifest = app.ios?.privacyManifests;

  it('exists in app.json', () => {
    expect(manifest).toBeTruthy();
  });

  it('declares no tracking and no tracking domains', () => {
    expect(manifest?.NSPrivacyTracking).toBe(false);
    expect(manifest?.NSPrivacyTrackingDomains ?? []).toEqual([]);
  });

  it('repeats every category and reason the dependencies declare', () => {
    const files = dependencyManifests();
    expect(files.length).toBeGreaterThan(3); // control: the scan finds files at all
    const needed = new Map<string, Set<string>>();
    for (const f of files) {
      for (const [type, reasons] of declaredReasons(readFileSync(f, 'utf8'))) {
        const set = needed.get(type) ?? new Set<string>();
        reasons.forEach((r) => set.add(r));
        needed.set(type, set);
      }
    }
    expect(needed.size).toBeGreaterThan(0);
    const declared = new Map<string, Set<string>>(
      ((manifest?.NSPrivacyAccessedAPITypes ?? []) as ApiEntry[]).map((e) => [
        e.NSPrivacyAccessedAPIType,
        new Set(e.NSPrivacyAccessedAPITypeReasons),
      ]),
    );
    for (const [type, reasons] of needed) {
      for (const r of reasons) {
        expect(declared.get(type)?.has(r), `${type} ${r}`).toBe(true);
      }
    }
  });
});

describe('store identity (PUB-39)', () => {
  it('is Revime 1.0.0', () => {
    expect(app.name).toBe('Revime');
    expect(app.version).toBe('1.0.0');
  });

  it('keeps the identifiers the stores already know', () => {
    // fr.revime.demo is permanent for App Store record 6800161772 (FNDP-18); fr.revime.app becomes
    // permanent at the first Play upload.
    expect(app.ios.bundleIdentifier).toBe('fr.revime.demo');
    expect(app.android.package).toBe('fr.revime.app');
    expect(app.ios.supportsTablet).toBe(false);
  });

  it('has a 1024 x 1024 icon without an alpha channel (Apple rejects alpha)', async () => {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(path.join(mobile, app.icon)).metadata();
    expect([meta.width, meta.height]).toEqual([1024, 1024]);
    expect(meta.hasAlpha).toBe(false);
  });
});

describe('permissions and usage strings (PUB-38)', () => {
  const picker = (app.plugins as unknown[]).find(
    (p) => Array.isArray(p) && p[0] === 'expo-image-picker',
  ) as [string, Record<string, unknown>];

  it('explains the camera by the identity check, its only use (FNDP-28)', () => {
    expect(app.ios.infoPlist.NSCameraUsageDescription).toMatch(/pièce d'identité/);
    expect(picker[1].cameraPermission).toBe(app.ios.infoPlist.NSCameraUsageDescription);
  });

  it('explains the photo library and refuses the microphone', () => {
    expect(picker[1].photosPermission).toMatch(/photos/);
    expect(picker[1].microphonePermission).toBe(false);
  });

  it('asks for no location (distances come from a postal code)', () => {
    const keys = Object.keys(app.ios.infoPlist ?? {});
    expect(keys.filter((k) => k.startsWith('NSLocation'))).toEqual([]);
    expect(app.android.permissions.some((p: string) => /LOCATION/.test(p))).toBe(false);
  });
});
