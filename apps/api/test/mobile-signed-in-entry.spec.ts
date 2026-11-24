import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { enterSignedInApp } from '@revime/shared';

/**
 * CF4-47. After sign-in / sign-up, a left-to-right swipe from the tabs went back to the
 * signup / login screens. The root Stack is flat (no `(auth)/_layout`), so every onboarding
 * screen sits in it, and `router.replace('/(tabs)')` swaps ONLY the top entry - the welcome,
 * roles, signup and verification screens stayed underneath. `enterSignedInApp` empties the
 * stack first. apps/mobile has no test harness, so the rule lives in shared and the call sites
 * are pinned by source below.
 */
function fakeRouter(stackDepth: number) {
  const calls: string[] = [];
  return {
    calls,
    canDismiss: () => stackDepth > 1,
    dismissAll: () => calls.push('dismissAll'),
    replace: (href: string) => calls.push(`replace:${href}`),
    push: (href: string) => calls.push(`push:${href}`),
  };
}

describe('enterSignedInApp (CF4-47)', () => {
  it('empties the stack before replacing, so nothing is left to swipe back to', () => {
    const r = fakeRouter(4);
    enterSignedInApp(r, '/(tabs)');
    expect(r.calls).toEqual(['dismissAll', 'replace:/(tabs)']);
  });

  it('skips dismissAll when the screen is already the only one in the stack', () => {
    const r = fakeRouter(1);
    enterSignedInApp(r, '/(tabs)');
    expect(r.calls).toEqual(['replace:/(tabs)']);
  });

  it('pushes a follow-up screen above the new root (réparateur → statut-verification)', () => {
    const r = fakeRouter(3);
    enterSignedInApp(r, '/(tabs)', '/statut-verification');
    expect(r.calls).toEqual(['dismissAll', 'replace:/(tabs)', 'push:/statut-verification']);
  });
});

describe('signed-in entry call sites (CF4-47)', () => {
  const mobile = fileURLToPath(new URL('../../mobile/', import.meta.url));
  const authDir = join(mobile, 'app', '(auth)');
  const files = [
    ...readdirSync(authDir).filter((f) => f.endsWith('.tsx')).map((f) => join(authDir, f)),
    join(mobile, 'app', 'verification.tsx'),
    join(mobile, 'src', 'lib', 'repairer-entry.ts'),
  ];

  it.each(files)('%s never enters the app with a bare router.replace', (file) => {
    const src = readFileSync(file, 'utf8');
    // `/(tabs)` or the computed `next` from afterSocialSignIn - both are signed-in destinations.
    expect(src).not.toMatch(/router\.replace\(\s*(['"`]\/\(tabs\)|next\b)/);
  });
});
