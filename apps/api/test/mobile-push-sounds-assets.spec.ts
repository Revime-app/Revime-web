import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PUSH_SOUND_KEYS, pushSoundFile } from '@revime/shared';

/**
 * `CF4-36`. The app bundles the client's five sounds. A file listed but missing, or present but
 * unlisted, plays the system default on a device with no error anywhere - so the assets folder,
 * `app.json` and the shared list are pinned together here. apps/mobile has no test harness, hence
 * a source scan. Spec docs/superpowers/specs/2026-10-02-cf4-36-notification-sounds-design.md §5-§6.
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MOBILE = join(ROOT, 'apps/mobile');
const SOUNDS = join(MOBILE, 'assets/sounds');
const ORIGINALS = join(ROOT, 'assets/originals/sounds');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|js|json)$/.test(name)) out.push(p);
  }
  return out;
}

function notificationsPluginSounds(): unknown {
  const appJson = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8'));
  const plugin = (appJson.expo.plugins as unknown[]).find(
    (p) => Array.isArray(p) && p[0] === 'expo-notifications',
  ) as [string, { sounds?: string[] }] | undefined;
  return plugin?.[1]?.sounds;
}

describe('mobile push sound assets (CF4-36)', () => {
  it('every sound file is bundled', () => {
    for (const k of PUSH_SOUND_KEYS) {
      const p = join(SOUNDS, pushSoundFile(k));
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(0);
    }
  });

  it('app.json lists exactly the five', () => {
    expect(notificationsPluginSounds()).toEqual(
      PUSH_SOUND_KEYS.map((k) => './assets/sounds/' + pushSoundFile(k)),
    );
  });

  it('placeholder gone', () => {
    expect(existsSync(join(SOUNDS, 'revime.wav'))).toBe(false);
    const files = [
      join(MOBILE, 'app.json'),
      ...sourceFiles(join(MOBILE, 'src')),
      ...sourceFiles(join(MOBILE, 'app')),
    ];
    for (const f of files) {
      expect(readFileSync(f, 'utf8').includes('revime.wav'), f).toBe(false);
    }
  });

  it('push.ts wiring', () => {
    const src = readFileSync(join(MOBILE, 'src/lib/push.ts'), 'utf8');
    expect(src).toContain('PUSH_SOUND_CAPABILITY');
    expect(src).toContain('PUSH_SOUND_KEYS');
    expect(src).toContain('PUSH_SOUND_CHANNEL_NAME');
    expect(src).toContain("deleteNotificationChannelAsync('revime')");
    expect(src).not.toMatch(/sound:\s*["']revime["']/);
  });

  it("bundled files are the client's originals", () => {
    for (const k of PUSH_SOUND_KEYS) {
      const name = pushSoundFile(k);
      const bundled = readFileSync(join(SOUNDS, name));
      const original = readFileSync(join(ORIGINALS, name));
      expect(bundled.equals(original), name).toBe(true);
    }
  });
});
