import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  mutateStyles,
  mutateManifest,
  copyBrandLogoDrawable,
} from '../plugins/withStripeIdentityAndroid';

const tmpDirs: string[] = [];
function makeProject(withIcon: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-android-'));
  tmpDirs.push(root);
  const projectRoot = path.join(root, 'app');
  const platformProjectRoot = path.join(projectRoot, 'android');
  fs.mkdirSync(path.join(projectRoot, 'assets'), { recursive: true });
  if (withIcon) {
    fs.writeFileSync(path.join(projectRoot, 'assets', 'icon.png'), 'png-bytes');
  }
  return { projectRoot, platformProjectRoot };
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('copyBrandLogoDrawable', () => {
  it('copies assets/icon.png to res/drawable/revime_brand_logo.png, creating the directory', () => {
    const dirs = makeProject(true);

    copyBrandLogoDrawable(dirs);

    const target = path.join(
      dirs.platformProjectRoot,
      'app/src/main/res/drawable/revime_brand_logo.png'
    );
    expect(fs.readFileSync(target, 'utf8')).toBe('png-bytes');
  });

  it('throws instead of warning when the icon is missing, because Android would crash at runtime without the drawable', () => {
    const dirs = makeProject(false);

    expect(() => copyBrandLogoDrawable(dirs)).toThrow(/Icon file not found/);
    expect(fs.existsSync(path.join(dirs.platformProjectRoot, 'app'))).toBe(
      false
    );
  });
});

describe('withStripeIdentityAndroid config plugin', () => {
  it('updates AppTheme parent to Theme.MaterialComponents.DayNight.NoActionBar', () => {
    const mockStyles = {
      resources: {
        style: [
          {
            $: {
              name: 'AppTheme',
              parent: 'Theme.AppCompat.Light.NoActionBar',
            },
          },
        ],
      },
    };

    const mutated = mutateStyles(mockStyles);
    expect(mutated.resources.style[0].$.parent).toBe(
      'Theme.MaterialComponents.DayNight.NoActionBar'
    );
  });

  it('creates AppTheme if it does not exist', () => {
    const mockStyles = {
      resources: {
        style: [],
      },
    };

    const mutated = mutateStyles(mockStyles);
    expect(mutated.resources.style.length).toBe(1);
    expect(mutated.resources.style[0].$.name).toBe('AppTheme');
    expect(mutated.resources.style[0].$.parent).toBe(
      'Theme.MaterialComponents.DayNight.NoActionBar'
    );
  });

  it('adds CAMERA permission and feature to AndroidManifest if missing', () => {
    const mockManifest = {
      'uses-permission': [],
      'uses-feature': [],
    };

    const mutated = mutateManifest(mockManifest);
    const permissions = mutated['uses-permission'];
    const features = mutated['uses-feature'];

    expect(
      permissions.some(
        (p: any) => p.$ && p.$['android:name'] === 'android.permission.CAMERA'
      )
    ).toBe(true);

    expect(
      features.some(
        (f: any) => f.$ && f.$['android:name'] === 'android.hardware.camera'
      )
    ).toBe(true);
  });

  it('does not duplicate CAMERA permission if already present', () => {
    const mockManifest = {
      'uses-permission': [
        {
          $: {
            'android:name': 'android.permission.CAMERA',
          },
        },
      ],
      'uses-feature': [
        {
          $: {
            'android:name': 'android.hardware.camera',
            'android:required': 'false',
          },
        },
      ],
    };

    const mutated = mutateManifest(mockManifest);
    const cameraPerms = mutated['uses-permission'].filter(
      (p: any) => p.$ && p.$['android:name'] === 'android.permission.CAMERA'
    );
    expect(cameraPerms.length).toBe(1);

    const cameraFeatures = mutated['uses-feature'].filter(
      (f: any) => f.$ && f.$['android:name'] === 'android.hardware.camera'
    );
    expect(cameraFeatures.length).toBe(1);
  });
});
